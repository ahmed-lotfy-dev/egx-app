# News Tab — Design

Date: 2026-10-28
Status: Approved
Branch: `feat/m3-stock-detail`

## 1. Summary

Replace the News tab placeholder with a real news feed. The tab has two layered
filter sections: `السوق` (news linked to EGX companies) and `الاقتصاد`
(macro, sector, and global news with no company link). Market news comes from
the existing Arab Finance pipeline; the economy feed is fed by the same Arab
Finance items plus a new Google News RSS job. Articles open externally in the
browser. It extends the existing API and worker; it does not add a reader,
images, or push notifications.

## 2. Scope

In scope:

- Route `/(app)/(tabs)/news` replacing the "coming soon" screen.
- Two filter sections: `السوق` and `الاقتصاد`, backed by one paginated endpoint.
- `GET /api/news` with server-side feed filtering and cursor pagination.
- Google News RSS ingestion for curated economy queries (AR and EN).
- News cards: source, relative time, two-line title, category chip, external
  link.
- Pull-to-refresh, infinite scroll, loading skeletons, empty and error states.
- Arabic-first copy with full English translation.

Out of scope:

- `أسهمي` (watchlist) news — deferred until a watchlist feature exists.
- In-app article reader, article images, sharing, and push notifications.
- A language filter chip in v1 (the endpoint supports `lang`, the app does not
  send it yet).
- Changing the per-stock news screen from M3.

## 3. Feed definition

The two sections are a partition of `news_items` by whether the item is linked
to any instrument:

- `market`: items with at least one row in `news_instrument_links`
  (`EXISTS` subquery).
- `economy`: items with no links (`NOT EXISTS` subquery).

Every item appears in exactly one section. When a Google News item later gets
matched to a company (by the same conservative alias matcher), it moves from the
economy feed to the market feed automatically, because the partition is
computed at read time, not stored.

## 4. Screen layout

Top to bottom:

1. Header: `الأخبار` title, matching the other tabs.
2. Segmented control with two options: `السوق` and `الاقتصاد`. Same style and
   behavior as the رابحون/خاسرون control on the home tab. Default section:
   `السوق`. Switching sections replaces the list and resets pagination.
3. News list (`FlatList`, no section headers): one card per article, newest
   first.
4. Footer states inside the list: loading skeleton row while fetching the next
   page, end-of-list note when no cursor remains.

### News card

- Line 1: source display name (for example `Arab Finance` / `Google News`) and
  relative time (`منذ ساعتين`) in the muted color, plus the category chip on
  the trailing side.
- Line 2: title, max 2 lines with ellipsis, bold.
- Line 3 (optional): summary, max 2 lines, only when present.
- Tapping the card opens the article URL in the in-app browser session
  (`expo-web-browser`, `presentationStyle` default). A chevron/external-link
  affordance on the trailing side.
- Summary is hidden in the `الاقتصاد` list for Google News items whose summary
  is only the publisher attribution (the worker strips it; see §7).

### States

- First-page loading: 4 skeleton cards.
- Empty: `مفيش أخبار في القسم ده دلوقتي` with a retry-free body line explaining
  the feed. Distinct copy per section.
- Error: error card with a retry button, same pattern as the market screen.
- Pull-to-refresh: refetches the current section's first page.
- Keep each section's fetched pages in state while the user toggles between
  sections (no refetch on every switch; refetch on focus is fine).

## 5. Data model

No schema change. Existing tables cover everything:

- `news_items`: `source` (`arabfinance`, `google-news`), `lang`, `title`,
  `summary`, unique canonical `url`, `published_at`, `category`,
  `content_hash`, index on `published_at desc`.
- `news_instrument_links`: the partition signal and per-stock linkage.

## 6. API

### `GET /api/news?feed=market|economy&limit=20&cursor=&lang=ar|en`

New file `apps/api/src/routes/news.ts`, mounted in `apps/api/src/app.ts`.

- `feed` required, `market` or `economy`.
- `limit` optional, clamped to 1–30, default 20.
- `cursor` optional, opaque. Encoding: base64url of `<publishedAtIso>|<id>` of
  the last item of the previous page. Keyset condition:
  `(published_at, id) < (cursorPublishedAt, cursorId)` with
  `order by published_at desc, id desc`. An invalid cursor returns 400 with
  `INVALID_CURSOR`.
- `lang` optional; filters `news_items.lang` when present. v1 app sends no
  `lang`, so the feed mixes languages newest-first (Arab Finance publishes
  parallel AR/EN editions).
- Response `data`: an array of feed items (`id`, `source`, `lang`, `title`,
  `summary`, `url`, `publishedAt`, `category`). This tab uses a dedicated
  `FeedNewsItemSchema` (with `category`, without `matchType`) rather than the
  per-stock `NewsItemSchema`, since `matchType` is meaningless outside a
  company link.
- Response `meta`: `nextCursor` (string or null), `limit`, `feed`, `asOf`
  (newest `publishedAt` in the page, null when empty).
- Reuse `MarketMetaSchema` conventions for the error envelope.

Contract: add `NewsFeedResponseSchema` (and the query-parameter schema) to
`packages/contracts`, then run `bun run contracts:generate` so
`apps/mobile/src/types/api.d.ts` picks up the new path.

## 7. Worker

### Google News RSS ingestion

New provider module `apps/worker/src/providers/google-news.ts` following the
existing provider shape, plus a pass inside `syncNews()` in
`apps/worker/src/jobs/news.ts`.

- Feed URLs: `https://news.google.com/rss/search?q=<query>&hl=<hl>&gl=EG&ceid=<ceid>`
  with curated queries:
  - AR (`hl=ar`, `ceid=EG:ar`): `مصر اقتصاد`, `البورصة المصرية`,
    `أسعار النفط`
  - EN (`hl=en`, `ceid=EG:en`): `Egypt economy`, `Egypt stock market`,
    `oil prices`
- Parse `title`, `link`, `description`, `pubDate`, and the `<source>` element
  (publisher name).
- Canonical URL: prefer the publisher URL extracted from the first `<a href>`
  inside the item description (Google News embeds it there); strip its query
  and hash the same way as `canonicalUrl`. Fall back to the `news.google.com`
  redirect URL when no anchor exists. Keep the Google redirect URL as the
  display URL only when the publisher URL cannot be recovered.
- Summary: Google News summaries are publisher attributions, not excerpts.
  Store `summary: null` for `google-news` items; the publisher name from
  `<source>` is the card's source label.
- Category: `اقتصاد` for AR items, `Economy` for EN items.
- `source: "google-news"`, same `content_hash` formula and unique-URL upsert as
  Arab Finance. Known limitation: when several outlets carry the same story,
  each copy has its own URL, so dedupe by URL cannot collapse them; they show
  as separate cards.
- Run the existing alias matcher on the Google News items so company mentions
  land in the market feed with the same conservative rules.

### Job wiring

- Keep one ingest run per source, both with `job = "news"` so the status
  endpoint and `ingest_runs` consumers stay unchanged: the Arab Finance pass
  keeps `provider = "arabfinance"`, the Google News pass uses
  `provider = "google-news"`. Per-source counts go in each run's metadata.
- Refactor the upsert + alias-matching tail of the current job into a shared
  helper (same file, exported function) taking `(articles, source)` so both
  passes reuse the dedupe/linking logic without a behavior change.
- CLI stays `worker news`; it now runs both passes sequentially and prints both
  results. A Google News failure must not fail the Arab Finance pass; the
  command exits nonzero only if both fail.
- `sync:all` order is unchanged; `news` is still last.

## 8. Frontend

- `apps/mobile/src/app/(app)/(tabs)/news.tsx`:
  - `useInfiniteQuery` from `@tanstack/react-query` per selected feed, keyed
    `["news", feed]`; `getNextPageParam` from `meta.nextCursor`.
  - `FlatList` with `onEndReached` (threshold ~0.5) fetching the next page,
    `refreshControl` for pull-to-refresh, and `keyExtractor` by item id.
  - Segmented control component extracted or restyled from the home movers
    control; keep the same visual tokens.
  - Open links with `expo-web-browser` (`openBrowserAsync`); ignore a second
    tap while the browser is open.
- `apps/mobile/src/lib/format.ts`: reuse `formatRelativeTime` as-is; it already
  produces Latin-digit labels for `ar` and `en`.
- Numbers and dates keep the existing conventions; no new formatting logic.

## 9. Locale and RTL

- All copy in `ar.json` and `en.json` with key parity under a `newsTab` block
  (the existing `news` block stays for the stock screen): section names,
  empty/error copy, end-of-list note, source label fallback.
- Arabic-first: the tab defaults to Arabic copy; RTL mirroring follows the app
  direction already handled by the root layout.
- Avoid Arabic copy starting with `كل ` (IBM Plex shaping bug); use `جميع`.
- The category chip shows the stored category text as-is (it is already in the
  item's language).

## 10. Verification

- API curls against the deployed API: `feed=market` returns only linked items,
  `feed=economy` returns only unlinked items, `cursor` pagination walks the
  full set without duplicates or gaps, invalid cursor → 400, `limit=100` →
  clamped to 30, `lang=ar` filters.
- Worker: run `worker news` locally against the local DB; confirm Google News
  items land with `source = google-news`, `summary = null`, publisher-backed
  canonical URLs, and that matched company mentions create links.
- Emulator: News tab renders both sections, switch preserves state, pull to
  refresh, scroll to the end, tap a card opens the article, Arabic RTL and
  English LTR, empty/error states.
- `bun run typecheck`, `bun run contracts:check`, locale JSON validation, and
  gitleaks before commit.
- Update the discovery note for news sources with the Google News decision.
