# Sharia Compliance + Macro Indicators — Design

Date: 2026-10-29
Status: Draft
Branch: `feat/m3-stock-detail`

## 1. Summary

Add two complementary features:
1. **Sharia compliance badge** on the stock screen — shows `متوافق مع الشريعة` (green) for stocks in the official EGX Sharia Index (EGX33), `غير مصنف` (gray) for others, with source + as-of date.
2. **Macro indicator strip** on the Markets screen — horizontal scrolling cards for Oil (WTI), USD/EGP, Gold, showing price, change, and source, styled like the sector strip.

Both backed by a scheduled worker container that refreshes data daily, solving the stale-production-data problem for news, quotes, bars, sharia, and macro in one place.

## 2. Scope

In scope:

- EGX Sharia Index (EGX33) constituent list ingestion from official EGX source.
- Stock screen badge: green `متوافق مع الشريعة` / gray `غير مصنف`, clickable to show source + as-of date + disclaimer.
- Macro strip under index card on Markets screen: 3 cards (Oil, USD/EGP, Gold) with price, change%, source, timestamp.
- Worker container deployed alongside API on OCI, running `sync:all` (universe → symbols → bars → quotes → fundamentals → news → sharia → macro) on a configurable cron (default daily 06:00 Cairo).
- Schema additions: `sharia_status` table, `macro_indicators` table.
- Arabic-first copy with EN translation.

Out of scope:

- Per-standard verdicts (AAOIFI, DJIM, etc.), purification amounts, zakat per share — deferred to MuslimXchange integration if needed later.
- Sharia filter chip on Markets list v1 (badge on stock screen only).
- Historical macro charts (v1 is snapshot strip only).
- Custom macro indicators beyond the three core.

## 3. Data sources

### EGX Sharia Index (EGX33)
- Official list published by EGX. Two candidate sources:
  1. EGX website index constituents page (HTML table) — parse periodically.
  2. EGX API if available (to be verified).
- Refresh: daily, aligned with EGX publication schedule (typically after market close).
- Coverage: ~33 stocks. Non-constituents default to `غير مصنف` (not "non-compliant" — important distinction).

### Macro indicators (Yahoo Finance)
| Indicator | Yahoo Symbol | Display Name (AR) | Display Name (EN) |
|-----------|--------------|-------------------|-------------------|
| WTI Crude Oil | `CL=F` | خام برنت / خام WTI | WTI Crude Oil |
| USD/EGP | `EGP=X` | دولار / جنيه | USD/EGP |
| Gold | `GC=F` | ذهب | Gold |

- Reuse existing Yahoo provider (`apps/worker/src/providers/yahoo.ts`).
- Quote endpoint gives price, change, change%, regularMarketTime.
- Store snapshot with source `yahoo`, as-of timestamp.

## 4. Screen changes

### Stock screen (add to existing M3 layout)

After the AI CTA card, before News section:

```
┌─────────────────────────────────────┐
│  🟢 متوافق مع الشريعة              │  ← green badge, clickable
│  المصدر: مؤشر الشريعة EGX33        │
│  تاريخ المراجعة: 2026-10-28         │
│  ⚠️ يستند لمؤشر EGX الرسمي فقط      │
└─────────────────────────────────────┘
```

- Green badge (`bg-up/10 border-up/30 text-up`) for EGX33 constituents.
- Gray badge (`bg-surface-elevated border-border text-text-muted`) for others: `غير مصنف`.
- Press opens a bottom sheet with: source, as-of date, disclaimer that this is based on EGX33 index membership only, not a full Sharia audit.

### Markets screen (add after index card, before breadth)

Horizontal scrolling strip (like `SectorStrip`), 3 cards:

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│  🛢 Oil   │ │  💵 USD/EGP│ │  🥇 Gold │
│  $72.45  │ │   49.85  │ │ $2,640   │
│  +1.2%   │ │  -0.3%   │ │  +0.8%   │
│  Yahoo   │ │  Yahoo   │ │  Yahoo   │
│  14:30   │ │  14:30   │ │  14:30   │
└──────────┘ └──────────┘ └──────────┘
```

- Card: icon/emoji, display name (AR/EN), price, signed change%, source, timestamp.
- Price formatting: 2 decimals for oil/gold, 4 for FX.
- Change color: green/red per existing `toneFor` logic.
- RTL: cards scroll horizontally, order preserved (Oil → USD/EGP → Gold).

## 5. Data model

### `sharia_status`

```sql
create table sharia_status (
  instrument_id bigint primary key references instruments(id) on delete cascade,
  status text not null,           -- 'compliant' | 'unclassified'
  source text not null,           -- 'egx_sharia_index'
  index_name text not null,       -- 'EGX33'
  as_of date not null,            -- EGX publication date
  fetched_at timestamptz not null default now(),
  metadata jsonb                  -- raw source row for audit
);
create index on sharia_status (status);
```

- One row per instrument. `status = 'compliant'` only for EGX33 constituents.
- `as_of` = EGX index review date (not fetch date).
- `metadata` stores the raw parsed row for traceability.

### `macro_indicators`

```sql
create table macro_indicators (
  id bigserial primary key,
  key text not null unique,       -- 'wti', 'usd_egp', 'gold'
  name_ar text not null,
  name_en text not null,
  symbol text not null,           -- yahoo symbol
  price numeric(18,4),
  change numeric(18,4),
  change_pct numeric(10,4),
  currency text,
  source text not null,           -- 'yahoo'
  as_of timestamptz not null,
  fetched_at timestamptz not null default now()
);
```

- Upsert on `key` per refresh.

## 6. API

### `GET /api/instruments/:ticker` (extend existing)

Add to response:
```json
{
  "sharia": {
    "status": "compliant" | "unclassified",
    "source": "egx_sharia_index",
    "indexName": "EGX33",
    "asOf": "2026-10-28",
    "metadata": { ... }
  }
}
```

- Null when instrument not found (404 already handled).

### `GET /api/market/macro`

New endpoint, no params:
```json
{
  "data": [
    {
      "key": "wti",
      "nameAr": "خام WTI",
      "nameEn": "WTI Crude Oil",
      "price": 72.45,
      "change": 0.86,
      "changePct": 1.20,
      "currency": "USD",
      "source": "yahoo",
      "asOf": "2026-10-28T14:30:00Z"
    },
    ...
  ],
  "meta": { "asOf": "...", "source": "yahoo" }
}
```

- Reuse `MarketMetaSchema` conventions.

## 7. Worker jobs

### `sync:sharia`

New job `apps/worker/src/jobs/sharia.ts`:

1. Fetch EGX33 constituent list (parse EGX website HTML table or API).
2. Map tickers to `instruments` (exact match on `ticker`).
3. Upsert `sharia_status`: compliant for matched, unclassified for others (or only insert compliant; unclassified = no row).
4. Record `ingest_runs` with `job = 'sharia'`, `provider = 'egx'`.

### `sync:macro`

Extend `apps/worker/src/jobs/quotes.ts` or new `macro.ts`:
- Use Yahoo provider to fetch quotes for `CL=F`, `EGP=X`, `GC=F`.
- Upsert into `macro_indicators`.
- Record `ingest_runs` with `job = 'macro'`, `provider = 'yahoo'`.

### Scheduler container

New `Dockerfile.worker` (or extend existing worker image):
- Entry point: `bun src/scheduler.ts`
- `scheduler.ts`: runs `sync:all` on cron (default `0 6 * * *` Cairo = 04:00 UTC), with jitter ±5min.
- Logs each job result to stdout + `ingest_runs`.
- Deployed as second service in `docker-compose.yml` on OCI: `egx-worker`.
- Shares same DB, env, image as API.

## 8. Locale

Arabic-first keys in `ar.json`/`en.json` under `sharia` and `macro` blocks:

```json
"sharia": {
  "compliant": "متوافق مع الشريعة",
  "unclassified": "غير مصنف",
  "source": "مؤشر الشريعة EGX33",
  "asOf": "تاريخ المراجعة",
  "disclaimer": "يعتمد على عضوية السهم في مؤشر الشريعة EGX33 الرسمي فقط، وليس تدقيقاً شرعياً شاملاً."
},
"macro": {
  "wti": { "name": "خام WTI", "nameEn": "WTI Crude Oil" },
  "usd_egp": { "name": "دولار/جنيه", "nameEn": "USD/EGP" },
  "gold": { "name": "ذهب", "nameEn": "Gold" },
  "source": "Yahoo Finance"
}
```

## 9. Verification

- Worker: `bun run sync:sharia` → `sharia_status` rows = 33 compliant, rest unclassified.
- Worker: `bun run sync:macro` → 3 rows in `macro_indicators` with fresh prices.
- API: `/api/instruments/COMI` → sharia block present, status=compliant.
- API: `/api/market/macro` → 3 items, prices non-null.
- Mobile: Stock screen shows green badge for COMI, gray for non-EGX33 stock.
- Mobile: Markets screen shows macro strip under index card, horizontal scroll works RTL/LTR.
- Scheduler: deploy `egx-worker` on OCI, verify daily run in logs + `ingest_runs`.
- Gates: `typecheck`, `contracts:check`, locale parity, gitleaks.

## 10. Rollout

1. Merge spec → implement schema + worker jobs + API routes.
2. Run worker locally against local DB → verify data.
3. Deploy API image (includes new routes) → `docker compose up -d` on OCI.
4. Deploy worker image as `egx-worker` service in same compose → starts daily cron.
5. Run one-time `sync:sharia` + `sync:macro` against production DB.
6. Build mobile → EAS update preview.
7. Verify end-to-end on emulator + production API.