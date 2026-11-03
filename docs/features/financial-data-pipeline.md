# Financial Data Pipeline

**Status:** 🚧 In progress (design approved, implementation started 2026-11-03)
**Branch:** `feat/financial-data-pipeline`
**Spec:** `docs/superpowers/specs/2026-11-03-financial-data-pipeline-design.md`
**Plan:** `docs/superpowers/plans/2026-11-03-financial-data-pipeline.md`

---

## 1. What

Admin uploads EGX quarterly market reports; the pipeline extracts the per-stock
tables, validates them, and publishes verified quarterly snapshots that the
stock screen and the AI assistant use.

Source document: EGX quarterly report (`DiscDoc_ID55542_30-Sep-2026_ARB.pdf`,
24 pages, Oracle BI Publisher, text-based). Per-stock tables are on pages 16–24.

Each snapshot carries: close, listed shares, market cap, paid capital, trailing
P/E, dividend yield, net profit (with its own period end), last coupon and
ex-date — plus the source document and page.

## 2. What it is not

- **Not Sharia screening.** The report has no debt, cash or interest income, so
  a compliance ratio cannot be computed from it. The AI must say "not available
  in this source" rather than guess.
- **Not full financial statements.** No income statement, balance sheet or cash
  flow. Those need company filings (future work).
- **Not a scraper.** Documents are uploaded manually by the admin for legal
  reasons. No automated fetching of EGX files.

## 3. Architecture

```
admin dashboard ──upload──► source_documents ──► worker: extract (vision)
                                                        │
                                                        ▼
                                        /var/egx/extractions/<sha256>.json
                                                        │
                                     worker: validate + match (deterministic)
                                                        │
                                                        ▼
                                          stock_snapshots (staged)
                                                        │
                                        admin review / approve / publish
                                                        │
                              ┌─────────────────────────┴──────────────────┐
                              ▼                                            ▼
                    GET /api/instruments/{ticker}                document_pages (RAG)
                              │                                            │
                              ▼                                            ▼
                        stock screen                            AI tools: get_snapshot,
                                                                search_documents
```

### Tables

| Table | Purpose |
|---|---|
| `source_documents` | one row per uploaded file: sha256, period, status, paths, model |
| `stock_snapshots` | verified per-stock values, one live row per `(instrument, period_end)` |
| `document_pages` | page text + embedding, RAG only, approved documents only |

`users.is_admin` gates the dashboard and admin API.

### Why the second pass is code, not AI

The vision model produces the JSON artifact once. The importer that writes rows is
deterministic: the same artifact always produces the same rows, and a re-import
can be diffed. Letting the model write to the database directly would make
errors invisible and unreproducible.

### Validation rules

- `close × listed_shares ≈ market_cap` (≤0.5% relative error)
- `market_cap ÷ net_profit ≈ pe_trailing` (≤2%)
- `dividend_yield` in 0–30%
- no duplicate ticker within one period
- required fields present, dates parseable

Any failure keeps the row `staged` with a readable `review_note`. Nothing is
silently dropped and nothing is auto-approved.

### Duplicates and revisions

| Case | Behaviour |
|---|---|
| Same file again | rejected by `sha256`, link to existing document |
| Different file, same period | revision mode, diff against published rows |
| Publish revision | old rows get `superseded_at`, new rows approved atomically |
| Two files for one period | dashboard warns before staging |

### Correctness note

`net_profit` is the trailing figure used for P/E — usually annual (e.g.
`31/12/2025`), not the quarter. `net_profit_period_end` is stored with it. Neither
the UI nor the AI may call it "quarterly profit".

## 4. Dashboard

`apps/admin` (Vite + React + Tailwind, Arabic-first RTL) served by the API at
`/admin`, same origin so the Better Auth cookie works. Login is the normal email
OTP flow; access requires `is_admin`.

Screens: document list → upload → document detail (PDF page image beside staged
rows, confidence, failed checks, edit/confirm ticker, approve/reject, publish) →
revision diff. A live log panel streams the per-document JSONL log over SSE.

## 5. AI integration

- `get_snapshot(ticker, period)` — SQL, returns values + document + page.
- `search_documents(query)` — pgvector over page text, returns page citations.
- Numbers always from SQL; documents only for narrative and citations.
- Sharia questions return "not available in this source".

## 6. Storage layout

```
/var/egx/
  documents/<sha256>.pdf
  extractions/<sha256>.json
  logs/<sha256>.jsonl
```

Files live outside the web root; downloads go through an authenticated route.

## 7. Testing

- Fixture: the Q3 2026 report → expected row count and exact COMI values
  (close 126.300, market cap 430,069,068,330, shares 3,405,139,100, P/E 5.23).
- A deliberately corrupted row must be flagged by the arithmetic check.
- Duplicate upload → 409; same-period revision → one live row, old superseded.
- Name matching: exact names high confidence; ambiguous ones require confirmation.
- RAG: a known sentence returns the correct page.
- `typecheck` and `contracts:check` green; gitleaks clean.

## 8. Progress log

| Date | Phase | Status |
|---|---|---|
| 2026-11-03 | Design approved | done |
| 2026-11-03 | Docs scaffold (`AGENTS.md`, `architecture.md`, this file) | done |
| — | Phase 1: schema + admin flag | next |
| — | Phase 2: storage + upload API | pending |
| — | Phase 3: extraction worker | pending |
| — | Phase 4: validation + staging | pending |
| — | Phase 5: dashboard | pending |
| — | Phase 6: publish + API exposure | pending |
| — | Phase 7: RAG | pending |
| — | Phase 8: mobile button + snapshots | pending |
| — | Phase 9: deploy + verification | pending |
