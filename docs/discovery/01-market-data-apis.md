# 00.01 — Market Data Sources & Free API Comparison (EGX)

Probed live: 2026-09-22 from Ahmed's machine. Raw responses recorded below.

## Summary table

| Provider | EGX coverage | Free tier | Key needed | Commercial use | Verdict |
|---|---|---|---|---|---|
| **TradingView scanner** | **296 instruments + logos + Arabic names** | Free, no auth | No | ToS `[GAP]` | **Best bootstrap source found** |
| Yahoo Finance (unofficial) | Yes — verified | Unlimited-ish, unofficial | No | ToS forbids commercial redistribution | Proven in production; prototype/fallback |
| Twelve Data | Yes — symbol list verified | 800 credits/day, 8/min | Yes | Free = non-commercial/internal | Needs tier check `[GAP]` |
| EODHD | Yes | 20 calls/day | Yes | Paid plans | Free tier unusable |
| Alpha Vantage | No EGX confirmation | 25 calls/day | Yes | — | Not viable |
| EGX official site | Yes — authoritative | Free, HTML only | No | Reuse terms unclear `[GAP]` | Scrape candidate |
| EGXPY / egxlytics | Yes | Free, open source | No | Unclear `[GAP]` | Scrape candidate |
| Stockastic | Yes — EGX100 fundamentals | Unknown | Yes | Unknown | Contact required |
| Indices-API | EGX 30 index | Free tier exists | Yes | — | Index only |
| Mubasher | Yes | Free, HTML | No | ToS `[GAP]` | Scrape candidate |

---

## 1. Yahoo Finance chart API — `[VERIFIED]`

No key. Undocumented. Two probes:

`GET https://query1.finance.yahoo.com/v8/finance/chart/COMI.CA?range=5d&interval=1d`

```
200 OK
currency: EGP | symbol: COMI.CA | exchangeName: CAI | fullExchangeName: EGX
regularMarketPrice: 81.2 | regularMarketChangePercent: 0.744
timezone: Africa/Cairo | longName: Commercial International Bank Egypt (CIB) S.A.E.
```

`GET https://query1.finance.yahoo.com/v8/finance/chart/%5ECASE30?range=5d&interval=1d`

```
200 OK
symbol: ^CASE30 | instrumentType: INDEX
regularMarketPrice: 55005.8 | regularMarketChangePercent: 0.021
regularMarketVolume: 164473000 | longName: EGX 30 Price ...
```

Notes / risks:
- Symbol convention for EGX listings is `<TICKER>.CA` (COMI.CA, SWDY.CA, TMGH.CA).
  Index is `^CASE30`.
- `instrumentType` for COMI.CA came back as `MUTUALFUND` — metadata quality is poor.
- Undocumented endpoint: no SLA, can break without notice, aggressive rate limiting,
  and Yahoo's ToS prohibit commercial redistribution of the data.
- **Verdict:** fine for a prototype / fallback. Not a basis for a commercial portal.

## 1b. TradingView scanner API — `[VERIFIED]` (added after the competitor teardown)

Discovered while analysing byahmedatia.com, then probed directly. **No key, no auth,
no referer check.** Two POST endpoints:

```
https://scanner.tradingview.com/egypt/scan
https://scanner.tradingview.com/global/scan
```

A body of `{filter, options:{lang}, markets:["egypt"], symbols, columns, sort, range}`
returns the whole EGX market in one response. Measured result:

```
totalCount: 296, returned: 296
[{"s":"EGX:COMI",
  "d":["COMI","البنك التجاري الدولي",131.5,-1.2317,7168416,
       "commercial-international-bank-egypt","EGP",453360128190]}, ...]
```

Columns available: ticker, **Arabic company name**, close, change %, volume, **logoid**,
currency, market cap, sector, instrument type.

Companion logo CDN, also verified:

```
https://s3-symbol-logo.tradingview.com/{logoid}.svg        -> 200 image/svg+xml
https://s3-symbol-logo.tradingview.com/{logoid}--big.svg  -> 200 image/svg+xml
https://s3-symbol-logo.tradingview.com/country/EG.svg     -> 200 image/svg+xml
          {logoid}--original.svg                          -> 403
```

Why this matters: it solves three problems at once, for free —

1. **The full EGX universe (296 instruments)** with Arabic names and market caps, in one
   call. This is the instrument master, and it replaces the need to build one by hand.
2. **Arabic display names**, which the EGX site and Yahoo both lack.
3. **Company logos** via `logoid`, ready to serve as plain `<img src>`.

Caveats: undocumented and unofficial, so treat it as a bootstrap and periodic enrichment
source rather than the sole price feed — no SLA, and TradingView's terms must be reviewed
before commercial reliance. `[GAP]` Confirm terms and whether the endpoint is stable enough
to be a launch dependency, or only an initial seeding job with our own DB as the source
of truth afterwards.

## 2. Twelve Data — `[VERIFIED]` for symbol directory, `[GAP]` for market data

`GET https://api.twelvedata.com/stocks?exchange=XCAI&apikey=demo` → `200 OK`

```
{"symbol":"EGS01041C010","name":"Ismailia National Food Industries Co.",
 "currency":"EGP","exchange":"EGX","mic_code":"XCAI","country":"Egypt",
 "type":"Common Stock","figi_code":"BBG000JN8LY6",
 "isin":"request_access_via_add_ons","cusip":"request_access_via_add_ons"}
```

The full EGX symbol directory is retrievable, including FIGI codes.

`GET .../time_series?symbol=COMI&exchange=XCAI&interval=1day&apikey=demo` → `401 Unauthorized`
`GET .../quote?symbol=COMI&exchange=XCAI&apikey=demo` → `401 Unauthorized`

`401` on the demo key is expected — market data needs a personal key.

Critical gotchas:
- **Twelve Data's EGX symbols are ISIN-style codes (`EGS01041C010`), not EGX tickers
  (`COMI`).** Any integration needs a ticker ⇄ ISIN mapping table.
- ISIN and CUSIP fields are withheld ("request_access_via_add_ons") — so the mapping
  cannot be built from this endpoint alone.

Free tier `[DOCUMENTED]` (twelvedata.com/pricing):
- Basic = Free: **800 API credits/day, 8 credits/minute**, 3 markets only,
  real-time US equities/forex/crypto, reference data, technical indicators, batch requests.
- Grow = $29/mo: 27 markets, EOD global equities/ETFs, fundamentals, no daily limit.
- Pro = $99/mo: 76 markets.
- Ultra = $329/mo: 85 markets (all).

`[GAP]` **Which tier includes the XCAI/EGX market?** The site lists the Egyptian Exchange
as a supported exchange but the Basic plan covers only 3 markets. This must be confirmed
with a real API key before any design depends on Twelve Data.

## 3. EODHD — `[DOCUMENTED]`

Supports EGX (`eodhd.com/exchange/EGX`) with ticker lists, trading hours, holidays,
EOD history and fundamentals.

- Free plan `[DOCUMENTED]`: **20 API calls/day**, 1 year of history only.
- Demo token probes (`COMI.EGX` EOD, `exchange-symbol-list/EGX`) both returned
  `403 Forbidden` `[VERIFIED]`.
- 20 calls/day cannot refresh a portal. Paid plans start around $79.99/mo.
- **Verdict:** not viable on free; a candidate only if budget appears later.

## 4. Alpha Vantage — `[VERIFIED]`

`GET .../GLOBAL_QUOTE?symbol=COMI.CA&apikey=demo` → `200` with only an informational
string (demo keys return no real data). Free tier is 25 requests/day `[DOCUMENTED]`,
and EGX coverage is not confirmed. **Not viable.**

## 5. EGX official website — `[VERIFIED]` (reachable, HTML only)

`egx.com.eg` publishes, free and without a key:

- **Intraday trading statistics** (`/en/InradayTradingStatistics.aspx`) — a full table of
  every listed company with volume, value, previous close, trades, open, change %.
  Verified live: ~120 companies in one page.
- **Press releases** (`/en/NewsDetails.aspx?NewsID=...`) — official EGX announcements.
- **Reports & publications**, market summary, gold/silver prices from EGX members.

Constraints:
- It is ASP.NET WebForms — HTML tables, no documented public API.
- No JSON endpoints were found. `[GAP]` An undocumented internal handler may exist;
  worth investigating with browser devtools before committing to HTML parsing.
- Reuse/redistribution terms are not stated publicly. `[GAP]` Legal review needed —
  this is the authoritative source, so if it is usable it should be the primary feed.

## 6. Open-source / community EGX projects — `[UNVERIFIED]`

- **EGXPY (egxlytics)** — "Egypt's first open-source Python API and web platform" for EGX
  historical and intraday data; announced free on LinkedIn. Repository not yet located. `[GAP]`
- **`rgf2004/egx-stock-api`** — small Flask API returning latest EGX closing prices.
- **`M-Abdelmegeed/EGX-Data-MCP-Server`** — MCP server exposing EGX stock tools plus
  precious metals; last commit Oct 2025; 3 stars.
- **`reisenmachtfreude/stock_fundamental_apis`** — provider comparison list that includes
  an EGX section; useful as a cross-check.

These matter mainly as **prior art**: they show which scraping paths survive EGX site
changes, and the MCP server documents the working request patterns.

## 7. Other providers — `[UNVERIFIED]`

- **Stockastic** (`api.stockastic.app`) — EGX100 company financial performance, financial
  ratios (debt/equity, ROE, current ratio, net margin, ROA), current price, quarterly
  comparison. EGX-native, Bearer auth. Free tier unknown. **Promising for fundamentals.**
- **Indices-API** — EGX 30 index, free tier exists. Index level only.
- **Mubasher** (`english.mubasher.info`) — EGX stock pages, support/resistance tools,
  an Islamic finance news section. HTML, no key.
- **Marketstack / Serrari Group** — global EOD, EGX coverage unconfirmed.
- **ICE Consolidated Feed** — real institutional EGX L1/L2 streaming. Enterprise pricing.
- **EGID** — the Egyptian CSD; reportedly supplies feeds to firms on request `[UNVERIFIED]`.

---

## Conclusion for market data

There is **no free, licensed, reliable EGX market-data API**. But the teardown produced a
workable free stack that did not exist in the first pass:

1. **TradingView scanner — the instrument master.** One unauthenticated POST returns all
   296 EGX instruments with Arabic names, market caps and logo IDs. Run it on a schedule
   to seed and refresh our instruments table. This removes the single biggest piece of
   manual work (the ISIN ⇄ ticker mapping) that every other provider would have required.
2. **Company logos for free** — `s3-symbol-logo.tradingview.com/{logoid}.svg`, verified.
3. **Prices — Yahoo `.CA` endpoint**, proven in production by the competitor, plus EGX's
   own official intraday tables as the authoritative cross-check. `[GAP]` Reuse terms for
   both still need a legal read before commercial launch.
4. **Twelve Data** if a paid tier is acceptable and the XCAI tier question resolves well.

The architecture is unchanged by any of this, and it is the important part: **fetch on a
schedule into our own database, serve from our own database, never call a third party at
page render.** Every source above is unofficial or terms-unclear, so the design must
assume any one of them can be swapped or dropped without a rewrite.

The one gap TradingView does *not* fill is historical prices deep enough for real
analysis — the scanner gives current values, Yahoo gives 60 days of daily candles.
