# 00.03 — Shariah (Halal) Screening: Providers & Methodology

Researched 2026-09-22. Provider terms read from their own published docs where noted.

## The core problem

A "halal stocks" feature is **not** a lookup, it is a computation. Every serious screener
runs two gates:

1. **Business screen (qualitative).** Exclude the company's core activity if it involves:
   conventional banking/interest, conventional insurance, alcohol, tobacco, pork,
   gambling, adult entertainment, weapons (varies by standard), music/cinema (varies).
2. **Financial screen (quantitative ratios).** Measured against a standard:

| Test | AAOIFI | Dow Jones Islamic Market (DJIM) |
|---|---|---|
| Interest-bearing debt / total assets | < 33% | < 33% |
| Interest income / revenue | < 5% | < 5% (some houses 5–10%) |
| Prohibited revenue / total revenue | < 5% | < 5% |

Then **purification**: the impermissible-income share of the dividend, per share, which
the investor must give to charity. Some standards also compute **zakat per share**.

The thresholds differ per standard (AAOIFI, S&P Shariah, DJIM, FTSE, MSCI, Al Rajhi,
Alinma, Al Bilad), and a company can pass one and fail another. **The portal must state
which standard it uses and show it per stock** — this is the differentiator versus a
generic screener, and it is the part that has to be technically correct.

## 1. MuslimXchange — `[DOCUMENTED]`, strongest candidate

An AAOIFI-certified Shariah advisor is named on their site; the API mirrors their
platform dataset.

- **Standards covered: 8** — AAOIFI, S&P, DJIM, FTSE, MSCI, Al Rajhi, Alinma, Al Bilad.
- **Fields:** overall verdict, verdict per standard, business screen, impermissible
  segment and its revenue %, interest income %, total impermissible %, **purification per
  share**, **zakat per share**, plus debt-ratio test results and NCA-ratio results on the
  full tier.
- **Endpoints:** `GET /ticker/{symbol}`, `GET /isin/{isin}`, `POST /batch`,
  `GET /markets`, `GET /market/{code}` (whole market in one call), `GET /fields`.
  Base: `https://muslimxchange.com/wp-json/mx-api/v1`, HTTP Basic auth with username + API key.
- **Free trial:** 1 lookup/day for a signed-in account. Paid plans: Max / Business Advisor,
  and Corporate / Enterprise. No per-request cap on paid plans; 99.9% uptime commitment.
  Screening data refreshes on their publication schedule — poll daily, not intraday.
- Data is **never cached on their side**; they instruct clients not to cache verdicts
  beyond one trading day.

`[GAP]` **Does MuslimXchange cover EGX-listed companies?** Their `/markets` endpoint
(accessible on any plan) must be queried with a real key to answer this. This single
question decides whether the screening feature is a 2-week integration or a 3-month build.

## 2. Other providers — `[UNVERIFIED]`

| Provider | Coverage | API | Free tier |
|---|---|---|---|
| Islamicly | 30,000+ screened stocks globally | API exists, terms not public | unknown |
| Musaffa | 120,000+ stocks, 7,300+ ETFs | screener is public; API not documented | free web screener |
| HalalScreener.app | 6,300+ **US** stocks & ETFs, AAOIFI, 800+ crypto | unclear | "free to start" |
| Halal Terminal (`api.halalterminal.com`) | `POST /api/screen/{symbol}`, `/api/quote`, `/api/portfolio/scan`, `/api/zakat/calculate` | yes, `X-API-Key` | unknown |
| Finispia Halal Stock Finder (via Datarade) | 5 methodologies | yes | not listed |

None of these advertise EGX coverage. All are US/global-majority in focus, and US-focused
screeners are useless here because EGX's largest companies are not listed in the US.

## 3. The DIY engine — the likely real answer

Given the above, the screening engine is a strong candidate for **building ourselves**:

```
Inputs   : company business description + latest audited financials
           (total assets, interest-bearing debt, revenue, interest income,
            prohibited-segment revenue, dividends, shares outstanding)
Steps    : 1. business screen from the sector/activity classification
           2. apply the chosen standard's ratio thresholds
           3. compute purification per share and zakat per share
           4. store the verdict WITH the standard, the input figures and the source
              document + date, so every verdict is auditable
Output   : pass/fail per standard, ratios, purification, zakat, and the evidence
```

Why build it:
- Avoids per-lookup cost on hundreds of stocks recurring daily.
- Every verdict is explainable and citeable — reviewers and users can see the actual
  filing behind it. That is the credibility the portal sells.
- It works for **any** EGX company, including the ones no commercial screener covers.
- It is defensible IP, and the same engine extends to GCC markets later.

What it costs: sourcing reliable financials per company, and a monitoring process when a
company's numbers change. `[GAP]` Where do we get EGX financial statements in a usable
structured form? Candidates: EGX disclosures pages, company investor-relations pages,
Stockastic's EGX100 financial endpoints, Mubasher company pages. Each needs checking.

## 4. Egypt-specific structural notes

- The EGX market is **bank-heavy and financial-heavy** at the top (CIB/COMI, ADIB Egypt,
  Credit Agricole Egypt, Suez Canal Bank, Al Baraka Bank, EFG Holding, Beltone, GB Corp).
  Conventional banks and conventional insurers will fail the business screen outright,
  which means a large share of the EGX 30 by weight will be **non-compliant**. A halal
  section is therefore not a filter on the index — it is a genuinely different universe,
  and the portal must make that explicit rather than imply an index minus a few names.
- Companies whose debt ratios sit near the threshold (real estate, contracting,
  industrials, some food and pharma with bank debt) will flip between compliant and
  non-compliant between reporting periods. **Every verdict must carry an as-of date**,
  and the UI must show it. A stale verdict presented as current is the single biggest
  credibility risk in a product like this.
- `[GAP]` Does EGX publish an official Shariah-compliant index and its constituent list?
  There are indications of Shariah index products on the EGX. If a free official
  constituent list exists, it becomes a valuable cross-check against our own engine —
  and a source of disagreement worth documenting publicly.

## 5. Conclusion for screening

Two viable paths, and they are not mutually exclusive:

- **Path A (fast):** license MuslimXchange if EGX is covered. Days of integration,
  audited methodology, an AAOIFI-certified advisor named behind it. Cost is recurring and
  per-seat-limit driven.
- **Path B (own it):** build the engine, use a licensed provider as a cross-check for the
  subset where both have data. Slower, but the verdicts become our own, cost scales to
  zero, and every one is auditable.

The decision hinges on the `[GAP]`s above — MuslimXchange's EGX coverage, and how
obtainable EGX financial statements are in structured form.
