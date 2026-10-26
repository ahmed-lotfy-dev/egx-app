# 00.06 — Free Fair-Value Data for EGX: API Verification Report

Answers three questions, all probed live on 2026-09-22:

1. Does **EGXAPI.com** work? (a demo key `egx_demo_0000000000000000000000` was supplied)
2. Do the alternatives named in the research paste (**borsa**, **Investor EGX**, EGX official
   feed) actually work?
3. **What free data exists to compute a fair value** — the figures an investor makes a
   decision on?

Every number below came from a live request. Anything unverified is marked `[GAP]`.

---

## Part 1 — EGXAPI.com: DEAD. Do not use it, do not design around it.

**Verdict: the marketing site is real; the API does not exist.** Ahmed's suspicion was
correct.

### Evidence

**The API host is a broken Cloudflare Tunnel.** `api.egxapi.com` resolves
(Cloudflare IPs) but every request returns:

```
HTTP 530
{"type":".../cloudflare-1xxx-errors/error-1033/",
 "title":"Error 1033: Cloudflare Tunnel error","status":530,
 "detail":"The host is configured as a Cloudflare Tunnel ..."}
```

Attempted endpoints — **all 11 returned 530**, retried 3 times 20 seconds apart:

```
/v2/quote/COMI        /v2/quotes/COMI       /v2/market/quote/COMI
/v2/markets/EGX/quotes /v2/bars/COMI        /v2/symbols
/v2/instruments       /v2/account           /v2/health      <- even health is down
/                      /v1/quote/COMI
```

Error 1033 means the tunnel is configured in Cloudflare but **the origin machine behind it
is not running**. There is no server. A `/health` returning 530 is conclusive.

**The legal page is literally placeholder text.** From `egxapi.com/legal`:

> *"Design draft — not legal advice. Section structure is final; body copy is placeholder
> for layout only and will be replaced with wording supplied by counsel."*

And all 13 sections are `[Draft] Placeholder text for layout. Final wording will be
supplied by counsel before publication.` The contact address is the obfuscated
`[email protected]` — a placeholder, not a real mailbox.

**Sign-in does not work.** The auth page renders the button label
**"Google sign-in unavailable"**.

**The supplied key appears nowhere.** Searched the homepage, docs, pricing, legal and auth
pages for `egx_demo`, `demo_0000` and the key string: **0 mentions**. No page on the site
defines a demo key. The key is invented.

**Other signals:** `sitemap.xml` → 404, `robots.txt` → 404, no status page, no company
entity anywhere in the legal text, and only one subdomain (`api`) exists — no `ws`, `sandbox`,
`dashboard`, `status`.

### What is real

- The Next.js marketing/pricing/docs site works and is well built.
- The docs describe a plausible API: `/v2/account`, `/v2/orders`, `/v2/positions`,
  and `/v2/market-data/bars?symbol=COMI&timeframe=1Day&limit=2`, with a required
  `X-EGX-Env: paper|live` header.
- It claims 3,000 req/min, real-time data, full history, paper trading, "SOC 2 Type II ·
  FRA-aligned controls", free forever funded by trading economics.

Those are **claims in marketing copy**, contradicted by the placeholder legal text and the
dead endpoint. A "SOC 2 Type II" badge next to `[Draft] Placeholder text` and an
uncontactable email is a strong tell.

**Conclusion: a design-stage storefront for a service that was never deployed. Zero
data value. Exclude from all planning.**

---

## Part 2 — borsa (github.com/7ashraf/borsa): real code, dead demo, and it cannot value a stock

- Repo: `7ashraf/borsa` — MIT, **17 stars**, 3 forks, Python, by Muhamed Ashraf.
- Created **2026-05-24**, last pushed **2026-05-26**. Effectively a two-day-old codebase,
  untouched for ~4 months.
- Description: self-hostable FastAPI service for EGX market data; ~200+ EGX symbols,
  normalises `COMI` / `COMI.CA` / `CIB.EGX`, and fails over between Yahoo, Alpha Vantage
  and Finnhub.
- Ships `ghcr.io/7ashraf/borsa:latest`; `docker compose up` runs it at `localhost:8000`.

**The public demo is not running.** `borsa.ashh.me` serves a Next.js landing page
(`/` and `/docs` → 200), but **every API path returns 404**:

```
/v1/health  404     /v1/quote/COMI  404     /v1/stocks  404
/v1/status  404     /demo/quote/COMI 404    /openapi.json 404
```

So the "50 requests/day public demo" is not available. Self-hosting is the only route.

**Critical limitation for us:** borsa returns **quotes only** — price, change, volume,
high, low. There are **no financial statements and no fundamentals**, so it cannot produce
a fair value. It solves the price feed, not the valuation problem.

Also worth noting: the project's own README warns *"borsa is software, not a market-data
license"* and disables Yahoo support by default in `.env.example` **because Yahoo access is
unofficial** — the same legal exposure we flagged in doc 00.01.

**Verdict: worth self-hosting later as a normalisation/failover layer over price feeds.
Not a fair-value source.**

---

## Part 3 — Investor EGX (github.com/labib2002/investor-egx): the closest prior art, and it is honest

- Repo: `labib2002/investor-egx` — Python, **0 stars**, 1 fork, no licence, published
  **2026-07-10** (single-day project).
- Description: free-data EGX pipeline — ticker universe, daily OHLCV, fundamentals,
  technical + analyst sentiment, SQLite, LLM-ready decision feeds.

**What it actually built (25 files, verified):**

```
investor_egx/  cli.py  pipeline.py  db.py  ai_feed.py  config.py  fees.py
               http_utils.py  prompts.py
        sources/  ticker_universe.py  prices.py  fundamentals.py
                  technicals.py  source_matrix.py
sql/  schema_sqlite.sql  schema_postgres.sql
docs/  architecture_report.md
```

Its SQLite schema is a solid starting template — `tickers` (with `egx_symbol`, `isin`,
`yahoo_symbol`, `investpy_symbol`, `tradingview_symbol`, sector, industry, `exchange_code`)
plus `price_daily`, `fundamentals`, `technicals_sentiment`. **The `fundamentals` table is
exactly the fair-value input set**: `pe_ratio`, `eps`, `market_cap`, `dividend_yield`,
`pb_ratio`, `ps_ratio`, `roe`, `roa`, `debt_to_equity`, `current_ratio`, `quick_ratio`,
`revenue_ttm`, `net_income_ttm`, `free_cash_flow_ttm` — plus `source` and `raw_json` for
provenance on every row. It also has a `fees.py` (EGX transaction-cost math), which is a
detail most people forget.

Its stated coverage: **343 EGX tickers** (289 via TradingView scanner, 55 via Yahoo ISIN
search), with real daily OHLCV via yfinance.

**Its README documents its own failures — which is the most useful part of it:**

| Limitation (their words) | Consequence for us |
|---|---|
| **No true intraday data** — Yahoo returns ~1 bar/day for EGX regardless of interval | Intraday is unattainable from Yahoo; needs a different source |
| **Two ticker cohorts don't merge** — TradingView keyed by symbol (`COMI`), Yahoo by ISIN (`EGS60121C018`) | Confirms the identity problem I flagged; needs a real mapping table |
| **Postgres is schema-only** — `db.py` is implemented on `sqlite3`, no PG layer | Not production-ready for our stack |
| **Silent error handling** — adapters swallow exceptions; **a failing source looks identical to an empty market**, no logging, no tests | The single worst failure mode for a data product |
| **Investing.com is DEAD** — all `tvc*.investing.com` endpoints return 403 | Don't plan on Investiny |
| Fundamentals "sparse/NULL for thin micro-caps" | Partial coverage, as we measured independently |
| Analyst coverage on EGX is thin — single-digit counts even for the largest names | Sentiment fields are weak signals, not decision inputs |
| "Postgres is schema-only", "run-all untested at full scale", unknown symbols raise raw `KeyError` | Prototype quality |

**Verdict: excellent architecture reference and a good schema to borrow from. Prototype
quality, no licence, no tests. Not a dependency — but it independently confirms the
TradingView-scanner-plus-Yahoo approach is the right free stack.**

---

## Part 4 — The actual answer: free fair-value inputs for EGX **do exist**

This is the finding that matters. The **TradingView scanner** returns real, current,
fundamental data for EGX companies, unauthenticated. Verified live on real values:

### COMI (Commercial International Bank) — full verified record

```
close                        129.66 EGP
market_cap_basic             447,775,703,247 EGP
price_earnings_ttm           6.24
earnings_per_share_ttm       21.16 EGP
price_book_ratio             1.89
book_value_per_share_fq      70.01 EGP
return_on_equity             34.36 %
return_on_assets             4.74 %
debt_to_equity               0.346
total_debt                   82,394,734,000 EGP
total_assets                 1,690,039,928,000 EGP
total_liabilities_fq         28,959,892,595.55 (USD-basis, see Part 5)
net_income_ttm               71,380,337,000 EGP
total_revenue_ttm            239,712,949,000 EGP
net_margin                   51.02 %
operating_margin             85.00 %
pre_tax_margin               49.84 %
free_cash_flow_ttm           73,089,359,000 EGP
dividends_yield              4.56 %
current_ratio                0.451
beta_1_year                  1.304
average_volume_10d           5,065,860
total_shares_outstanding     3,405,140,000
sector                       Finance  /  industry: Regional Banks
logoid                       commercial-international-bank-egypt
Recommend.All                -0.515   (TradingView technical rating, -1..+1)
Recommend.MA                 -0.667
Recommend.Other              -0.364
```

Sanity check: 447,775,703,247 ÷ 3,405,140,000 shares = **131.5 EGP/share**, matching the
quoted 129.66 price. The numbers are internally consistent. **This is real data.**

Other verified records: **ETEL** (Telecom Egypt) P/E 10.48, EV/EBITDA 5.95, gross margin
41.8%, net margin 21.0%, revenue 106.8bn EGP, beta 1.05. **TMGH** P/E 12.42, ROE 18.7%,
FCF **−2.21bn EGP** (negative). **EGAL** P/E 13.94, ROE 42.2%, D/E 0.0028, current ratio
3.98. **MFPC** (MOPCO) P/E 8.92, **dividend yield 8.04%**, net margin 45.6%, EV/EBITDA 6.63.

### Coverage — how deep is it really

Measured by counting non-empty fields across the EGX market:

| Field group | Symbols with data | of 296 |
|---|---|---|
| Any EGX stock | 296 | 100% |
| Book value / share | **180** | 61% |
| Debt / equity | **177** | 60% |
| Dividend yield | 90 | 30% |
| EPS | 82 | 28% |
| Net income TTM | 82 | 28% |
| Total revenue TTM | 82 | 28% |
| Return on equity | 75 | 25% |
| Free cash flow TTM | 70 | 24% |
| **P/E** | **69** | **23%** |
| EV / EBITDA | 57 | 19% |

**Read this honestly: fundamentals are solid for roughly the top 70–90 names — the large
and mid caps an investor actually considers — and sparse or absent below that.** That is
enough to launch a valuation product on 70–90 stocks, and not enough to claim
whole-market coverage. Note also that individual fields are missing for big names too:
**SWDY has no P/E, no EPS and no net income at all.**

The scanner also accepts filters, so coverage per field is queryable at runtime — we can
drive the UI from "what we actually have" rather than showing blanks.


---

## Part 5 — CRITICAL TRAP: the two TradingView endpoints disagree by ~50x

This will silently destroy any valuation built on it, so it needs to be understood before
a line of code is written.

TradingView exposes the same concepts through two endpoints, and **they return different
units while both claiming `currency: "EGP"`**:

| Field | `/egypt/scan` (POST) | `/symbol?symbol=EGX:COMI` (GET) |
|---|---|---|
| `currency` | `"EGP"` | `"EGP"` ← **misleading** |
| `close` | 129.66 | 129.66 (same) |
| `market_cap_basic` | **447,775,703,247** | **8,494,305,090** |
| `total_assets` | 1,690,039,928,000 | 33,716,296,563 |
| `total_revenue_ttm` | 239,712,949,000 | 4,782,273,332 |
| `total_debt` | 82,394,734,000 | 1,643,774,943 |
| `earnings_per_share_ttm` | 21.1557 | 0.422056 |
| `book_value_per_share_fq` | 70.01276 | 1.396755 |
| `price_earnings_ttm` | 6.2355 | 6.2355 (same) |
| `price_book_ratio` | 1.8920 | 1.8920 (same) |

The ratio between the two is consistently **≈ 50.1**, which matches the EGP/USD rate.
Confirmed: `447,775,703,247 / 8,494,305,090 = 52.7`, and
`21.1557 / 0.422056 = 50.12`. Dividing market cap by shares gives the EGP price on the
scan side and the USD price on the symbol side.

**Conclusion:**
- `/egypt/scan` returns absolute money amounts in **EGP** (the correct trading currency).
- `/symbol` returns absolute money amounts converted to **USD**, while still labelling the
  instrument `currency: "EGP"`.
- Pure ratios and percentages (P/E, P/B, margins, ROE, D/E, dividend yield) are identical
  and safe from either endpoint.

**Rules we must follow:** use `/scan` as the single source for absolute figures; never
mix fields from the two endpoints in one record; store the unit with every stored field;
and never trust the `currency` label for absolute amounts. A 50x error in a "fair value"
is worse than no fair value at all.

## Part 6 — Yahoo Finance: prices work, fundamentals are blocked

Re-confirmed by direct probe:

| Endpoint | Result |
|---|---|
| `query1.finance.yahoo.com/v8/finance/chart/COMI.CA` | **200 — works**, real OHLCV |
| `.../v10/finance/quoteSummary/COMI.CA?modules=...` | **429 on query1 and query2** |
| `.../v7/finance/quote?symbols=COMI.CA` | **429 on query1 and query2** |
| `.../ws/fundamentals-timeseries/v1/.../COMI.CA` | **429 on query1 and query2** |

Yahoo's fundamental and statement endpoints now require a cookie + crumb handshake and
rate-limit hard without one. This was a repeated 429 across both hosts, not a coincidence.

**Consequences:**
- Yahoo is usable **for prices only** (the `.CA` chart endpoint).
- Yahoo is **not** a viable source for statements or fundamentals from a server.
- This kills the idea of pulling full financial statements from Yahoo for a DCF. The
  competitor's site uses Yahoo for exactly one thing — the chart endpoint — and that is
  consistent with what it can actually do.

`[GAP]` A crumb/cookie-aware client (what `yfinance` does internally) may restore some of
this, at the cost of fragility and the legal exposure borsa explicitly warns about. Not
recommended as a foundation.

## Part 7 — Gap analysis: what a fair value needs vs what we can get free

The architecture from the research paste is the right one:

```
market data → OHLCV → financial statements → valuation engine → fair value range
```

Mapped against what is actually obtainable for EGX:

| Required input | Free source | Status |
|---|---|---|
| Price, OHLCV, volume | Yahoo `.CA` chart (60d daily), EGX site tables | Available |
| Current market cap | TradingView `/scan` | Available (EGP) |
| Shares outstanding | TradingView `/symbol` | Available (verify per symbol) |
| EPS (TTM) | TradingView `/scan` | 82 / 296 |
| Book value per share | TradingView `/scan` | 180 / 296 |
| P/E, P/B | TradingView both endpoints | 69 / 296 |
| ROE, ROA | TradingView `/scan` | 75 / 296 |
| Debt / equity, total debt | TradingView `/scan` | 177 / 296 |
| Net income, revenue (TTM) | TradingView `/scan` | 82 / 296 |
| Free cash flow (TTM) | TradingView `/scan` | 70 / 296 |
| EV/EBITDA | TradingView `/scan` | 57 / 296 |
| Dividend yield | TradingView `/scan` | 90 / 296 |
| Sector / industry | TradingView | Available |
| **Multi-year income statement** (revenue, EBIT, net income by year) | **none found** | `[GAP]` |
| **Multi-year balance sheet** (equity, debt, cash by year) | **none found** | `[GAP]` |
| **Multi-year cash flow** (FCF history, capex) | **none found** | `[GAP]` |
| Risk-free rate (Egypt T-bills) | CBE / MoF publications | `[GAP]` needs sourcing |
| Equity risk premium | Must be chosen and documented | `[GAP]` |
| Analyst target prices | Thin — single-digit counts even for large caps | Effectively absent |

**The honest bottom line on "fair price":** we can compute **relative valuation** — P/E,
P/B, EV/EBITDA, dividend yield, peer and sector medians, historical percentile bands —
completely and credibly for roughly 70–90 EGX names, today, for free. A **DCF is not
currently possible for EGX** because multi-year statements are not available from any free
source we found. A "fair value range" presented as DCF-derived would be invented, not
computed.

That is exactly the discipline the research paste asked for — *"the valuation engine is
your application, not something I'd outsource to an API"* — with one correction: the
engine's quality is capped by the statements we can feed it, and right now we cannot feed
it full statements.

## Part 8 — Verdict and recommended composition

**Sources, ranked for our build:**

1. **TradingView `/egypt/scan`** — instrument master (296 names, Arabic names, logos,
   sectors) **and** the fundamentals layer. Free, no auth, real data, ~50x unit trap
   understood. This is the backbone.
2. **TradingView `/symbol`** — supplementary only (e.g. `total_shares_outstanding`), used
   with the explicit USD caveat, never mixed with `/scan` figures.
3. **Yahoo `.CA` chart endpoint** — price history. Proven by a live competitor.
4. **EGX official site** — authoritative cross-check on prices and official disclosures.
5. **Publisher RSS** (doc 00.02) — the news layer.
6. **Self-hosted borsa** — optional later, as a normalisation/failover wrapper over price
   providers. Never as a valuation source.
7. **EGXAPI.com** — **excluded entirely.**

**Product consequence, stated plainly:** the portal's valuation feature should launch as
**relative valuation with peer and sector comparison, plus yield analysis** — which is
genuinely defensible on free data — and should describe DCF as *not yet available* rather
than shipping a model fed by invented inputs. If we want DCF later, the path is licensing
statements or hand-entering them for the top 30 names, not finding a free API.

## Part 9 — Open questions this raised

1. `[GAP]` **Where can we get multi-year EGX financial statements?** This is now the single
   highest-value open question in the project — it is the gate on any intrinsic valuation.
   Candidates: EGX disclosure filings (PDF), company investor-relations pages, Mubasher
   company financials pages, Stockastic's EGX100 financial endpoints.
2. `[GAP]` **TradingView terms** — is scripted use of `/scan` and `/symbol` permitted for a
   commercial product? Still unresolved from doc 00.01, and now more load-bearing.
3. `[GAP]` **Egypt risk-free rate and equity risk premium** — needed for any discount-rate
   work, and must be documented and dated for credibility.
4. `[GAP]` Does EGX publish a Shariah index constituent list, and does any Shariah provider
   cover EGX? (carried forward from doc 00.03.)
5. `[GAP]` Confirm `total_shares_outstanding` from `/symbol` is share-count (not value) for
   a sample of names before relying on it.
