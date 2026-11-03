# Financial Data Pipeline — Design

**Date:** 2026-11-03
**Branch:** `feat/financial-data-pipeline`
**Status:** Approved design, pre-implementation

## 1. Goal

Turn manually uploaded EGX quarterly market reports into verified, per-stock
quarterly snapshots that feed the stock screen and the AI assistant — with
full provenance, no duplicated rows, and no number reaching users without
admin approval.

The source document (`DiscDoc_ID55542_30-Sep-2026_ARB.pdf`, 24 pages,
Oracle BI Publisher, text-based) contains per-stock tables on pages 16–24:
close, change %, trading value/volume, listed shares, market cap, paid capital,
trailing P/E, dividend yield, net profit, net-profit period, last coupon,
ex-date. It does **not** contain balance-sheet items, so Sharia screening is
out of scope.

## 2. Scope

**v1**
- Admin-only upload of one or more PDFs.
- Vision extraction of per-stock table pages into a strict JSON artifact.
- Deterministic validation + Arabic name → ticker matching.
- Dashboard review with PDF page image, per-row checks, edit and approve.
- Publish approved snapshots to the app and AI.
- Page-level RAG over approved documents.
- One direct "تحليل السهم" button on the stock screen.

**Out of scope**
- Sharia screening (no debt/cash/interest-income data in this source).
- Full financial statements (income statement, balance sheet, cash flow).
- Indices, sector aggregates and investor-flow tables (later).
- Automated fetching/scraping — uploads are manual by policy.

## 3. Data model

Three new tables plus one column. No duplicate fact storage.

### `source_documents`
```
id            bigserial pk
sha256        text not null unique
filename      text not null
period_start  date not null
period_end    date not null
pages         int  not null
storage_path  text not null
extraction_path text
extraction_hash text
extraction_model text
extraction_version int not null default 1
status        text not null default 'uploaded'
              -- uploaded | extracting | extracted | validated
              -- | approved | published | failed
error         text
uploaded_by   text not null
uploaded_at   timestamptz not null default now()
published_at  timestamptz
```
`sha256` unique rejects accidental re-uploads of the same file.

### `stock_snapshots`
```
id                    bigserial pk
instrument_id         bigint not null references instruments(id)
period_end            date not null
close                 numeric(18,4)
listed_shares         numeric(24,2)
market_cap            numeric(24,2)
paid_capital          numeric(24,2)
pe_trailing           numeric(18,4)
dividend_yield        numeric(12,4)
net_profit            numeric(24,2)
net_profit_period_end date
last_coupon           numeric(18,4)
ex_date               date
document_id           bigint not null references source_documents(id)
page                  int not null
row_index             int not null
status                text not null default 'staged'  -- staged | approved | rejected
review_note           text
superseded_at         timestamptz
created_at            timestamptz not null default now()
```
- Partial unique index: `(instrument_id, period_end) WHERE superseded_at IS NULL`
  → exactly one live snapshot per stock per period.
- Revisions are new rows; the previous row gets `superseded_at`, never deleted.
- `market` is not stored (join to `instruments`). `as_of` is `period_end`.
- Trading value/volume are not stored (derivable from `daily_bars`).

**Correctness note:** `net_profit` is the trailing figure used for P/E and is
usually an annual number (e.g. 31/12/2025), not the quarter. `net_profit_period_end`
is stored with it and neither the UI nor the AI may describe it as quarterly profit.

### `document_pages` (RAG)
```
id           bigserial pk
document_id  bigint not null references source_documents(id) on delete cascade
page_no      int not null
text         text not null
embedding    vector(1024)
unique (document_id, page_no)
```
- Page-level embeddings, no chunking (24 pages per report; exact citations).
- Only approved/published documents are indexed.
- No ANN index initially; sequential scan is fine at this corpus size.

### `users.is_admin`
`boolean not null default false`. Seeded `true` for `elshenawy19@gmail.com`.
Every `/admin` route and admin API call checks it.

## 4. Pipeline

```
upload → extract → validate → review → publish
```

1. **Upload** — admin submits file + period (period pre-filled from the PDF
   header, editable). File stored at `/var/egx/documents/<sha256>.pdf`.
   Duplicate hash → 409 with a link to the existing document.
2. **Extract** — worker renders table pages (16–24, or detected by heading) at
   300 DPI, sends each to the vision model with a strict row schema, merges the
   pages, writes `/var/egx/extractions/<sha256>.json`, stores its hash.
   The model never writes to the DB.
3. **Validate** — importer reads the JSON and checks per row:
   - `close × listed_shares ≈ market_cap` (≤0.5% relative error)
   - `market_cap ÷ net_profit ≈ pe_trailing` (≤2%)
   - `dividend_yield` within 0–30%
   - no duplicate ticker within a period
   - all required fields present, dates parseable
   Failed rows are `staged` with `review_note` describing the failure — never
   silently dropped or auto-approved.
4. **Review** — dashboard shows the PDF page image beside staged rows with
   matched ticker, confidence, page and check results. Admin edits, confirms
   tickers, approves/rejects per row.
5. **Publish** — approved rows become `approved` and are visible to the app and
   AI; the document moves to `published` and its pages are embedded for RAG.

**Name matching** — normalized Arabic (NFKC, strip tatweel/diacritics) fuzzy
match against `instruments.name_ar`, then `name_en`, with a confidence score.
Low confidence requires explicit confirmation; confirmed mappings are stored so
future reports map deterministically.

**Progress visibility** — per-document JSONL log at
`/var/egx/logs/<sha256>.jsonl` (timestamp, level, stage, message, payload),
streamed to the dashboard over SSE. No events table.

## 5. Duplicates and revisions

| Case | Behaviour |
|---|---|
| Same file uploaded again | Rejected by `sha256`; link to existing document |
| Different file, same period | Revision mode: staged rows diffed against published (changed/unchanged/missing) |
| Publish revision | Old rows get `superseded_at`, new rows approved atomically |
| Two files for one period | Dashboard warns before staging; admin chooses which is authoritative |

## 6. Admin dashboard

- Separate small React SPA (`apps/admin`, Vite) served by the API at `/admin`
  (static files), same origin → existing cookie session.
- Login uses the existing better-auth email OTP flow; `is_admin` gates access.
- Screens: document list, upload, document detail (PDF page image + staged rows
  + live log), revisions diff.
- No component library; plain Tailwind, Arabic-first RTL.

## 7. App and AI integration

- **API:** `GET /api/instruments/{ticker}` gains `snapshots: [{periodEnd, close,
  marketCap, peTrailing, dividendYield, netProfit, netProfitPeriodEnd,
  lastCoupon, exDate, source: {documentId, page}}]` (approved only).
- **Stock screen:** remove the large AI card and the 5-row bottom sheet; add one
  primary button **"تحليل السهم"** that opens the assistant with a full-analysis
  prompt prefilled and auto-sent.
- **AI grounding:** the ticker context includes the latest approved snapshot
  with period and source page. The agent gets two tools:
  `get_snapshot(ticker, period)` (SQL) and `search_documents(query)` (RAG).
  Numbers always come from SQL; documents only for narrative and citation.
  Sharia questions must answer "not available in this source".

## 8. Security

- Upload and review endpoints require `is_admin`.
- Uploaded files are stored outside the web root; downloads go through an
  authenticated route with `Content-Type: application/pdf` and
  `Content-Disposition: inline`.
- File type verified by magic bytes, not extension; size limit 25 MB.
- `sha256` dedupe prevents accidental double imports.

## 9. Testing

- Fixture: this PDF → expected row count, exact COMI values (close 126.300,
  market cap 430,069,068,330, listed shares 3,405,139,100, P/E 5.23).
- A deliberately corrupted row must be flagged by the arithmetic check.
- Duplicate upload → 409. Same-period revision → one live row, old superseded.
- Name matching: high confidence for exact names, low confidence surfaced for
  manual confirmation.
- RAG: citation returns the correct page for a known sentence.
- `typecheck` + `contracts:check` green; gitleaks clean.

## 10. Rollout

1. Migration + admin flag.
2. Upload + extraction + validation (CLI-runnable first).
3. Dashboard review/publish.
4. RAG indexing + agent tools.
5. Mobile button + snapshot display.
