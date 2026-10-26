# 00.04 — Open Questions, Risks & Stack Options

Consolidated from 00.01–00.03. Nothing here is a decision yet — these are the questions
that gate decisions.

## A. Blocking questions (must be answered before architecture)

| # | Question | Why it matters | How to close it |
|---|---|---|---|
| A1 | Does **any** Shariah screener cover EGX-listed companies? | Decides build-vs-buy for the feature that defines the product | Get a MuslimXchange key, call `GET /markets`, check for an EGX/Egypt code |
| A2 | Can we obtain EGX company **financial statements** in structured form for free? | Required to build our own screening engine | Inspect EGX disclosures, company IR pages, Stockastic EGX100 endpoints |
| A3 | Which **Twelve Data tier** includes XCAI/EGX market data? | Basic free = 3 markets only; EGX likely needs Grow ($29/mo) | Sign up free, test `time_series` for an EGX symbol with a real key |
| A4 | What are the **reuse terms** for EGX official site data? | Decides whether the authoritative free source is usable | Read EGX terms; if silent, treat as high risk and ask EGX |
| A5 | Does EGX publish an official **Shariah index constituent list**? | Free cross-check for our engine; also a content angle | Search EGX site and index methodology documents |
| A6 | Real **RSS URLs** for Mubasher, Al Borsa, Al Mal, Youm7 sections | These carry the EGX disclosure news we want | Inspect the live sites; fall back to section-page scraping |

## B. Architectural risks

- **No free licensed EGX price feed exists.** Every option is either unofficial (Yahoo),
  free-but-terms-unclear (EGX site, open-source scrapers), or paid (EODHD, Twelve Data
  Grow+, ICE). The design must assume the price source can be swapped, and must own its
  price history locally rather than depend on a live third party at request time.
- **Scrapers break.** EGX site and Mubasher are ASP.NET/HTML. Any scraper needs: a
  quarantine on parse failure, an alert, and a documented manual fallback — never a silent
  gap that publishes a stale price as if it were current.
- **Stale Shariah verdicts are a credibility bomb.** A company's ratios move between
  reporting periods. Every verdict needs an as-of date, a source citation, and a visible
  "last reviewed" stamp.
- **Religious content carries responsibility.** Compliance must be framed as *informational,
  methodology-stated, sources-cited*, with an explicit disclaimer, and ideally reviewed by
  a qualified Shariah advisor before publication. The site must never imply a fatwa.
- **News licensing.** Headline + summary + link out is the safe model. Full-text
  republication requires a licence per publisher.
- **Arabic vs English as two products, not one translation.** Egyptian financial readers
  expect Arabic first, and per Ahmed's convention Arabic content is Egyptian dialect for
  narrative but technical/financial terms untranslated. Decide the primary locale early —
  it drives the URL scheme, the SEO plan and the content pipeline.

## C. Stack options

### Option 1 — Zero-cost, maximum fragility
Market data: EGX site scrape (primary) + Yahoo (cross-check).
News: publisher RSS only (Arab Finance 10×2, Enterprise, Aswat Masriya, Hapi, DNE, CNN AR).
Screening: our own AAOIFI engine from scraped financials.
Cost: **$0/month.** Risk: two scrapers and one terms-questionable source; no SLA anywhere;
building the financial-statement pipeline is the bulk of the work.

### Option 2 — Low cost, balanced  ← the likely sweet spot
Market data: EGX scrape or Twelve Data Grow (~$29/mo) with Yahoo as cross-check.
News: Arab Finance + Enterprise + others (free) + Currents free tier for gap-filling.
Screening: own engine, with MuslimXchange paid as a validation source for covered stocks.
Cost: **roughly $30–100/month.** One paid dependency, real data quality, still owns its IP.

### Option 3 — Commercial-clean
Market data: licensed feed (EODHD / Twelve Data Pro / ICE).
News: paid news API with production rights (Currents paid / NewsData.io paid).
Screening: MuslimXchange Corporate, or licensed methodology.
Cost: **hundreds per month.** Zero terms risk, fastest to launch, no moat from data.

## D. Recommended next steps (in order)

1. Close **A1** and **A3** — two free signups (MuslimXchange trial, Twelve Data free key),
   about an hour of work, and they unblock the two biggest unknowns.
2. Inspect the **EGX site** with browser devtools for any JSON/XHR endpoint behind the
   ASP.NET pages — if one exists, the whole market-data problem gets easier.
3. Close **A6** — one pass over Mubasher / Al Borsa / Al Mal / Youm7 to find real feeds.
4. Then write the **PRD** and the **ERD**, and pick an option.

## E. What is already certain

- The **news layer is solved for free**, with Arabic and English, at 500+ items per
  language per poll cycle. No paid API is needed for launch.
- The **market data layer has no free licensed option** — this is the project's core
  constraint and every architecture decision has to respect it.
- The **screening layer is the product's differentiator**, and it is a computation with
  auditable inputs, not a lookup.
