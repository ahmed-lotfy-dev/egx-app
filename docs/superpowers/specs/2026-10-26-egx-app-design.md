# EGX Mobile App and API: Design Specification

Status: approved for implementation
Date: 2026-10-26
Owner: Ahmed Lotfy
Project path: `/mnt/hdd/projects/mobile/ongoing/egx-app`

## 1. Summary

A private, Arabic-first mobile app for the Egyptian Exchange (EGX). It brings a market
overview, searchable stock directory, stock detail with charts, a personal watchlist,
bilingual news, and an AI research assistant that answers questions using data stored in
our own database.

The app is not a trading platform. It does not place orders, move money, or promise
returns. The AI provides grounded analysis and risk context with source dates, never
guaranteed outcomes or direct buy and sell instructions.

## 2. Why this design

The project inherits Phase 0 research from `/mnt/hdd/projects/egx-portal/docs`, copied to
`docs/discovery`. The research established:

- There is no free, licensed, reliable EGX price API.
- TradingView `/egypt/scan` returns 296 EGX instruments with Arabic names, sectors,
  market caps, and logos, unauthenticated.
- TradingView `/scan` also supplies usable fundamentals for roughly the top 70 to 90 names.
- Yahoo `.CA` chart endpoints supply daily price history. Intraday is not available.
- Publisher RSS supplies more than 500 news items per language per poll, free.
- Absolute money fields from TradingView `/scan` are in EGP.
- Absolute money fields from TradingView `/symbol` are converted to USD while still
  labelled EGP, producing an approximately 50x discrepancy.
- Multi-year financial statements are not available from free sources, so DCF is not
  defensible. Relative valuation is.

The app therefore owns its data. Third parties are polled on a schedule into Postgres.
The app never calls a third party during render.

## 3. Goals

1. One place to follow the EGX market and a personal watchlist in Arabic, with English
   available as a full alternative.
2. Every price, ratio, and news item carries a source and an as-of timestamp.
3. An AI assistant that answers stock and market questions from our data, cites what it
   used, and states what it does not know.
4. A data pipeline that fails visibly and never publishes stale data as current.
5. A codebase that reuses the owner's proven SelfTracker patterns and can be extended with
   alerts, portfolio, and a web portal later.

## 4. Non-goals for v1

- Order execution, brokerage integration, or payments.
- Push notifications and price alerts.
- Portfolio tracking and profit and loss.
- A Sharia compliance engine or verdicts. This needs a licensed methodology and
  structured statements. It stays out until those inputs exist.
- DCF or intrinsic valuation.
- Real-time tick streaming.
- Public web portal, SEO, and marketing site.
- Social features, comments, or community feeds.
- Offline write queue.

## 5. Users and core flows

Primary user: an Egyptian retail investor who follows EGX-listed companies, wants Arabic
company names and Arabic news, and wants quick answers about prices, fundamentals, and
recent developments.

Core flows:

1. Open app, sign in, land on Markets, see EGX 30, breadth, and movers.
2. Search "كومي" or "COMI", open the stock, read the quote, chart, stats, peers, and news.
3. Add the stock to the watchlist and reorder it later.
4. Read Arabic or English news, filtered by sector.
5. Ask the AI "هل كومي مكسب؟" or "Compare COMI and ETEL on P/E and dividends" and receive
   a streamed answer with citations and a disclaimer.
6. Switch the interface to English from Profile.

## 6. Architecture

Server-first. Postgres is the single source of truth. An ingestion worker writes into it,
the API reads from it, and the mobile app reads the API.

```
            +---------------------+
            |   Expo mobile app   |
            |  tanstack/query     |
            +----------+----------+
                       |
                 HTTPS + SSE
                       |
            +----------v----------+
            |    Bun + Hono API   |
            |  auth, market, AI   |
            +----+-----------+----+
                 |           |
          +------v---+   +---v-----------------+
          | Postgres |   | NVIDIA NIM          |
          | Drizzle  |   | chat completions    |
          +------^---+   +---------------------+
                 |
       +---------+----------+
       |   Ingestion worker |
       | TradingView, Yahoo |
       | RSS, scheduler     |
       +--------------------+
```

Rules:

- No third-party market call at request time.
- The worker and the API are separate processes with separate entrypoints. They share the
  database and the provider modules.
- Mobile never holds provider credentials.
- One provider interface, so TradingView or Yahoo can be replaced without touching the
  app or the API contract.

## 7. Repository layout

```
egx-app/
  package.json             Bun workspaces root
  bun.lock
  apps/
    mobile/
      src/
        app/               Expo Router routes
        components/        shared UI
        features/          market, stock, watchlist, news, ai, auth
        lib/               api client, auth client, i18n, format
        stores/            zustand stores
        constants/         design tokens
        types/             generated OpenAPI types
      assets/fonts/        IBM Plex Sans Arabic, Inter
      app.json
      eas.json
      global.css
    api/
      src/
        config/            env, AI providers, market calendar
        db/
          schema/          Drizzle tables
          migrations/
          seed/
        providers/         tradingview, yahoo, rss
        ingest/            universe, quotes, bars, news, jobs
        routes/            auth, market, instruments, watchlist, news, chat, status
        services/          market, instruments, news, watchlist, ai, tools
        lib/               logger, errors, rate limit, freshness
        index.ts           API entrypoint
        worker.ts          ingestion and job entrypoint
      tests/
        fixtures/          copied reference JSON and RSS samples
      evals/               AI prompt set and runner
  packages/
    contracts/             Zod schemas and the OpenAPI document
  docs/
    discovery/             copied Phase 0 research
    PRODUCT.md
    DESIGN.md
    superpowers/specs/     this document and later specs
  docker-compose.yml       Postgres 18 for local development
  README.md
```

The workspace root uses Bun workspaces. `packages/contracts` is the single source of API
truth: Zod request and response schemas plus the OpenAPI document. `openapi-typescript`
generates `apps/mobile/src/types/api.d.ts` from that document, and the mobile app calls the
API with `openapi-fetch`. A CI check regenerates the types and fails if the checked-in
output is stale. No hand-mirrored DTOs.

## 8. Stack

Mobile:

- Expo SDK 58.0.19, React 19.3.1, React Native 0.88.0, TypeScript 6
- expo-router 58.0.26 with typed routes
- Uniwind 1.13.0 with Tailwind CSS 4 for styling
- Zustand 5.0.16 for session, locale, and UI state
- TanStack Query 5.105 for server state and polling
- Better Auth Expo client 1.7.13 with SecureStore
- `openapi-fetch` 0.17 against generated OpenAPI types
- AI SDK 7 (`ai` 7.0.153, `@ai-sdk/react` 4.0.157) with `DefaultChatTransport`
  over `expo/fetch`
- Victory Native XL 43.0.1 with Skia 2.14 for detail charts, react-native-svg for
  lightweight row sparklines
- FlashList 2.3, Reanimated 4, gesture-handler, keyboard-controller
- i18next 26 and react-i18next 17, expo-localization 58
- expo-web-browser for article links, expo-font for bundled fonts
- react-native-markdown-display for AI answer text

Backend:

- Bun runtime, Hono 4.13.14
- Zod 4.6.7, `@hono/zod-openapi`, Scalar API reference
- Drizzle ORM 0.45.4 and drizzle-kit, Postgres 18
- Better Auth 1.7.13 with the Drizzle adapter and the email OTP plugin
- pg-boss 12.38 for durable jobs, cron schedules, retries, and backoff
- AI SDK 7 with `@ai-sdk/openai-compatible` 3.0.78 for NVIDIA NIM and
  `@ai-sdk/google` 4.0.105 for Gemini fallback
- Pino for structured logs
- `fast-xml-parser` for RSS
- Resend for OTP and account email
- `openapi-typescript` 7.13 in CI to generate the mobile client types

Infrastructure:

- Docker Compose with `postgres:18-alpine`
- Two processes in development and production: `api` and `worker`
- pg-boss schedules and retries live in the worker. The API only reads the database.
- EAS Build for Android first, iOS later

## 9. Data model

All tables use `timestamptz` for time. All money amounts store the currency explicitly.
Numeric columns use `numeric`, not floats.

### `instruments`

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| ticker | text unique not null | `COMI` |
| tv_symbol | text unique not null | `EGX:COMI` |
| yahoo_symbol | text null | `COMI.CA` |
| isin | text null | when known |
| name_en | text not null | |
| name_ar | text null | from TradingView |
| search_name_en | text not null | lowercase, punctuation stripped |
| search_name_ar | text null | Arabic-normalized |
| sector | text null | |
| industry | text null | |
| logoid | text null | TradingView logo id |
| kind | text not null default `stock` | `stock`, `index`, `etf` |
| currency | text not null default `EGP` | |
| is_active | boolean not null default true | |
| created_at, updated_at | timestamptz not null | |

`search_name_ar` is produced by a Postgres `normalize_arabic(text)` function that removes
diacritics and tatweel, unifies alef variants to ا, ya variants to ي, and ta marbuta to ه.
It is immutable and used by both backfill and query paths.

Indexes: unique `ticker`, unique `tv_symbol`, GIN trigram on `search_name_en` and
`search_name_ar` after enabling `pg_trgm`, btree on `sector`.

### `instrument_aliases`

`id`, `instrument_id`, `alias`, `lang` (`ar` or `en`), `normalized_alias`, `source`.
Unique on `(instrument_id, normalized_alias)`. Examples: `CIB`, `COMI`,
`التجارى الدولى`, `التجاري الدولي`, `Commercial International Bank`. Aliases feed search and
AI ticker resolution. Seed from TradingView names, Egyptian exchange naming, and manual
entries for the top 50 names.

### `latest_quotes`

One row per instrument, upserted on every poll. Used for fast list and detail reads.

| Column | Type |
|---|---|
| instrument_id | bigint PK references instruments |
| price | numeric(18,4) |
| change | numeric(18,4) |
| change_pct | numeric(10,4) |
| volume | bigint |
| market_cap | numeric(24,2) |
| currency | text |
| source | text |
| as_of | timestamptz |
| fetched_at | timestamptz |

### `quote_snapshots`

Append-only history of polls, for audit and sparkline building.

`id`, `instrument_id`, `price`, `change`, `change_pct`, `volume`, `market_cap`, `currency`,
`source`, `as_of`, `fetched_at`. Index on `(instrument_id, as_of desc)`.
Retention: 90 days, then delete by scheduled job. Raw quote payloads are not stored here,
to keep the table small. They are written to `ingest_payloads` only when a parse fails.

### `daily_bars`

`instrument_id`, `date` (Cairo trading date), `open`, `high`, `low`, `close`, `volume`,
`source`, `raw jsonb`. Unique on `(instrument_id, date)`. History backfill: 1 year when the
provider allows it, 60 days for Yahoo daily.

### `fundamentals`

One current row per instrument plus history keyed by as-of date.

`instrument_id`, `as_of date`, `currency`, `market_cap`, `pe`, `pb`, `eps`, `roe`, `roa`,
`debt_to_equity`, `dividend_yield`, `revenue_ttm`, `net_income_ttm`, `fcf_ttm`,
`current_ratio`, `beta`, `total_shares`, `source`, `raw jsonb`. Unique on
`(instrument_id, as_of, source)`. Missing values stay null. The API exposes coverage flags
instead of filling gaps with zero. `total_shares` is a share count, not a money amount. It
may come from TradingView `/symbol` only after a verification pass, because that endpoint
mixes unit bases. If unverified, it stays null.

### `news_articles`

`id`, `source`, `url` unique, `url_hash` unique, `lang` (`ar` or `en`), `title`,
`summary`, `image_url`, `category`, `published_at`, `fetched_at`.

Store headline, summary, image, source name, and canonical URL only. Never store full
article text.

### `news_instrument_links`

`article_id`, `instrument_id`, `match_reason` (`ticker`, `name_ar`, `name_en`), primary key
on both columns.

### `watchlist_items`

`user_id` text references Better Auth `user.id`, `instrument_id`, `created_at`, `position`
integer for manual ordering. Unique on `(user_id, instrument_id)`.

### `chat_threads`

`id uuid`, `user_id`, `instrument_id` nullable, `title`, `locale`, `created_at`,
`updated_at`. Threads are listed newest first.

### `chat_messages`

`id uuid`, `thread_id`, `client_message_id` text, `role` (`user`, `assistant`, `system`),
`content`, `parts jsonb`, `citations jsonb`, `provider`, `model`, `token_usage jsonb`,
`status` (`complete`, `failed`), `created_at`. `parts` stores the AI SDK UI message parts,
including tool calls and tool results, so a restored thread renders exactly as it did live.
`client_message_id` makes retries idempotent.

### `ingest_runs`

`id`, `job`, `source`, `started_at`, `finished_at`, `status` (`ok`, `partial`, `failed`),
`rows_written`, `error`, `duration_ms`. One row per job run. Used by `/api/status/data`.

### `ingest_payloads`

`id`, `job`, `source`, `fetched_at`, `payload jsonb`, `expires_at`. Holds the raw universe
and fundamentals responses, plus any payload that failed to parse. Retention: 14 days by a
scheduled delete. This is the audit trail for the unit rules without bloating quote tables.

### Better Auth tables

`user`, `session`, `account`, `verification` managed by Better Auth migrations.

## 10. Data sources and ingestion

### Provider interface

```ts
interface MarketDataProvider {
  fetchUniverse(): Promise<InstrumentRecord[]>
  fetchQuotes(tickers: string[]): Promise<QuoteRecord[]>
  fetchHistory(ticker: string, days: number): Promise<DailyBar[]>
  fetchFundamentals(tickers: string[]): Promise<FundamentalRecord[]>
}
```

Adapters: `TradingViewProvider` and `YahooProvider`. Fundamentals come only from the
TradingView scan adapter in v1.

### Schedules

Timezone is `Africa/Cairo`. Trading days are Sunday to Thursday. All jobs run through
pg-boss with a retry limit of 3, exponential backoff, and a singleton key per job so two
workers can never run the same job at once. Job state survives restarts and deployments.

| Job | Schedule | Notes |
|---|---|---|
| Universe refresh | Daily 17:00, plus on boot | TradingView `/egypt/scan`, 296 instruments |
| Fundamentals refresh | Daily 17:10 | Same scan response, persisted per instrument |
| Quotes | Every 10 minutes with jitter, 10:00 to 14:30 | Last run at 14:35 captures the close |
| Daily bars | Daily 16:30, plus 60 day backfill on boot | Yahoo `.CA` chart endpoint |
| News | Every 20 minutes, all day | Publisher RSS, both languages |
| Snapshot retention | Daily 03:00 | Delete snapshots older than 90 days |
| Index refresh | Daily 17:15, plus on boot | See open question 3 |

Schedules are configuration values, not hardcoded strings. The market calendar module
returns `isTradingDay` and `sessionState` (`pre`, `open`, `closed`) and is the only place
that knows EGX hours and holidays. Jitter is plus or minus 60 seconds, so quote polls do
not arrive on a fixed pattern.

### Source rules

1. Absolute figures (market cap, revenue, net income, debt, assets) come only from
   TradingView `/scan`. Never mix them with `/symbol`.
2. Every stored absolute value records `currency = EGP`.
3. Ratio fields are safe from either endpoint.
4. Yahoo supplies bars only. Yahoo fundamentals and statement endpoints are not used.
5. If a provider returns an empty or partial payload, the run is recorded as `partial` or
   `failed`, and existing rows are not overwritten.
6. Every write records `source` and `as_of`.
7. Raw universe, fundamentals, and failed-parse payloads go to `ingest_payloads` for 14
   days. Successful quote payloads are not retained in full.
8. Outbound requests set a descriptive User-Agent, honor `Retry-After`, and back off
   exponentially on 429 and 5xx responses. A provider that fails three consecutive runs
   is marked degraded on the data status screen.
9. Quote polling is 10 minutes with jitter, not a tight loop. This respects the unofficial
   source and avoids patterns that look abusive.

### Failure behavior

- A failed quotes run leaves `latest_quotes` untouched. The API's freshness calculation
  marks data stale after the threshold.
- A parse failure is quarantined: the run fails, the payload is logged with a hash, and the
  worker continues with the next job.
- No silent empty market. A run that writes zero instruments where at least one was
  expected is a failure.
- The worker exposes health through a heartbeat row in `ingest_runs` and a process health
  endpoint on the API that reads the last successful run per job.

### Deduplication

News dedupe uses a SHA-256 of the canonical URL and a normalized title hash. The same
article from the same publisher is inserted once. Ticker and name matches create
instrument links.

## 11. API

Base path `/api`. JSON responses use a consistent envelope:

```json
{
  "data": {},
  "meta": {
    "asOf": "2026-10-26T12:35:00Z",
    "source": "tradingview",
    "stale": false
  }
}
```

Errors use:

```json
{
  "error": {
    "code": "INSTRUMENT_NOT_FOUND",
    "message": "No instrument matches COMI"
  }
}
```

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| ALL | `/api/auth/*` | Better Auth handler |
| GET | `/api/market/overview` | Indices, breadth, gainers, losers, sector performance |
| GET | `/api/market/movers?limit=10` | Top gainers and losers |
| GET | `/api/instruments?q=&sector=&kind=&limit=&cursor=` | Search and list |
| GET | `/api/instruments/:ticker` | Identity, latest quote, fundamentals, coverage flags |
| GET | `/api/instruments/:ticker/history?range=1W\|1M\|3M\|6M\|1Y` | Daily bars |
| GET | `/api/instruments/:ticker/news?limit=20` | Linked news |
| GET | `/api/instruments/:ticker/peers` | Same-sector peers with ratio medians |
| GET | `/api/news?lang=ar\|en&sector=&cursor=` | Cursor feed |
| GET | `/api/watchlist` | Current user's list with quotes |
| POST | `/api/watchlist` | Body `{ ticker }` |
| DELETE | `/api/watchlist/:ticker` | Remove |
| PATCH | `/api/watchlist/order` | Body `{ tickers: string[] }` |
| GET | `/api/chat/threads` | Threads with last message preview |
| POST | `/api/chat/threads` | Body `{ instrumentId? }` |
| GET | `/api/chat/threads/:id` | Messages |
| DELETE | `/api/chat/threads/:id` | Delete thread |
| POST | `/api/chat` | AI SDK UI message stream, body `{ threadId, messages, locale }` |
| GET | `/api/status/data` | Last successful run per job, staleness |
| GET | `/health` | Process liveness |

### Freshness rules

- `stale = true` when the quote is older than 15 minutes during an open session, or older
  than 24 hours outside a session.
- Every quote response includes `asOf`, `source`, and `stale`.
- The overview and instrument endpoints include `universeAsOf` when relevant.
- The app shows a stale badge and the as-of time. It never hides them.

### Validation and limits

- All inputs validated with Zod.
- Search `q` limited to 80 characters, results paginated with a cursor.
- Watchlist limited to 100 instruments per user.
- Chat message limited to 2,000 characters.
- Rate limits: auth 10 requests per minute per IP, AI 20 messages per hour per user,
  general API 300 requests per minute per user.
- CORS allows the Expo dev origins and the production app origin only.
- Better Auth trusted origins include the app scheme `egx://`.

## 12. AI assistant

### Behavior

The assistant answers questions about EGX stocks, sectors, and market conditions using
data assembled on the server. It streams tokens to the app, cites its sources, and shows a
persistent notice that answers are informational and not investment advice.

It must:

- State the as-of date for every price or ratio it uses.
- Say when fundamentals are unavailable for a company.
- Distinguish reported facts from interpretation.
- Present risks and scenarios rather than a single verdict.
- Refuse to guarantee returns or to give a definitive buy or sell instruction.
- Answer in the language of the user's message, defaulting to the app locale.

### Context assembly

The backend builds a base context bundle and exposes tools for deeper retrieval:

- Instrument identity: ticker, names, sector, industry.
- Latest quote with `asOf` and `stale`.
- Fundamentals with `as_of` and explicit missing fields.
- 30 day statistics: return, volatility, high and low.
- Peer set: up to 8 same-sector names with median P/E, P/B, dividend yield.
- Up to 10 recent news items with source, date, title, and summary.
- Watchlist membership.
- Market overview: index levels, breadth, top movers.

Ticker resolution is deterministic: exact ticker match, then normalized Arabic or English
name match using trigram search. If several instruments match, the context includes the top
three candidates and the model asks which one the user means.

### AI SDK integration

The backend uses AI SDK 7. `streamText` calls the selected provider with the system prompt,
recent UI messages, and backend tools. The route returns `toUIMessageStreamResponse()`.
The app uses `useChat` with `DefaultChatTransport({ api, fetch: expoFetch })` and renders
text, tool calls, tool results, and citation data parts.

Tools are typed with Zod and execute against our Postgres read model:

| Tool | Returns |
|---|---|
| `search_instruments` | Candidates from ticker, alias, Arabic and English name matches |
| `get_quote` | Latest quote with as_of and stale |
| `get_fundamentals` | Ratios, absolute EGP figures, as_of, missing fields |
| `get_history` | Daily bars for a range with return and volatility |
| `get_peers` | Same-sector peers and median ratios |
| `get_news` | Recent linked articles with source, date, and summary |
| `get_market_overview` | Indices, breadth, and top movers |
| `get_watchlist` | The user's watchlist |

Tools never call a third party. They read Postgres. Tool results carry `source` and
`asOf`, and the system prompt requires them in the answer.

Tool calling is mandatory in v1. The model must call at least one tool for any question
that names a stock, sector, or price. If it answers without a tool, the turn is flagged in
logs and the UI shows a lower-confidence label.

### Model selection and fallback

Primary provider: NVIDIA NIM through `@ai-sdk/openai-compatible`.

Fallback provider: Google Gemini through `@ai-sdk/google`.

Model ids come from environment variables, not source code:

- `NIM_CHAT_MODEL`, benchmarked across DeepSeek V3.1 Terminus, GLM-5, and a Nemotron 3
  model. NIM documents tool calling for DeepSeek V3.1 Terminus and GLM-5.
- `GEMINI_MODEL`, a current Gemini Flash class model, chosen after the same benchmark.

A fixed evaluation set of 10 Arabic finance prompts runs before a model is pinned. It
scores numeric correctness against seeded fixtures, tool selection, citation completeness,
Arabic fluency, and refusal behavior. The winner becomes the default in `.env.example`.
No model is hardcoded.

Fallback policy: if the primary provider fails with 429, 5xx, or a timeout before the first
token, the request retries once on Gemini and logs an `ai_fallback` event with both
providers. A failure after streaming starts is surfaced with a retry action and is never
silently switched. The `provider` and `model` columns record what actually ran.

### Streaming and persistence

- `streamText` with temperature 0.2, max output 800 tokens, and a 120 second timeout.
- UI message stream over `expo/fetch`, with a client abort controller and a stop button.
- The user message is stored immediately with `client_message_id`. The assistant message is
  stored in `onFinish` with parts, citations, provider, model, and token usage.
- Aborted or failed turns are stored with status `failed` and a short error note.
- The system prompt is versioned in `apps/api/src/services/ai/prompts.ts`.

### Citation format

```json
[
  { "type": "quote", "ticker": "COMI", "label": "COMI 131.50 EGP", "asOf": "2026-10-26T12:35:00Z" },
  { "type": "fundamentals", "ticker": "COMI", "label": "P/E 6.24, ROE 34.4%", "asOf": "2026-09-30" },
  { "type": "news", "id": "uuid", "label": "Arab Finance headline", "url": "https://..." }
]
```

### Cost and abuse control

- 20 messages per hour per user. One fallback call is part of the same user turn.
- Context capped at 12,000 tokens and 8 tool calls per turn.
- One in-flight stream per user.
- Failed or timed-out calls retry at most once, and only on the fallback provider.
- Token usage and provider stored per message for review.

## 13. Mobile application

### Navigation

```
app/
  _layout.tsx                 providers, fonts, auth gate, RTL bootstrap
  (auth)/
    sign-in.tsx              email entry and Google
    otp.tsx                  six digit code entry
  (app)/
    (tabs)/
      _layout.tsx             5 tabs
      index.tsx               Markets
      watchlist.tsx           Watchlist
      news.tsx                News
      ai/
        index.tsx             Thread list
        [threadId].tsx        Chat
      profile.tsx             Profile, language, data status
    stock/[ticker].tsx        Stock detail
```

Tabs: Markets, Watchlist, News, AI, Profile. Stock detail opens as a stack screen from
lists, search, news, and AI citations.

### Authentication

- Email OTP and Google only. No passwords in v1.
- The email screen calls `authClient.emailOtp.sendVerificationOtp`, then the code screen
  calls `authClient.signIn.emailOtp` with the six digit code.
- Codes expire after 10 minutes, allow 5 attempts, and are rate limited by email and IP.
- A new user record is created on the first successful OTP or Google sign in. There is no
  separate registration screen.
- Google uses the Better Auth Expo client with the `egx://` callback scheme.
- Apple sign in is required before an iOS App Store release and is added in M5.
- Sign out clears the secure session and the query cache.

### Screens

Markets:

- EGX 30 card with value, change, and 30 day sparkline.
- Market breadth: advancers, decliners, unchanged.
- Gainers and losers, five each.
- Sector performance strip.
- Pull to refresh. Auto refetch every 60 seconds while foregrounded and the session is open.

Stock list and search:

- Search field with 250 ms debounce against the server.
- Arabic and English name matching, ticker matching.
- Sector filter chips.
- Rows show logo, names, price, percent change, and a small sparkline when available.
- FlashList virtualization, 50 item pages, infinite scroll.

Stock detail:

- Header: logo, Arabic name, English name and ticker, price, change, as-of time and stale
  badge.
- Chart: Victory Native XL area chart with 1W, 1M, 3M, 6M, 1Y ranges, axes, crosshair,
  and a scrub tooltip. Positive and negative ranges use green and red fills. Row
  sparklines use a small react-native-svg path.
- Key stats: market cap, P/E, P/B, EPS, ROE, dividend yield, debt to equity, 52 week range.
  Missing fields show "غير متاح" or "Not available".
- Peers: same-sector names with P/E and dividend yield.
- News: latest five linked articles with source and time.
- Primary action: add or remove from watchlist.
- Secondary action: Ask AI about this stock. Opens a thread scoped to the instrument.

News:

- Segmented Arabic and English feed.
- Sector chips.
- Card shows source, relative time, title, summary, and image when available.
- Tap opens the canonical URL in the in-app browser. No full text republishing.

AI:

- Thread list with title, stock badge, and last message preview.
- Chat screen with streaming tokens, stop button, suggested prompts, citation chips, and a
  fixed disclaimer.
- Suggested prompts for a stock: valuation context, recent news, peer comparison, key
  risks.

Profile:

- Account identity and sign out.
- Language toggle.
- Data status: last ingestion per job, last refresh, stale sources.
- Disclaimer and data attribution.

### State and data fetching

- TanStack Query for all server state. Query keys include the ticker and range.
- REST calls go through a typed `openapi-fetch` client generated from
  `packages/contracts`. Regenerating types is part of the API change workflow.
- Polling: overview and watchlist every 60 seconds while foregrounded. Instrument detail
  every 60 seconds during an open session. Server-side quote polling is the slower 10
  minute interval.
- Optimistic watchlist add and remove with rollback on error.
- Zustand for session, locale, and UI state. Locale persisted with AsyncStorage.
- AI chat uses `useChat` with `DefaultChatTransport({ api, fetch: expoFetch })`. The screen
  renders text parts, tool call status, tool results, citations, and errors. A stop button
  aborts the stream.
- The AI SDK Expo setup polyfills are imported once at app startup, before any transport is
  created, following the official Expo guide.
- Offline: previously fetched data stays in memory and a banner explains that updates are
  paused. No offline mutations in v1.

### Internationalization and RTL

- Default locale is Arabic. English is a full translation, not a partial fallback.
- i18next with `ar` and `en` resource files. No hardcoded UI strings.
- RTL is applied with `I18nManager.forceRTL` at startup and a `Updates.reloadAsync()`
  prompt when the language changes. The app states that the restart is required.
- Tickers, prices, percentages, and charts are locked to LTR direction and Western digits.
- Numbers format with `Intl.NumberFormat('en-EG')`, currency label EGP.
- Dates display in Cairo time with relative labels for news and absolute timestamps in
  detail views.
- Arabic font: IBM Plex Sans Arabic, bundled in three weights. Numeric emphasis uses Inter
  with tabular figures where supported.
- No em dashes in UI copy.

## 14. Design system

Dark-first, charcoal and desert gold. Green and red are reserved exclusively for price
direction, so the brand accent never competes with market semantics.

### Colors

| Token | Value | Use |
|---|---|---|
| canvas | `#0F1115` | App background |
| surface | `#161A20` | Cards, tab bar |
| surfaceElevated | `#1D222B` | Sheets, modals |
| border | `#2A303B` | Dividers, card borders |
| gold | `#C9A227` | Primary actions, active tab, brand |
| goldSoft | `#E0B84A` | Highlights, focus ring |
| up | `#22C55E` | Positive change only |
| down | `#EF4444` | Negative change only |
| text | `#F5F1E8` | Primary text |
| textSecondary | `#A8ADB8` | Secondary text |
| textMuted | `#6E7480` | Metadata, placeholders |
| overlay | `rgba(15,17,21,0.7)` | Scrims |

Light mode is out of scope for v1. The app is dark-first and the system setting is ignored
until a light theme is designed.

### Typography

- Display: IBM Plex Sans Arabic Bold, 28 to 32, tight tracking, one per screen.
- Headline: IBM Plex Sans Arabic SemiBold, 20.
- Title: IBM Plex Sans Arabic SemiBold, 16.
- Body: IBM Plex Sans Arabic Regular, 14 to 16, line height 1.5.
- Label: Inter SemiBold, 10 to 11, uppercase, 0.08em tracking for English labels.
- Numbers: Inter Medium or SemiBold with tabular figures.

### Shape and spacing

- Spacing scale: 4, 8, 12, 16, 24, 32.
- Cards: 16 radius, 1px border, no shadow at rest.
- Buttons and inputs: 12 radius.
- Pills and chips: full radius.
- Touch targets at least 44x44.

### Motion

- Press feedback: spring scale to 0.97.
- Price updates: brief color flash and number crossfade, 200 ms.
- Screen transitions use the platform default. No decorative autoplay.
- Reduced motion: replace springs and crossfades with instant or opacity-only changes.

### Charts

- Detail chart: Victory Native XL (Skia). Gold line, low-opacity gradient fill, muted axis
  labels, 1px grid lines, crosshair, and a scrub tooltip showing the date and close.
- Positive range uses a green fill, negative range uses a red fill, the line stays gold.
- Range selector: 1W, 1M, 3M, 6M, 1Y. Changing range refetches from the API.
- Row sparklines: a lightweight react-native-svg path, no axes, no labels.
- No candlesticks in v1. Victory Native XL can add them later without changing data
  contracts.

## 15. Freshness, errors, and edge cases

- Stale quote: badge with the as-of time, amber outline, no blocking.
- No fundamentals: show "Not available for this company" with a short explanation that
  coverage is limited for smaller caps.
- Market closed: show last close and a "Market closed" label with the next session time.
- Empty search: suggested tickers and sectors.
- Empty watchlist: prompt to search and add, with three suggested large caps.
- Network error: retry with cached content when available, error card otherwise.
- AI error: keep the user message, show a retry action, never fabricate an answer.
- Auth expiry: redirect to sign in, keep the intended destination.
- Ingest failure: data status screen lists the failed job and last success time. The app
  continues to serve last good data with stale markers.
- Invalid ticker deep link: not-found screen with search.

## 16. Security, privacy, compliance

- All provider keys and model keys live on the backend. The mobile app has no secrets.
- Better Auth handles sessions. Cookies and tokens are stored in SecureStore on device.
- Authentication is email OTP and Google. No passwords are stored.
- OTP codes are hashed at rest, expire after 10 minutes, allow 5 attempts, and are rate
  limited by email and IP. Responses do not reveal whether an email exists.
- Google OAuth verifies the token audience and redirects only to the `egx://` scheme.
- Auth rate limiting and bot protection on the auth routes.
- Provider fallback keys are separate environment variables with least-privilege scopes.

Backend environment variables:

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `NVIDIA_API_KEY`, `NIM_CHAT_MODEL`,
`GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_MODEL`, `AI_PRIMARY`, `AI_FALLBACK`, `APP_SCHEME`,
`CORS_ORIGINS`, `TZ`.

Mobile environment variables:

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AUTH_SCHEME`.
- All SQL through Drizzle. No string-built queries.
- All request bodies and query parameters validated with Zod.
- Chat content is private to the user and never used for training.
- Logs redact authorization headers, cookies, and API keys.
- Data attribution in Profile: TradingView, Yahoo Finance, and each news publisher.
- Persistent disclaimer in AI and an About section stating that data may be delayed,
  unofficial, and not investment advice.
- Only headlines, summaries, and links are stored for news.
- Before public distribution, review TradingView and Yahoo terms and publisher RSS
  conditions. The v1 build is private.

## 17. Observability

- Pino JSON logs with request id, user id where authenticated, route, status, and latency.
- One log line per ingestion run with job, source, status, rows, and duration.
- One log line per AI turn with thread id, provider, model, tool names, token usage,
  latency, and whether fallback ran. No prompt or answer text in logs by default.
- `ai_fallback` events are counted so provider health is visible.
- `/api/status/data` returns last success and last failure per job.
- Worker heartbeat: the worker writes a row every minute. The API health check reports
  worker health as degraded if the heartbeat is older than 5 minutes.
- No external analytics in v1.

## 18. Testing

Backend:

- Unit tests for provider mappers using fixtures copied from `docs/discovery/reference`.
- Unit test for the 50x unit rule: absolute fields must come from `/scan`, currency must be
  EGP, and a fixture from `/symbol` must never populate stored absolute fields.
- RSS parser tests with sample XML for each source, including malformed input.
- Ticker resolver tests with Arabic names, English names, mixed case, and partial matches.
- Freshness tests: open session, closed session, weekend, and stale thresholds.
- Arabic normalization tests for alef, ya, ta marbuta, diacritics, and alias matching.
- API integration tests against a test Postgres database, covering OTP auth, watchlist
  isolation between users, pagination, and error envelopes.
- pg-boss job tests for cron registration, singleton behavior, retry, and backoff.
- Contract drift test: regenerate OpenAPI types and fail if the checked-in output differs.
- AI tool tests with a mocked database and seeded fixtures. No live model calls in CI.
- A separate `bun run ai:eval` script runs the 10 prompt evaluation set against the
  configured NIM and Gemini models. It is manual, not part of CI.

Mobile:

- Jest and React Native Testing Library for formatting, RTL text direction helpers, and
  watchlist optimistic updates.
- Component tests for quote rows, stale badges, empty states, and AI tool and citation
  parts.
- Maestro flows for OTP sign in, Arabic search and watchlist add, and one streamed AI turn.
- Manual Android checklist: sign in, search in Arabic, add to watchlist, switch language,
  read news, stream an AI answer, kill the network and verify the offline banner.

Acceptance for data correctness:

- Every displayed price has an as-of time.
- No UI path shows a zero for a missing fundamental.
- No path shows USD-derived values labelled EGP.

## 19. Milestones and acceptance criteria

M1. Foundation

- Bun workspace with `apps/mobile`, `apps/api`, and `packages/contracts`.
- Expo app boots on Android, API boots with Postgres 18, migrations run.
- Better Auth email OTP and Google sign in, session gate in the app.
- Generated OpenAPI types are committed and the drift check runs.
- Design tokens and base UI components.
- Acceptance: a new user can request a code, verify it, and reach an empty Markets screen.

M2. Ingestion and market API

- TradingView universe and fundamentals, Yahoo bars, quotes polling, RSS news.
- pg-boss schedules with retries, backoff, jitter, and singleton keys.
- Instruments, overview, history, news, and status endpoints.
- Acceptance: 296 instruments stored, quotes refresh on the 10 minute schedule,
  `/api/status/data` shows successful runs, stale logic verified.

M3. Core mobile experience

- Markets, search, stock detail, watchlist, news.
- Acceptance: Arabic search finds COMI, watchlist persists across restarts, detail shows a
  chart, stats, peers, and news.

M4. AI assistant

- AI SDK 7 with `useChat`, typed tools, citations, persistence, and rate limits.
- Model benchmark across NIM candidates and Gemini, then pin the defaults.
- NIM primary with Gemini fallback and fallback logging.
- Acceptance: "قارن كومي واتصالات" streams a grounded answer that calls tools, cites both
  quotes and fundamentals with dates, shows the disclaimer, and survives a forced primary
  provider failure by answering through Gemini.

M5. Hardening

- RTL polish, error and empty states, accessibility pass, reduced motion.
- Apple sign in for iOS, contract drift CI, data status screen, README, env example,
  EAS Android build profile.
- Acceptance: manual checklist passes on a physical Android device.

## 20. Risks and open questions

1. TradingView and Yahoo terms. Both are unofficial and their terms may restrict
   commercial use. v1 is private. Resolve before any public launch.
2. Delayed versus real-time TradingView data for EGX is unconfirmed. The UI must say
   delayed and show as-of times. The 10 minute poll cadence limits source abuse but also
   means the app cannot promise tick-level freshness.
3. Index symbols. Confirm EGX 30, EGX 70, and EGX 100 availability from TradingView or
   Yahoo. If unavailable, fall back to breadth and a market-cap weighted proxy.
4. EGX holiday calendar. Source an official list and encode it in the market calendar.
   Until then, weekends and known holidays are configured, and the quotes job tolerates
   empty responses without overwriting data.
5. Fundamentals coverage. Only 70 to 90 names have usable data. The UI must show coverage
   honestly.
6. NIM model quality in Egyptian Arabic, tool calling, and structured output. Evaluate the
   three candidates with the fixed prompt set. If quality is insufficient, the Gemini
   fallback becomes primary through configuration, with no code change.
7. RTL reload UX. The language switch requires a restart. This is acceptable for v1 but
   should be revisited.
8. NTFS project storage. Metro and file watching on NTFS can be slower. If it becomes a
   blocker, move caches to a small ext4 location without moving the project data.
9. News licensing. Headline, summary, and link only. Full text requires a licence.
10. Private app security. Accounts are required, but there is no admin role. If the app is
    shared, add per-user rate limits and monitoring before opening sign ups.
11. Gemini key availability and cost. The fallback is dormant without a Google AI Studio
    key. The app must fail gracefully with a retry action, not a broken chat screen.
12. Resend deliverability. OTP email needs a verified sending domain. Until then, codes go
    to the owner's verified address only and the API logs the code in local development.
13. pg-boss on Bun and Postgres 18. Validate the worker, cron, and retry behavior in M2
    before relying on it. Fallback is a scheduler with Postgres advisory locks.
14. Typed client drift. The OpenAPI document and generated types can diverge if the CI
    drift check is skipped. Treat regeneration as part of every API change.

## 21. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-26 | Server-first architecture | One source of truth, simpler AI tools, matches owner stack |
| 2026-10-26 | Free polled market data | No free licensed EGX feed exists |
| 2026-10-26 | Better Auth accounts | Watchlist and chat history need identity |
| 2026-10-26 | Arabic first with English toggle | Egyptian audience and Arabic coverage |
| 2026-10-26 | Charcoal and gold visual system | Premium identity without confusing market colors |
| 2026-10-26 | AI as grounded research assistant | Data limits and advice responsibility |
| 2026-10-26 | New project on HDD | Home partition has 2.1 GB free |
| 2026-10-26 | No Sharia engine in v1 | No licensed methodology or structured statements yet |
| 2026-10-26 | AI SDK 7 as the AI layer | Standard tools, streaming, transport and persistence |
| 2026-10-26 | NIM primary, Gemini fallback | Free primary with a quality and outage fallback |
| 2026-10-26 | Email OTP plus Google auth | Modern mobile sign in without password flows |
| 2026-10-26 | Bun workspace with typed client | One contract, no DTO drift, no axios |
| 2026-10-26 | Victory Native XL charts | Skia performance and finance-grade interaction |
| 2026-10-26 | pg-boss durable jobs | Retries and singleton runs without extra infrastructure |
| 2026-10-26 | 10 minute quote polling with jitter | Respects an unofficial source and avoids abuse patterns |
| 2026-10-26 | Arabic normalization and aliases | Trigrams alone fail real Arabic search |
| 2026-10-26 | Postgres 18 | Current stable image, same Drizzle stack |
