# AGENTS.md — EGX App

Arabic-first EGX market app. Read this before changing anything.

## Repo map

```
apps/mobile        Expo SDK 58 + expo-router + Uniwind (NativeWind). Arabic-first, RTL.
apps/api           Bun + Hono + Drizzle + Better Auth. Serves /api.
apps/worker        Ingestion CLI + long-running scheduler (TradingView, Yahoo, RSS, NIM).
packages/contracts Shared Zod schemas + generated OpenAPI + mobile API types.
docs/              Architecture, feature docs, specs and plans.
```

## Commands

```sh
bun install
bun run db:up                 # postgres on host :5433 (container egx-db)
bun run db:generate           # drizzle-kit generate (review the SQL!)
bun run db:migrate
bun run dev:api               # API on :3000
bun run dev:mobile
bun run typecheck             # api + worker + mobile
bun run contracts:check       # OpenAPI drift + generated types
```

Worker jobs: `bun run --cwd apps/worker src/cli.ts <job>` (see `apps/worker/src/cli.ts`).

## Hard rules

- **Arabic-first.** Arabic strings live in `apps/mobile/src/locales/ar.json`.
  Never use `tracking-*` on Arabic text.
- **No localhost in mobile.** The app always targets `https://egx-api.alotfy.site`.
- **No secrets in git.** A gitleaks pre-commit hook runs; never commit `.env`.
- **No fabricated numbers.** The AI only states values returned by tools/SQL and
  must cite the source document and page.
- **EGX only.** Saudi and international instruments/news were removed. Do not
  reintroduce a `market` column or cross-market queries without a new design.
- **Migrations are reviewed, not auto-applied.** Generate, read the SQL, then migrate.

## Data model (core)

`instruments`, `latest_quotes`, `daily_bars`, `fundamentals`, `news_items`,
`news_instrument_links`, `macro_quotes`, `watchlists`, `watchlist_items`,
`ingest_runs`, `news_processing_queue`, plus Better Auth tables.

Financial pipeline (in progress) adds `source_documents`, `stock_snapshots`,
`document_pages`. See `docs/features/financial-data-pipeline.md`.

## Docs

- `docs/architecture.md` — system architecture, data flow, deploy, constraints.
- `docs/features/<feature>.md` — one doc per shipped feature (what/why/how/testing).
- `docs/superpowers/specs/` — approved designs.
- `docs/superpowers/plans/` — implementation plans.

When you finish a feature, update its feature doc. When you change architecture,
update `docs/architecture.md` in the same commit.
