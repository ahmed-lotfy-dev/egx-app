# Stock Charts (Telda-style: line/candles + 1D intraday)

## 1. What

The stock-detail price chart (`apps/mobile/src/components/PriceChart.tsx`) is a Telda-style chart with two switchable views:

- **Line mode** (default): smooth gradient line colored by period trend (green if the last close ≥ first close, red otherwise) with a fading area fill.
- **Candles mode**: OHLC candlesticks — wick spans high→low, body spans open→close, each bar colored by direction (up green / down red); volume bars follow each candle's direction.
- **Mode toggle**: two icon buttons in the chart header (`stats-chart` line, `bar-chart` candles). The choice persists per device (`egx.chartMode`, SecureStore) and works for guests.
- **Touch crosshair**: vertical hairline, dot on the line, a price bubble pinned to the top (clamped to the plot edges) — the bubble replaces right-axis labels.
- **Scrub readout** above the chart while dragging: date, change vs the previous session, price, volume.
- **Volume bars** in a subtle strip below the price area (18% opacity).
- **Baseline** dashed at the period's opening close for instant trend orientation.
- **Pivot / R1 / S1 level lines** kept as clean dashed lines with small labels.
- Timeframe pills (**1D**/1W/1M/3M/6M/1Y, **1D is the default**) select `?range=` on `GET /api/instruments/{ticker}/history`.
- **1D intraday**: 5-minute bars of the latest Cairo session, x-axis labelled with Cairo clock times; polled every 60s while the screen is open (Thndr-style live feel). A localized caption under the chart (`stock.chartNoteIntraday`, "تغيرات السعر خلال جلسة اليوم — تحديث كل دقيقة") explains that 1D shows today's session updating every minute, so the sparse after-hours 1D chart is not mistaken for missing data.

## 2. Why

- The old candlestick rendered 1px-thin "light" candles that were hard to read and had no crosshair feedback — user feedback: "the indicators/light candles not working well; do what Telda and similar apps do."
- The chart returned `null` for instruments with fewer than 2 bars, so newly-listed stocks (e.g. KORA) showed nothing at all.

## 3. The data problem behind the empty chart (root cause)

Yahoo Finance does not carry several EGX listings: `KORA.CA` returns *"No data found, symbol may be delisted"* — KORA simply has no Yahoo symbol at all. Other tickers (BONY, VERT, KRDI, GOUR, CPME, …) "succeeded" with a single bar. The chart needs ≥2 bars, hence blank charts.

**Fix — TradingView daily bars** (`apps/worker/src/providers/tradingview.ts`):

- Implemented `fetchDailyBars` over TradingView's unofficial chart websocket (`wss://data.tradingview.com/socket.io/websocket`, `Origin: https://www.tradingview.com`):
  1. `set_auth_token(unauthorized_user_token)`
  2. `chart_create_session`
  3. `resolve_symbol` with `={"symbol":"EGX:TICKER","adjustment":"splits"}`
  4. `create_series` → collect `$prices` bars from `du`/`timescale_update` packets until `series_completed`
- Messages use TV's `~m~<len>~m~` framing; `~h~N` heartbeats are echoed back.
- Bars are `[unixSeconds, o, h, l, c, v]`; the Cairo trading date comes from `cairoDate()`.
- `apps/worker/src/jobs/bars.ts` now tries Yahoo first and **falls back to TradingView whenever Yahoo fails or returns <2 bars** (per-ticker, keyed on `tv_symbol`).

## 3b. 1D intraday bars (on-demand + cache)

Daily bars in Postgres cannot answer "today" cheaply, so 1D is fetched live and cached:

- Shared TV websocket client moved to `apps/api/src/lib/tradingview-history.ts` (`tvHistory(symbol, resolution, count)`; resolutions `"D" | "1" | "5" | "15" | "30" | "60"`), exported as `@egx/api/tradingview-history`. The worker's `tradingview.ts` provider now imports it (`tvDailyBars` removed).
- `apps/api/src/lib/intraday.ts` (`getIntradayBars`): **TradingView `"5"` first** (reliable for every EGX listing with a `tv_symbol`), **Yahoo 5m fallback**; result filtered to the **last Cairo session only** (`cairoDate`) so 1D shows a single day; in-memory cache **4 minutes**, keyed by ticker; on upstream failure the previous cached bars are served instead of nothing.
- `GET /api/instruments/{ticker}/history?range=1D`: range enum is now `["1D","1W","1M","3M","6M","1Y"]` with **default `"1D"`**; the 1D branch returns intraday bars (`date` = ISO timestamp), while `stats`/`levels` are still computed from daily bars. `stale` = last bar older than ~30 min (expected outside market hours).
- No new table and no per-instrument worker scrape: the API fetches on demand, the mobile app polls every 60s. ~52 bars per session observed (KORA, COMI).

## 4. When

- Bars sync (`bars` job / CLI) runs per instrument: Yahoo → TV fallback. KORA now has its full listing history (96 bars since 2026-06), GOUR 173, BONY 312 — backfilled to production.
- The chart itself is client-side only; it renders whatever `/history` returns and no longer blanks out on thin data.
- 1D intraday is fetched on demand with a 4-minute cache — no scheduler change needed.

## 5. Implementation notes

- No new dependencies: the curve is a Catmull-Rom spline emitted as cubic beziers on `react-native-svg` (`Defs`/`LinearGradient`/`Path`).
- The plot is always LTR (`direction: "ltr"` on the container) regardless of app locale; dates are formatted per locale.
- `priceBasis: "adjusted"` (split-adjusted) with `adjClose = close` for TV bars; `source: "tradingview"` distinguishes them from Yahoo rows.

## 6. Testing

- [x] `bars --tickers KORA,GOUR,BONY` locally → 581 bars, source `tradingview`
- [x] Production backfill: 39 instruments, 19,107 bars, 0 failures
- [x] `GET /history?range=1D` locally → 52 bars, single session (2026-10-29), source `tradingview`, for both KORA and COMI
- [x] `?range=3M` unchanged (daily bars) after the enum/default change
- [x] `bun run typecheck` (api + worker + mobile) green; `contracts:check` green

## 7. Known Limitations / Next

| Item | Status |
|---|---|
| Intraday (1D) chart | ✅ shipped — on-demand TV/Yahoo 5m + 4-min API cache; line/candles toggle |
| 1D during market hours | `stale` reflects >30 min without a new bar; outside hours it is expected |
| Intraday ranges beyond 1D (e.g. 5D intraday) | not built — add a resolution + session-count parameter if needed |
| ~32 tickers still 0 bars | suspended listings TradingView itself does not chart; the app shows the "insufficient history" state |
| ~~Scheduler~~ | ✅ shipped — see `docs/features/ingest-scheduler.md` |
