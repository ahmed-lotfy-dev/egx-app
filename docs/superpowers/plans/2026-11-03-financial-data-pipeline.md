# Implementation Plan — Financial Data Pipeline

**Spec:** `docs/superpowers/specs/2026-11-03-financial-data-pipeline-design.md`
**Branch:** `feat/financial-data-pipeline`

Each phase is independently testable. Do not start a phase before the previous
one is green (`typecheck`, migration applied, manual check).

## Phase 1 — Schema and admin flag

1. `apps/api/src/db/schema/documents.ts`:
   - `sourceDocuments`, `stockSnapshots`, `documentPages`
   - partial unique index `(instrument_id, period_end) WHERE superseded_at IS NULL`
2. `users.isAdmin` column in `apps/api/src/db/schema/auth.ts`.
3. Export from `schema/index.ts`.
4. `bun run db:generate` → review SQL → `bun run db:migrate` locally.
5. Seed script `apps/api/src/scripts/seed-admin.ts` — sets `is_admin` for
   `elshenawy19@gmail.com` (idempotent, prints result).

**Done when:** migration applies on a fresh DB, `\d stock_snapshots` shows the
partial unique index, admin seed reports one row updated.

## Phase 2 — Storage and upload API

1. `apps/api/src/lib/documents.ts`:
   - `storageRoot()` from `DOCUMENTS_DIR` (default `/var/egx`),
   - `saveUpload(bytes, filename)` → sha256, magic-byte check (`%PDF-`),
     write `<root>/documents/<sha256>.pdf`, 25 MB cap,
   - `readDocument(sha256)` for authenticated streaming.
2. `apps/api/src/routes/admin-documents.ts`:
   - `POST /api/admin/documents` (multipart: file, periodStart, periodEnd)
   - `GET /api/admin/documents` (list + status)
   - `GET /api/admin/documents/{id}` (detail + staged rows)
   - `GET /api/admin/documents/{id}/file` (inline PDF)
   - `GET /api/admin/documents/{id}/events` (SSE from JSONL log)
   - all guarded by `requireAdmin` middleware (`apps/api/src/lib/admin.ts`)
3. Duplicate `sha256` → 409 `{ error: { code: "duplicate_document", documentId } }`.

**Done when:** admin uploads the fixture PDF, duplicate returns 409, file lands
in the documents dir, non-admin gets 403.

## Phase 3 — Extraction worker

1. `apps/worker/src/jobs/extract-document.ts`:
   - poll `source_documents` where `status = 'uploaded'` (SKIP LOCKED),
   - mark `extracting`, render pages via `pdftoppm -r 300 -png` (page range from
     detected table pages; fallback 16–24),
   - call vision model per page (`apps/worker/src/providers/nim-vision.ts`),
     strict JSON schema, temperature 0,
   - merge pages, write `<root>/extractions/<sha256>.json`, store hash/model,
   - status `extracted`, or `failed` with error.
2. JSONL event log per stage; helper `apps/worker/src/lib/doc-log.ts`.
3. CLI: `bun src/cli.ts extract-document <sha256>`.

**Done when:** fixture PDF produces a JSON with ~200+ rows; row count and COMI
values match the manual count; failed page leaves status `failed` + partial file.

## Phase 4 — Validation and staging

1. `apps/worker/src/jobs/stage-document.ts`:
   - read JSON artifact (never re-run the model),
   - normalize Arabic names (NFKC, strip tatweel/diacritics, collapse spaces),
   - fuzzy match to `instruments.name_ar` then `name_en` (score 0–1),
   - arithmetic checks from the spec, ranges, duplicate ticker per period,
   - insert `stock_snapshots` rows `status='staged'` with `review_note`,
   - status `validated`.
2. Reject the whole document if zero rows parse (status `failed`).

**Done when:** known-good rows pass, the corrupted fixture row is flagged with
a readable note, and every row has a ticker or an explicit "unmatched" note.

## Phase 5 — Admin dashboard

1. `apps/admin` (Vite + React + Tailwind), Arabic-first RTL.
2. Screens: login prompt → documents list → upload → document detail.
3. Document detail: PDF page image (via `/file#page=N`), staged table with
   confidence/checks, editable cells, ticker confirm, approve/reject, publish.
4. Live log panel via SSE.
5. Build served by API at `/admin` (`@hono/node-server/serve-static` or
   `hono/bun` static) with SPA fallback.

**Done when:** upload → review → publish works end to end in the browser.

## Phase 6 — Publish and API exposure

1. `POST /api/admin/documents/{id}/publish` — atomic transaction:
   supersede previous live rows for the same period, approve selected rows,
   set document `published`.
2. `GET /api/instruments/{ticker}` includes `snapshots` (approved, newest first).
3. Contracts: regenerate OpenAPI + mobile types (`contracts:generate`).

**Done when:** published snapshot appears in the instrument response; mobile
typecheck passes.

## Phase 7 — RAG

1. Enable pgvector: switch compose DB image to `pgvector/pgvector:pg18`
   (same PGDATA volume), `CREATE EXTENSION IF NOT EXISTS vector`.
2. On publish: chunk per page, embed with NIM embeddings, insert `document_pages`.
3. `apps/api/src/lib/rag.ts`: `searchDocuments(query, limit)` cosine search.
4. Agent tools in `apps/api/src/routes/ai.ts`: `get_snapshot`, `search_documents`.
5. System prompt: numbers only from tools; cite document + page; refuse Sharia.

**Done when:** asking "P/E بتاع COMI كام؟" returns the snapshot value with the
Q3 document and page; a narrative question returns a page citation.

## Phase 8 — Mobile

1. Stock screen: delete the AI card and the bottom sheet; add one primary
   **"تحليل السهم"** button that opens `/ai?ticker=X&q=...` with auto-send.
2. Add a compact "البيانات الربع سنوية" section from `snapshots`.
3. Localize new strings in `ar.json` / `en.json`.

**Done when:** emulator shows one button, analysis opens with prompt sent, and
the quarterly section renders the published period.

## Phase 9 — Docs and deploy

1. Update `docs/features/financial-data-pipeline.md`, `docs/architecture.md`,
   `AGENTS.md`.
2. Build API + worker images, deploy via `docker save | scp | docker load`.
3. Run the pipeline on prod with the fixture; verify published snapshot + AI.

**Done when:** prod serves the snapshot and AI cites it; docs match reality.
