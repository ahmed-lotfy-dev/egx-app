# Macro Strip (USD/EGP, Oil, Gold)

## 1. What

An economy strip on the home screen plus per-user card settings:

- **Home strip** (`MacroStrip.tsx`): horizontally scrollable cards — USD/EGP, Brent, WTI, global gold (ounce), Egypt gold 24K/gram, Egypt gold 21K/gram — each with value, % change, and a relative "as of" time.
- **Settings** (Profile tab → "شريط الاقتصاد"): each user toggles which cards appear on home. Preferences persist on-device (SecureStore, same pattern as the locale store) — works for guests and signed-in users.
- **Never show old prices**: every quote carries `asOf`; anything older than 48h is flagged `stale` by the API and rendered as "—" instead of a number.

## 2. Data

Stored in `macro_quotes` (key, value, change, change_pct, currency, unit, source, as_of) — migration `0007`.

| Key | Source | Notes |
|---|---|---|
| `usd_egp` | TradingView `FX_IDC:USDEGP` | |
| `brent` | TradingView `ICEEUR:BRN1!` | USD/barrel |
| `wti` | TradingView `NYMEX:CL1!` | USD/barrel |
| `gold_oz` | TradingView `OANDA:XAUUSD` | USD/troy ounce |
| `gold_egp_24k` | **derived** | `gold_oz / 31.103474 × usd_egp` |
| `gold_egp_21k` | **derived** | 24k × 21/24 |

- One `POST scanner.tradingview.com/global/scan` request fetches all four upstream quotes.
- The Egyptian gram prices are **estimates** derived from the global ounce price and USD/EGP (no local-premium/levies) — the UI labels them accordingly; `source: "derived"`.
- Worker job `macro` (`apps/worker/src/jobs/macro.ts`, CLI `bun src/cli.ts macro`), scheduled **every 30 minutes around the clock** in `scheduler.ts`.
- API: `GET /api/macro` (public) returns quotes ordered by the canonical key order with `stale` flags.

## 3. Why / When

- The user asked for the economic essentials an Egyptian investor tracks: dollar rate, oil (knowing there are multiple grades — Brent + WTI), gold globally and locally, refreshed continuously ("every day or per the API"), never static, never stale.
- Free sources now (TradingView, matching existing infra); the job is isolated so a paid API can replace `scanGlobal` later without touching the API/mobile layers.

## 4. Testing

- [x] `macro` CLI locally → all 4 upstream quotes + 2 derived rows
- [x] `GET /api/macro` locally → correct order, `stale: false`
- [x] Migration `0007` applied to local + prod; prod seeded
- [x] `bun run typecheck` (api + worker + mobile) green; `contracts:check` green

## 5. Next

| Item | Status |
|---|---|
| Replace TradingView with a paid/dedicated FX & metals API | user may supply one; swap inside the macro job only |
| Official Egyptian gold market price (local premium) | needs a local source; currently derived estimate |
| More indicators (EUR/EGP, inflation, rates) | add a key + symbol in `MACRO_SYMBOLS` and a locale label |
