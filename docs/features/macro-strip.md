# Macro Strip (USD/EGP, Oil, Gold)

## 1. What

An economy strip on the home screen plus per-user card settings:

- **Home strip** (`MacroStrip.tsx`): horizontally scrollable cards — USD/EGP, Brent, WTI, global gold (ounce), Egypt gold 24K/gram, Egypt gold 21K/gram — each with value, currency marker (ج.م / $), unit, % change, and a relative "as of" time. USD/EGP leads the strip with the single gold accent.
- **Settings** (Profile tab → "شريط الاقتصاد"): each user toggles which cards appear on home. Preferences persist on-device (SecureStore, same pattern as the locale store) — works for guests and signed-in users.
- **Never show old prices**: every quote carries `asOf`; anything older than 48h is flagged `stale` by the API and rendered as "—" instead of a number.
- **Live-ish refresh**: the worker refreshes every minute and the app polls `/api/macro` every 60s (`staleTime: 30s`), so the dollar rate tracks the market without hammering the API.

## 2. Data

Stored in `macro_quotes` (key, value, change, change_pct, currency, unit, source, as_of) — migration `0007`.

| Key | Source | Notes |
|---|---|---|
| `usd_egp` | **fxratesapi** `GET /latest?base=USD&symbols=EGP` | live FX, per-minute timestamps; jsDelivr `currency-api` fallback |
| `brent` | TradingView `ICEEUR:BRN1!` | USD/barrel |
| `wti` | TradingView `NYMEX:CL1!` | USD/barrel |
| `gold_oz` | TradingView `OANDA:XAUUSD` | USD/troy ounce |
| `gold_egp_24k` | **derived** | `gold_oz / 31.103474 × usd_egp` |
| `gold_egp_21k` | **derived** | 24k × 21/24 |

- **USD/EGP is deliberately not taken from TradingView.** Its `FX_IDC:USDEGP` feed is a static reference rate (0% change, days-old timestamp) and was visibly wrong versus Google. `fetchUsdEgp()` tries fxratesapi first (free, keyless, ~61 req/min) and falls back to the jsDelivr `@fawazahmed0/currency-api` snapshot; the winning source is stored in `source`.
- One `POST scanner.tradingview.com/global/scan` request fetches the three oil/metal quotes.
- The Egyptian gram prices are **estimates** derived from the global ounce price and USD/EGP (no local-premium/levies) — the UI labels them accordingly; `source: "derived"`.
- Worker job `macro` (`apps/worker/src/jobs/macro.ts`, CLI `bun src/cli.ts macro`), scheduled **every minute around the clock** in `scheduler.ts` (1 TV scan + 1 FX request per cycle).
- API: `GET /api/macro` (public) returns quotes ordered by the canonical key order with `stale` flags.

## 3. Why / When

- The user asked for the economic essentials an Egyptian investor tracks: dollar rate, oil (knowing there are multiple grades — Brent + WTI), gold globally and locally, refreshed continuously ("every day or per the API"), never static, never stale.
- The user then reported USD/EGP drifting from Google (55.95 in-app vs 55.74 live) and asked for minute-level updates without overloading the server. Hence the FX feed swap + 60s cadence.
- Free sources only; the job is isolated so a paid API can replace `fetchUsdEgp`/`scanGlobal` later without touching the API/mobile layers.

## 4. Testing

- [x] `macro` CLI locally → 3 upstream quotes + 1 FX + 2 derived rows; `fxSource: "fxratesapi"`
- [x] `GET /api/macro` locally → correct order, `stale: false`, `usd_egp.source = "fxratesapi"`
- [x] Migration `0007` applied to local + prod; prod seeded
- [x] `bun run typecheck` (api + worker + mobile) green; `contracts:check` green
- [x] Card layout checked on device: Arabic currency marker sits on the value baseline, units (`برميل`/`أونصة`/`جرام`) live on the label line so nothing clips at 150dp

## 5. Next

| Item | Status |
|---|---|
| Replace free FX/metals sources with a paid API | user may supply one; swap inside the macro job only |
| Official Egyptian gold market price (local premium) | needs a local source; currently derived estimate |
| More indicators (EUR/EGP, inflation, rates) | add a key + symbol in `MACRO_SYMBOLS` and a locale label |
