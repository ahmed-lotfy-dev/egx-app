# 00.07 — M2a Market Data Ingestion & RTL Spike

Probed live on 2026-10-27 against the running stack. This note records what the M2a
ingestion actually did, the provider decisions behind it, the coverage gaps, and the
Expo Go RTL findings. It is the implementation companion to
`01-market-data-apis.md`.

---

## 1. Provider split

| Job | Provider | Decision |
|---|---|---|
| Universe (instruments, Arabic names, sectors, logos) | TradingView scanner | One call returns all 296 EGX instruments. |
| Latest quotes | TradingView scanner only | Yahoo quotes were stale for EGX (2024 timestamps), so they are not used for quotes. |
| Daily bars | Yahoo Finance chart API | Requests one year of daily bars for stocks and the index when a Yahoo symbol exists; Yahoo returns less for some symbols. |

Yahoo's chart endpoint requires a **browser user agent** plus an A3 cookie and a crumb.
A custom app user agent consistently returned `429`. The worker fetches the cookie from
`fc.yahoo.com`, the crumb from `/v1/test/getcrumb`, and reuses both for the chart calls.

The TradingView quote is delayed by roughly 15 minutes; the Markets UI labels this
explicitly. The quote is still the best free source for the full EGX market.

---

## 2. Universe and quotes `[VERIFIED]`

```sh
bun run sync:universe
bun run sync:quotes
```

Stored result:

```
instruments   296   (295 stocks + EGX30)
latest_quotes 296
snapshots     296
sectors        21
```

`instruments` keeps the TradingView ticker, English and Arabic names, sector, industry,
currency, market cap, logo id, and the EGX/TradingView symbol. Quotes are written to
`latest_quotes` and appended to `quote_snapshots`.

Search works in Arabic and English because the API normalizes both the query and the
stored names (lowercase, strip diacritics, normalize alef/ya/ta marbuta). Verified:

```
GET /api/instruments?q=البنك      -> COMI, EGBE, EXPA
GET /api/instruments?q=bank       -> ADIB, CANA, COMI, EGBE, EXPA
GET /api/instruments?q=cib        -> COMI
GET /api/instruments?q=faisal     -> FAIT, FAITA
GET /api/instruments?limit=3&cursor=ABUK -> ACAMD, ACAP, ACFR
```

---

## 3. Yahoo symbol resolution `[VERIFIED]`

Not every EGX ticker is a Yahoo symbol. The resolver tries, in order:

1. the full English name,
2. the name before ` - `,
3. the first three significant name tokens,
4. the first two significant name tokens,
5. the EGX ticker.

Candidates are limited to Cairo (`exchange: "CAI"`) or `.CA` symbols and scored by token
overlap with the instrument name. A candidate must share at least one significant token;
the resolver stops early once it has a strong match. This avoids attaching a random
company with a similar ticker.

Yahoo often uses **ISIN-style** symbols rather than the EGX ticker:

```
BONY -> EGS656M1C010.CA
AIH  -> EGS21351C019.CA
ADRI -> EGS65AN1C018.CA
ALEX -> EGS3H051C012-EGP.CA
EDFM -> EGS30351C018.CA
EGSA -> EGS48022C015.CA
```

Final coverage:

```
stocks                       295
with a Yahoo symbol          249
without a Yahoo listing       46
with stored bars             245
  full history 240–243 bars   176
  single recent bar            69
without usable bars           50
  no Yahoo listing             46
  placeholder-only              4   (GPPL, MISR, SAIB, GROV)
EGX30 bars                      1   (single recent bar)
bar instruments               246   (245 stocks + EGX30)
total daily bars           42,835
```

The 46 without a Yahoo listing are mostly small caps and newly listed companies. The
resolver reports them in `ingest_runs.metadata.unresolved`; the bars job reports them as
`No Yahoo symbol for <ticker>`.

History is **bimodal**, not uniformly one year. 175 instruments have 243 bars and one has
240. The other 69 stocks and EGX30 have exactly one bar, all dated 2026-10-26 or
2026-10-27. The group includes long-listed companies with ISIN-style Yahoo symbols (for
example `ACAP`, `AIH`, `ALEX`, `EDFM`, `EGSA`, `WCDF`), so this is a Yahoo coverage
limitation rather than a new-listing artifact: the one-year job request returned only the
latest day for those symbols. The UI handles the single-point case without a sparkline.

The four placeholder-only tickers return a single bar with zero OHLC. They are stored as
an empty history rather than treated as a year of data:

- `GPPL` — Yahoo returns one zero-OHLC bar.
- `MISR` — same.
- `SAIB` — same.
- `GROV` — Yahoo returns `404` (delisted / no data).

`BIDI` initially failed on one bad day. The bars provider now validates each day and
skips only the invalid day, so `BIDI` recovered with 243 valid bars.

---

## 4. Bar validation

Yahoo's `open` equals the previous close on gap days, so an open outside the day's
high/low is not a real open. The provider:

- requires a finite, positive close;
- requires `low <= high`;
- stores `open` as `null` when it falls outside `[low, high]`;
- validates high/low/close and skips an individual invalid day with a warning;
- fails the ticker only when no usable bar remains.

This is why the coverage numbers count **instruments with bars**, not raw Yahoo rows.

### EGX30 history is unavailable

Yahoo's `^CASE30` returns only today's bar for every range and explicit period tested
(`5d`, `1mo`, `6mo`, `1y`, `5y`, `max`, and `period1`/`period2`). The TradingView history
hosts are unreachable from this machine. The overview therefore serves
`indexSparkline` from stored index bars and the UI hides the sparkline until there are at
least two points. It will appear automatically as daily bars accumulate.

---

## 5. API verification `[VERIFIED]`

```sh
curl -s 'http://localhost:3000/api/instruments?limit=5'
curl -s 'http://localhost:3000/api/instruments/COMI'
curl -s 'http://localhost:3000/api/market/overview'
curl -s 'http://localhost:3000/api/status/data'
```

`/api/market/overview` returns:

- the EGX30 summary and `indexSparkline`,
- breadth (`advancers`, `decliners`, `unchanged`, `instrumentCount`),
- the top five gainers and losers,
- 21 sector rows with change percent and breadth,
- `meta.asOf`, `meta.stale`, `meta.source`, and `meta.universeAsOf`.

`/api/status/data` returns the last run per job (`universe`, `yahoo-symbols`, `bars`,
`quotes`) and stored counts, including `barInstruments`. On the verified snapshot:

```json
{
  "instruments": 296,
  "stocks": 295,
  "indices": 1,
  "quotes": 296,
  "dailyBars": 42835,
  "barInstruments": 246
}
```

Staleness is session-aware: during the Cairo session a quote older than the freshness
window is stale; after the close the last quote is accepted. The Markets UI showed the
stale treatment before the 14:30 close and cleared it afterwards without a code change.

---

## 6. RTL and locale findings

- The app is Arabic-first. `DEFAULT_LOCALE` is `ar`; English is a full translation, not a
  device-locale fallback.
- `I18nManager.forceRTL()` needs a native restart. Expo Go does not apply it, so the root
  view also sets Yoga's `direction` to `rtl`/`ltr` from the locale. That flips rows, the
  tab bar, headers, and cards immediately and keeps Expo Go and standalone builds
  consistent.
- Signed values need a bidi isolate. `+2.91%` and `-19.12%` rendered as `2.91%+` and
  `19.12%-` in an RTL paragraph; wrapping them in `U+2066 … U+2069` (LRI/PDI) fixes the
  order in both locales.
- A font-shaping bug affects the Arabic string **“كل” followed by a space and another
  word** with the IBM Plex Sans Arabic semibold face: only “كل” painted. The copy now uses
  “جميع الأسهم” and “دي جميع الأسهم المتاحة”, which render correctly. Avoid “كل …” in
  short UI labels until the font/renderer combination is rechecked.
- The horizontal sector strip needed an explicit `scrollToEnd` on mount in RTL. Yoga puts
  the first sector at the right, but the native scroll view still starts at the left
  offset, which showed the last sectors first.

---

## 7. Known gaps / next

- **Scheduling is M2b.** The CLI jobs are manual; pg-boss cron, retries, jitter, and
  singleton keys are not wired yet.
- 50 stocks have no usable bars: 46 have no Yahoo listing and 4 are placeholder-only.
  Search and quotes still cover them; history does not.
- 69 stocks and EGX30 have only a single recent bar. The one-year request stored one day
  for those symbols; the 46 no-listing stocks and this 69-stock group are the two history
  gaps to revisit with a second provider.
- EGX30 history is unavailable from both providers. The sparkline is data-driven and
  hidden until at least two bars exist.
- TradingView quotes are delayed ~15 minutes. The UI labels the delay and the source.
- Yahoo bars are for a prototype; review Yahoo's terms before commercial reliance.
- Add API integration tests against a test Postgres database (search, pagination,
  overview aggregation, stale logic) before the M2b scheduler lands.
