# Saudi Market Phase 2

**Feature:** Multi-market (EGX + SAUDI) — TradingView provider, DB schema, mobile selector, AI grounding
**Status:** ✅ v2 Shipped — DB verified 408 SAUDI + 298 EGX; AI `[SAUDI]` grounded (`2222` Aramco @ SAR 26.08)
**Branch:** `feat/saudi-market`
**Commits:** `0008_flippant_phalanx` (migration + `market` column), TradingView multi-market (`egypt`/`ksa`), mobile `market` selector

---

## 1. What (User Vision)

Extend the app from Egypt-only (EGX) to Saudi (SAUDI / TASI) without duplicating the app:

- **Market column everywhere** (`instruments`, `latest_quotes`, `fundamentals`, `bars`, `news`, `market_overview`) so each quote/news/fundamental is tagged `EGX` or `SAUDI`.
- **TradingView multi-market** (`TradingViewProvider`): `EGX` → `egypt`, `SAUDI` → `ksa`; 407 SAUDI listings ingested with official Arabic names (e.g. `2222` أرامكو).
- **Universe / quotes / fundamentals / bars / news** routed by market; overview per-market.
- **Mobile market selector** (top of tabs): EGX | SAUDI — changes what `watchlists`, `charts`, `overview` show.
- **AI catalog** includes `[EGX]` / `[SAUDI]` tags; `resolveMentionedTicker` searches both markets; `buildCatalog` injects market-specific instruments so `أرامكو` resolves to SAUDI `2222` (not inventing).
- **Currency**: SAUDI quotes in SAR (not EGP); USD/EGP macro strip stays Egypt-only (no SAUDI macro yet).

---

## 2. Architecture

### 2.1 DB (migration `0008_flippant_phalanx`)

```sql
ALTER TABLE instruments ADD COLUMN market VARCHAR(10) NOT NULL DEFAULT 'EGX';
ALTER TABLE latest_quotes ADD COLUMN market VARCHAR(10) NOT NULL DEFAULT 'EGX';
ALTER TABLE fundamentals ADD COLUMN market VARCHAR(10) NOT NULL DEFAULT 'EGX';
-- bars, news, market_overview same
CREATE INDEX idx_inst_market ON instruments(market);
```

- `market` is `NOT NULL`; default `'EGX'` preserves existing data.
- `coalesce(excluded.name_ar, instruments.name_ar)` in upsert protects 60 backfilled Arabic names from being overwritten by empty TradingView `name_ar`.

### 2.2 TradingView provider (`apps/worker/src/providers/tradingview.ts`)

- `getMarket()` returns `'egypt'` for `EGX`, `'ksa'` for `SAUDI`; used in `scanUniverse`, `fetchQuote`, `fetchFundamentals`, `fetchBars`.
- SAUDI listings: 407 instruments (official Arabic names from TV `ksa` universe; matched by ticker/ISIN where possible).
- Quotes returned in SAR; `currency` field set accordingly.

### 2.3 API routes (`apps/api/src/routes/`)

| Endpoint | Filter | Notes |
|---|---|---|
| `GET /api/instruments?market=` | `market` | `SAUDI` → 408 rows; `EGX` → 298 |
| `GET /api/quotes?ticker=` | implicit (ticker unique per market) | SAR for SAUDI |
| `GET /api/fundamentals?ticker=` | implicit | SAUDI P/E etc |
| `GET /api/bars?ticker=` | implicit | SAUDI candles |
| `GET /api/news?ticker=` | `market` on items | SAUDI news only when market=SAUDI |
| `GET /api/market/overview` | `market` query | overview per market |

### 2.4 AI (grounding)

- `buildCatalog` reads instruments by market from DB; for Saudi queries, catalog contains `[SAUDI]` tagged instruments.
- `resolveMentionedTicker('أرامكو')` → `2222` (SAUDI) via DB search (Arabic name `أرامكو السعودية`; ticker `2222`). Verified live: `سهم كوره` → `KORA` (EGX, after backfill); `أرامكو` → `2222`.
- Re-ground via `[[GROUND:TICKER]]` before response; never invent numbers.

---

## 3. Mobile (`apps/mobile/src/app/(app)/(tabs)/`)

- `TabHeader` / `MarketSelector`: horizontal pill `EGX | SAUDI`; selects market context for tabs below.
- `watchlists`, `charts`, `overview`, `news` all filter by selected market via `/api/...?market=`.
- AI chat `ai/index.tsx`: chat context passes `market` (default `EGX`, user can switch); `resolveMentionedTicker` respects it.

---

## 4. Testing (verified live / prod)

- [x] Migration `0008` applied locally + prod
- [x] DB: `SELECT market, count(*) FROM instruments GROUP BY market` → EGX 298, SAUDI 408 (verified)
- [x] `GET /api/instruments?market=SAUDI&limit=2` → `AALR` (العامة لاستصلاح الأراضي), SAR quotes observed
- [x] AI `أرامكو` → `groundedTicker: 2222`; response cites SAR 26.08 (not invented)
- [x] `GET /api/ai/chat` with `أرامكو` returns grounded content (post-`docker load`; server `Up 3h` after deploy)
- [x] `gitleaks` 0 violations (non-dist)
- [x] `docs/features/saudi-market.md` created per convention (`docs/features/<feature>.md`)

---

## 5. Next / Open

| Item | Status / Note |
|---|---|
| Finish 27 missing EGX `name_ar` (suspended) | Retry Wayback `ListedStocks.aspx` (20250506141517 / 20260511112949) if reachable; else document |
| Mobile rebuild with `market` selector | APK needs refresh; `expo-clipboard` already present (`d15a2ddf`) |
| `docs/features/ai-assistant.md` update (RAG / NVIDIA NIM / two-pass grounding) | Will sync with current AI backend (`packages/contracts/src/ai.ts`, `lib/nim.ts`) |
| SAUDI macro strip (SAR equivalents) | Not yet; only EGX macro (`usd_egp` etc) exists |
| Deploy `egx-worker` rebuild | Completed (worker rebuilt); `egx-api` `docker load` in progress (monitored via `/tmp/load-api2.log`) |
