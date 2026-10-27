# Stock Detail Screen — Design

Date: 2026-10-27
Status: Approved
Branch: `feat/m3-stock-detail`

## 1. Summary

Add a single-stock screen opened from the Markets list and movers. It shows the
quote, an OHLC candlestick chart, support and resistance levels, key price stats,
available fundamentals, a future AI analysis call to action, and news linked to
that stock. It extends the existing market API and worker; it does not add a
trading or recommendation feature.

## 2. Scope

In scope:

- Route `/(app)/stock/[ticker]`, opened from any Markets instrument or mover row.
- Quote header with names, ticker, sector, price, change, as-of, source, and stale
  state.
- Candlestick chart with `1W`, `1M`, `3M`, `6M`, `1Y` ranges and a scrub readout.
- Support/resistance card using pivot points and 20-day/52-week ranges.
- Key price stats: open, high, low, previous close, volume, market cap, 52-week
  high/low, 20-day average volume.
- Fundamentals card: P/E, P/B, EPS, ROE, ROA, dividend yield, debt/equity, net
  margin, current ratio, beta, revenue TTM, net income TTM, free cash flow TTM.
- AI analysis button with a `قريبًا` state. The AI engine itself is out of scope.
- Per-stock news section with source, time, title, and external link.
- Coverage notice when the stored history is thin.
- Arabic-first copy with a full English translation.

Out of scope:

- Watchlist, alerts, positions, peers, News tab, and AI implementation.
- Intraday bars, real-time streaming, and recommendations.
- Filling missing fundamentals or news with placeholder values.

## 3. Screen layout

Top to bottom in one `ScrollView`:

1. Header: back button, monogram/logo, Arabic name, English name and ticker,
   sector chip, price, change, as-of time, source, stale badge.
2. Chart card: range tabs, candlesticks, crosshair, selected-bar readout.
3. Support/resistance card: `S2`, `S1`, `P`, `R1`, `R2`, 20-day high/low, 52-week
   high/low, and a one-line method note.
4. Key stats grid: two columns, missing values render `غير متاح`.
5. Fundamentals card: grouped valuation, profitability, and financial health
   rows, with source and observation date.
6. AI analysis card: gold-accented button, `قريبًا` badge, opens an explanatory
   sheet. The sheet lists the inputs (quote, chart, levels, fundamentals, news)
   and states that the output is not investment advice.
7. News section: up to 10 linked headlines. Each row shows source, relative time,
   title, and an external-link icon. Tapping opens the article in the browser.
8. Coverage/disclaimer footer.

States:

- Loading skeleton for the header and chart.
- Error card with retry for the detail and history queries.
- Empty history: show the latest stored bar if present and a clear note; hide the
  chart when fewer than two bars exist.
- No fundamentals: `البيانات المالية غير متاحة لهذا السهم`.
- No news: `مفيش أخبار مرتبطة بالسهم دلوقتي`.
- Stale quote: amber badge with the as-of time.

## 4. Data model

### `fundamentals`

One current row per instrument and source.

- `instrument_id bigint` references `instruments`; primary key
  `(instrument_id, source)`.
- `source text not null`.
- `as_of date` (scan date).
- `observed_at timestamptz not null`.
- `currency text`.
- Nullable numerics: `market_cap`, `pe`, `pb`, `eps`, `roe`, `roa`,
  `debt_to_equity`, `dividend_yield`, `revenue_ttm`, `net_income_ttm`,
  `fcf_ttm`, `current_ratio`, `beta`, `gross_margin`, `net_margin`,
  `total_debt`, `total_assets`, `book_value_per_share`, `ev_ebitda`.
- `raw jsonb`.

Missing values stay null. Absolute money fields are EGP from the TradingView scan
endpoint only.

### `news_items`

- `id bigserial` primary key.
- `source text not null` (`arabfinance` for this milestone).
- `lang text not null` (`ar` or `en`).
- `title text not null`.
- `summary text`.
- `url text not null unique` (canonical URL).
- `published_at timestamptz not null`.
- `category text`.
- `content_hash text not null`.
- `fetched_at timestamptz not null default now()`.

Index on `published_at desc`.

### `news_instrument_links`

- `news_id bigint` references `news_items` on delete cascade.
- `instrument_id bigint` references `instruments` on delete cascade.
- `match_type text not null` (`ticker` or `name`).
- `match_score integer not null default 0`.
- Primary key `(news_id, instrument_id)`.
- Index on `(instrument_id, news_id)`.

## 5. API

### `GET /api/instruments/:ticker/history?range=1W|1M|3M|6M|1Y`

- Default range `3M`.
- Returns bars ascending by date, limited to the range cutoff.
- Response `data`: `DailyBar[]`.
- Response `stats`: `barCount` (total stored), `rangeBarCount` (returned),
  `firstDate`, `lastDate`, `high20`, `low20`, `high52w`, `low52w`,
  `avgVolume20`.
- Response `levels`: `pivot`, `r1`, `r2`, `s1`, `s2`, `r3`, `s3`, `asOf`,
  `basis`. Null when fewer than one usable bar exists.
- `meta`: `asOf`, `source` (`yahoo`), `stale`, `universeAsOf`.
- 404 when the ticker is unknown.
- `stale` is true when the last stored bar is older than 5 calendar days.

### `GET /api/instruments/:ticker`

Extend the existing detail response with `fundamentals` (nullable). The object
carries its own `source`, `asOf`, and `observedAt` alongside the values.

### `GET /api/instruments/:ticker/news?limit=10&lang=ar|en`

- Preferred language from `lang`; fall back to the other language when the
  preferred one has no linked items.
- Returns `data`: `NewsItem[]` newest first.
- Each item: `id`, `source`, `lang`, `title`, `summary`, `url`, `publishedAt`,
  `matchType`.
- `meta`: `asOf`, `source`, `stale`, `lang`, `fallback`.
- `limit` is clamped to 1–20.

## 6. Worker jobs

### `sync:fundamentals`

- TradingView `/egypt/scan`, English, columns: name, description, currency,
  close, market cap, P/E, EPS, P/B, ROE, ROA, debt/equity, dividend yield,
  revenue TTM, net income TTM, FCF TTM, current ratio, beta, gross margin,
  net margin, total debt, total assets, book value per share, EV/EBITDA.
- Upsert one row per instrument matched by ticker.
- Record an `ingest_runs` row with `job = fundamentals`.
- Missing values remain null.

### `sync:news`

- Fetch Arab Finance RSS categories 1–10 in English and Arabic (20 feeds).
- Parse `title`, `description`, `link`, and `updated`/`pubDate`.
- Canonicalize URLs, dedupe by URL and content hash.
- Match articles to instruments with conservative aliases:
  - full normalized name after removing legal suffixes,
  - name before ` - `,
  - parenthetical alias (for example `CIB`),
  - exact ticker with word boundaries.
- Aliases must be at least 8 characters and two tokens, except tickers of at
  least three characters. Generic single words are rejected.
- Store only headline, summary, source, language, category, URL, and timestamp.
- Record an `ingest_runs` row with `job = news`.

`sync:all` order: universe → symbols → bars → quotes → fundamentals → news.

## 7. Support and resistance

Computed server-side from the latest stored bar:

```
P  = (high + low + close) / 3
R1 = 2P - low
S1 = 2P - high
R2 = P + (high - low)
S2 = P - (high - low)
R3 = high + 2 * (P - low)
S3 = low - 2 * (high - P)
```

- `high20`/`low20` from the last 20 bars.
- `high52w`/`low52w` from the last 250 bars.
- Values are raw closes; the basis is recorded as `raw`.
- The UI labels the card `مستويات محسوبة من آخر جلسة — ليست توصية`.
- The chart draws `S1`, `P`, and `R1` as dashed lines; the card lists all levels.

## 8. Chart

- Custom `react-native-svg` candlestick component.
- Time flows left to right; the chart container forces LTR so RTL does not mirror
  the time axis.
- Y domain covers the visible lows/highs plus `S1`/`P`/`R1` when they fall inside
  a 10% padding band.
- Wicks use high/low; bodies use open/close. When `open` is null, the body uses
  the close.
- Up candles use `colors.up`, down candles `colors.down`.
- Touch and drag select the nearest bar; a crosshair and a compact readout show
  date, open, high, low, close, and volume.
- If fewer than two bars exist, the chart is replaced by a coverage card.
- Range tabs refetch the history endpoint.

## 9. AI call to action

- A card with a sparkles icon, title `تحليل فني ومالي بالذكاء الاصطناعي`, body
  describing the inputs, and a `قريبًا` badge.
- Pressing it opens a modal sheet with the planned inputs and a disclaimer. It
  does not call a model or produce analysis.
- The copy must not promise buy/sell instructions.

## 10. Locale and RTL

- All copy in `ar.json` and `en.json` with key parity.
- Numbers use Latin digits; signed values keep the existing LRI/PDI isolation.
- Dates use Cairo time and the current locale.
- The chart stays LTR internally; surrounding cards follow the app direction.
- Avoid Arabic copy starting with `كل ` because of the known IBM Plex shaping
  bug; use `جميع` instead.

## 11. Verification

- API curls: COMI full history, ACAP single-bar case, unknown ticker 404,
  fundamentals for COMI and a stock without fundamentals, news for a matched and
  an unmatched ticker.
- Emulator: Markets row → stock screen → back; all range tabs; scrub; Arabic RTL
  and English LTR; sparse history; no news; AI sheet.
- `bun run typecheck`, `bun run contracts:check`, locale JSON validation, and
  gitleaks before commit.
- Update README and add a discovery note for the fundamentals/news coverage.
