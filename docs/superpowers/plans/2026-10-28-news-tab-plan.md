# News Tab — Implementation Plan

Date: 2026-10-28
Spec: `docs/superpowers/specs/2026-10-28-news-tab-design.md`
Branch: `feat/m3-stock-detail`

Local env: `.env` has `PORT=3000` and `DATABASE_URL` pointing at
`127.0.0.1:5433/egx`. Every command below runs from the repo root unless the
task says otherwise. Commit after each task; gitleaks runs on commit.

---

## Task 1 — Contracts: feed schemas

1. In `packages/contracts/src/market.ts`, below `NewsItemSchema`:
   - `FeedNewsItemSchema`: `id` (int), `source` (string), `lang`
     (`ar`/`en`), `title` (string), `summary` (string|null), `url`
     (string), `publishedAt` (ISO datetime), `category` (string|null).
   - `NewsFeedResponseSchema`: `{ data: FeedNewsItemSchema[], meta: {
     nextCursor: string|null, limit: number, feed: "market"|"economy",
     asOf: ISO datetime|null } }`.
   - Export matching types.
2. Re-export from `packages/contracts/src/index.ts` if news types are
   re-exported there.

Verify: `bun run --cwd packages/contracts typecheck` (if present) or rely on
Task 2's full typecheck.

Commit: `feat(api): add news feed response contracts`

---

## Task 2 — API: `GET /api/news`

1. Create `apps/api/src/routes/news.ts` following
   `instrument-news.ts`:
   - Route path `/api/news`, tag `market`, summary "News feed".
   - Query schema: `feed` (`market`|`economy`), `limit`
     (`coerce.number().int().min(1).max(30).default(20)`), `cursor`
     (string, optional), `lang` (`ar`/`en`, optional).
   - Decode cursor: base64url decode, split on `|` →
     (`publishedAtIso`, `id`). Invalid format or non-ISO date → 400
     `{ error: { code: "INVALID_CURSOR", ... } }`.
   - Base query on `newsItems`, `order by published_at desc, id desc`,
     `limit = limit + 1`; condition on feed:
     - `market`: `EXISTS (select 1 from news_instrument_links where
       news_id = news_items.id)`
     - `economy`: `NOT EXISTS (...)`
     - `lang`: add `eq(newsItems.lang, lang)` when present.
     - `cursor`: `or(lt(publishedAt, cursorDate), and(eq(publishedAt,
       cursorDate), lt(id, cursorId)))`.
   - Fetch one extra row; `nextCursor` = last returned item when the extra
     row exists, else null. `asOf` = first item's `publishedAt` or null.
2. Mount in `apps/api/src/app.ts`: import `newsRoutes`, add
   `app.route("/", newsRoutes)`.
3. Run `bun run contracts:generate` (regenerates
   `packages/contracts/openapi.json` and `apps/mobile/src/types/api.d.ts`).

Verify:
- `bun run --cwd apps/api typecheck`
- `bun run contracts:check`
- Start `bun run --cwd apps/api dev`; curl:
  - `/api/news?feed=market` → all items have links (spot-check one id via
    psql), `meta.nextCursor` present when >20 items exist.
  - `/api/news?feed=economy` → no linked ids.
  - Follow `nextCursor` for a second page; no overlap with page 1.
  - `?cursor=garbage` → 400 `INVALID_CURSOR`.
  - `?feed=market&limit=100` → 30 items max.
  - `?lang=ar` → only `lang: "ar"` items.

Commit: `feat(api): add paginated news feed endpoint`

---

## Task 3 — Worker: shared ingestion helper

Refactor only; no behavior change.

1. In `apps/worker/src/jobs/news.ts`, extract the tail of `syncNews`
   (upsert `values` by URL, alias matching, link insert) into an exported
   async function `ingestArticles(articles: Map<string, Article>, source:
   string): Promise<{ itemsOk, linked, instrumentsWithNews }>`. Keep
   `withIngestRun` inside `syncNews` for now.
2. Make `Article.source` explicit: add `source: string` to the `Article`
   type (set by the caller, not the feed loop) or pass it as an argument —
   pick whichever touches fewer lines.
3. `syncNews` keeps: alias build, Arab Finance fetch loop, then calls
   `ingestArticles(articles, "arabfinance")`.

Verify: `bun run --cwd apps/worker typecheck`, then
`bun run --cwd apps/worker sync:news` against local DB — row counts and
linked counts match the pre-refactor run (compare `ingest_runs` metadata).

Commit: `refactor(worker): extract shared news ingestion helper`

---

## Task 4 — Worker: Google News pass

1. Create `apps/worker/src/providers/google-news.ts`:
   - Export `GOOGLE_QUERIES`: AR `["مصر اقتصاد", "البورصة المصرية",
     "أسعار النفط"]`, EN `["Egypt economy", "Egypt stock market",
     "oil prices"]`, each with `lang` + `ceid` (`EG:ar` / `EG:en`).
   - Export `buildGoogleNewsUrl(query, lang)`: `https://news.google.com/rss/search?q=<encoded>&hl=<lang>&gl=EG&ceid=<ceid>`.
   - Export `parseGoogleNewsItem(node)`: reuse the XML helpers from
     `jobs/news.ts` (move `textValue`/`asRecord`/`asArray` into the provider
     or a small shared `lib/xml.ts` if cleaner). Returns title, link,
     publisher name (`<source>`), first `<a href>` from description, pubDate.
   - Export `publisherUrl(descriptionHtml)`: extract first anchor href,
     run it through the same `canonicalUrl` rules (https, lowercase host,
     strip hash+query, strip trailing slashes); return null when absent.
2. In `jobs/news.ts`, add a `syncGoogleNews()` function:
   - Fetch each of the 6 feeds (`fetchWithRetry`, same UA and timeouts,
     250ms sleep between feeds).
   - Skip items with no title/link/pubDate. `lang` from the query, `category`
     = `اقتصاد` (AR) / `Economy` (EN), `source = "google-news"`,
     `summary = null`.
   - Canonical URL: publisher URL when recoverable, else the Google redirect
     URL through `canonicalUrl`.
   - Run alias matching on title + publisher name only (no summary).
   - Each pass wrapped in its own `withIngestRun("news", provider)`: Arab
     Finance keeps provider `arabfinance`; Google pass uses
     `provider = "google-news"` with per-query counts in metadata.
   - A Google failure logs a warning and returns; it does not throw unless
     both sources failed (report via the CLI exit path).
3. CLI `news` case in `apps/worker/src/cli.ts`: run both passes
   sequentially, print both results. Exit nonzero only when both fail.

Verify:
- `bun run --cwd apps/worker sync:news`
- psql checks: new rows with `source='google-news'`, `summary IS NULL`,
  URLs that are NOT `news.google.com` for most items; matched items got
  links; `ingest_runs` has a `google-news` provider row.
- Run twice: no duplicate URLs, item count stable.

Commit: `feat(worker): ingest Google News economy feeds`

---

## Task 5 — Mobile: News tab

1. `apps/mobile/src/app/(app)/(tabs)/news.tsx`:
   - `type NewsFeed = "market" | "economy"`, state `feed`, default
     `"market"`.
   - `useInfiniteQuery({ queryKey: ["news", feed], ... })` calling
     `api.GET("/api/news", { params: { query: { feed, cursor } } })`,
     `initialPageParam: undefined`, `getNextPageParam` from
     `meta.nextCursor`.
   - Header `الأخبار` + segmented control (extract a small
     `NewsFeedTabs` component in the same file; reuse the movers tab
     styling from `index.tsx`).
   - `FlatList`: `data` = flattened pages, `keyExtractor` = id,
     `onEndReachedThreshold={0.5}` → `fetchNextPage` when
     `hasNextPage && !isFetchingNextPage`, `refreshControl` →
     `refetch()`, `ListFooterComponent`: skeleton row while
     `isFetchingNextPage`, end-of-list note when `!hasNextPage` and items
     exist.
   - `NewsCard` component: source label + `formatRelativeTime` + category
     chip; title `numberOfLines={2}`; summary 2 lines when non-null; open
     `url` with `openBrowserAsync` on press (guard with an `opening` ref);
     external-link icon on the trailing side.
   - States: 4 skeleton cards while first-load; empty state per feed;
     error card with retry (`refetch`); keep both feeds cached (react-query
     does this via the query key).
2. Locales: add a `newsTab` block to `apps/mobile/src/locales/ar.json` and
   `en.json` with full key parity:
   `title`, `marketTab`, `economyTab`, `emptyMarketTitle`,
   `emptyMarketBody`, `emptyEconomyTitle`, `emptyEconomyBody`,
   `errorTitle`, `errorBody`, `retry`, `endOfList`, `sourceFallback`.
   No keys starting with `كل ` in Arabic.
3. i18n typecheck if the project has a locale key check script; otherwise
   validate JSON loads.

Verify:
- `bun run --cwd apps/mobile typecheck`
- Metro is already running (port 8081): reload the News tab in the
  emulator (`emulator-5554`), exercise both sections, toggle switch,
  pull-to-refresh, scroll to end, tap a card, switch app language to EN and
  back.

Commit: `feat(mobile): news tab with market and economy feeds`

---

## Task 6 — Final verification and docs

1. Full gates from the root: `bun run typecheck` (all workspaces),
   `bun run contracts:check`, locale JSON validation, gitleaks.
2. Update `docs/discovery/02-news-sources.md` with the Google News
   decision (queries, publisher-URL recovery, dedupe limitation).
3. Local end-to-end re-check, then compare deployed API plan: the endpoint
   ships with the next backend deploy; confirm the mobile app handles the
   old API gracefully (News tab shows the error state, not a crash) until
   the backend is redeployed.

Commit: `docs: note Google News in news sources discovery`

---

## Rollout notes

- Backend deploy is the same workflow as M3: build/push the API image, then
  `docker compose up -d` on `ubuntu@139.185.55.63` (`egx-api`); no DB
  migration is needed.
- After deploy: run `bun run --cwd apps/worker sync:news` against production
  once so `google-news` rows exist, and re-run the Task 2 curls against
  `https://egx-api.alotfy.site` (mind the 15–48s cold start).
- Mobile ships via EAS update as before.
