# Watchlists Feature

**Feature Name:** Watchlists (M5 Milestone)
**Status:** ✅ v1 Shipped — v2 (custom lists) planned
**Branch:** `feat/m3-stock-detail`
**Commits:** `2395dac` (v1 mobile + API), watchlist fixes (this change)
**Docs convention:** this file is the single source of truth for the feature.

---

## 1. What (User Vision)

Arabic-first watchlists tab where the trader can browse curated groups of EGX stocks:

- **Index lists**: EGX30, EGX70, EGX100 — ranked by **market cap** (proxy until official index constituents are available).
- **Sector lists**: one list per sector (22 sectors), auto-derived from instrument data.
- **Sharia list (EGX33)**: placeholder until sharia screening data exists (user paused the sharia feature pending research on MuslimXchange — refused to pay, refused scraping kasheif.com).
- Tap any stock → stock detail screen (`/(app)/stock/[ticker]`).
- v2 (planned): user-created custom lists (add/remove tickers), requires auth.

## 2. Why

- Traders need fast grouped views of the market without searching ticker by ticker.
- Predefined lists give instant value with zero user setup; they showcase live quotes across the app.
- Sector lists map 1:1 to the `instruments.sector` column, so they stay in sync automatically as the universe grows.

## 3. How (Architecture)

### 3.1 API — `GET /api/watchlists/predefined`

File: `apps/api/src/routes/watchlist.ts`

- Single endpoint, **no DB table for lists** — lists are computed on the fly:
  1. Query all active `instruments` LEFT JOIN `latest_quotes`, ordered by `market_cap DESC`.
  2. Group by `sector` → sector lists (`id: sector:<slug>`).
  3. Market-cap ranking → `egx30` (top 30), `egx70` (31–100), `ewi` (top 100 = "EGX100").
  4. Static `egx33_sharia` placeholder (empty, `type: "sharia"`).
- `meta.asOf` = newest `latest_quotes.as_of` timestamp (real data freshness, not server clock).
- Contracts: `PredefinedWatchlistsResponseSchema` in `packages/contracts/src/market.ts`.

**Why computed instead of stored?** No admin UI exists yet; deriving from `instruments`/`latest_quotes` means lists are always consistent with the data we already ingest. When official EGX30 constituents become available, we add a `watchlist_definitions` table and keep the same response shape.

### 3.2 Mobile

- `apps/mobile/src/app/(app)/(tabs)/watchlist.tsx` — tab screen:
  - Two sections: المؤشرات (index + sharia) and القطاعات (sectors).
  - Icons per list type, count per list, pull-to-refresh, 60s refetch interval.
  - Loading / error / empty states, all localized (AR default, EN parity).
- `apps/mobile/src/app/(app)/watchlist/[listId].tsx` — list detail:
  - Rows: name (locale-aware), ticker, sector, price + change% colored up/down.
  - Tap row → stock detail screen.
- Locales: `watchlist.*` keys in `apps/mobile/src/locales/ar.json` / `en.json`.

### 3.3 Data flow

```
ingest (worker) → latest_quotes (market_cap, price, as_of)
                        ↓
GET /api/watchlists/predefined  →  computed lists + live quotes
                        ↓
Mobile watchlist tab → [listId] screen → stock detail
```

## 4. When

- **v1**: shipped with commit `2395dac` (API + mobile + locales), deployed to `https://egx-api.alotfy.site`.
- **This change (fixes)**: EGX30/70/100 ranking corrected to market cap (was accidentally re-sorted by price), `asOf` now reflects real quote freshness, `useState` imports moved to top of file.
- **v2 (planned)**: custom user lists — needs `watchlists` + `watchlist_items` tables, auth (better-auth is already wired in `apps/api/src/lib/auth.ts`), CRUD routes, and mobile add/remove UI.

## 5. Known Limitations

| Limitation | Reason | Plan |
|---|---|---|
| EGX30/70/100 are market-cap proxies | Official constituent lists not ingested | ingest official constituents when source found |
| EGX33 sharia list is empty | sharia screening data not available; user paused feature | revisit after sharia research decision |
| Lists recompute per request | no admin/table yet | fine at current universe size (~200 instruments); add caching/table if it grows |
| No user custom lists yet | deferred to v2 | v2 with auth |

## 6. Testing Checklist (v1)

- [x] `GET /api/watchlists/predefined` returns 26 lists (3 index + 1 sharia + 22 sectors)
- [x] Tab screen shows both sections with counts
- [x] Tapping a list opens detail; tapping a stock opens stock detail
- [x] AR/EN locale switch works; RTL correct
- [x] Pull-to-refresh refetches quotes
- [ ] Verify EGX30 = top-30 by market cap on production after this fix (needs API redeploy)
