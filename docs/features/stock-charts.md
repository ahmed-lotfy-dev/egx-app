# Stock Charts (Telda-style redesign)

## 1. What

The stock-detail price chart (`apps/mobile/src/components/PriceChart.tsx`) was redesigned from a sparse candlestick view to a Telda-style smooth price chart:

- **Smooth gradient line** colored by period trend (green if the last close ≥ first close, red otherwise) with a fading area fill.
- **Touch crosshair**: vertical hairline, dot on the line, a price bubble pinned to the top (clamped to the plot edges) — the bubble replaces right-axis labels.
- **Scrub readout** above the chart while dragging: date, change vs the previous session, price, volume.
- **Volume bars** in a subtle strip below the price area (18% opacity, trend-colored).
- **Baseline** dashed at the period's opening close for instant trend orientation.
- **Pivot / R1 / S1 level lines** kept as clean dashed lines with small labels.
- Timeframe pills (1W/1M/3M/6M/1Y) live in the stock screen and select `?range=` on `GET /api/instruments/{ticker}/history`.

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

## 4. When

- Bars sync (`bars` job / CLI) runs per instrument: Yahoo → TV fallback. KORA now has its full listing history (96 bars since 2026-06), GOUR 173, BONY 312 — backfilled to production.
- The chart itself is client-side only; it renders whatever `/history` returns and no longer blanks out on thin data.

## 5. Implementation notes

- No new dependencies: the curve is a Catmull-Rom spline emitted as cubic beziers on `react-native-svg` (`Defs`/`LinearGradient`/`Path`).
- The plot is always LTR (`direction: "ltr"` on the container) regardless of app locale; dates are formatted per locale.
- `priceBasis: "adjusted"` (split-adjusted) with `adjClose = close` for TV bars; `source: "tradingview"` distinguishes them from Yahoo rows.

## 6. Testing

- [x] `bars --tickers KORA,GOUR,BONY` locally → 581 bars, source `tradingview`
- [x] Production backfill: 39 instruments, 19,107 bars, 0 failures
- [x] `bun run typecheck` (api + worker + mobile) green

## 7. Known Limitations / Next

| Item | Status |
|---|---|
| Intraday (1D) chart | not built — TV websocket supports minute resolutions, but the API stores daily bars only; needs a new table/endpoint |
| ~6 tickers still <10 bars | genuinely new listings with no history yet |
| Scheduler | bars only refresh when the worker runs (scheduler still pending) |
