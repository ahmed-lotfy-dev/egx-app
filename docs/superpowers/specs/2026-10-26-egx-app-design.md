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
  mobile/
    src/
      app/                 Expo Router routes
      components/          shared UI
      features/            market, stock, watchlist, news, ai, auth
      lib/                 api client, auth client, i18n, format
      stores/              zustand stores
      constants/           design tokens
      types/               DTOs mirrored from the API
    assets/fonts/          IBM Plex Sans Arabic, Inter
    app.json
    eas.json
    global.css
  backend/
    src/
      config/              env, NIM, market calendar
      db/
        schema/            Drizzle tables
        migrations/
        seed/
      providers/           tradingview, yahoo, rss
      ingest/              universe, quotes, bars, news, scheduler
      routes/              auth, market, instruments, watchlist, news, chat, status
      services/            market, instruments, news, watchlist, ai, context
      lib/                 logger, errors, rate limit, freshness
      index.ts             API entrypoint
      worker.ts            ingestion entrypoint
    tests/
      fixtures/            copied reference JSON and RSS samples
  docs/
    discovery/             copied Phase 0 research
    PRODUCT.md
    DESIGN.md
    superpowers/specs/     this document and later specs
  docker-compose.yml       Postgres and optional Redis for local development
  README.md
```

No shared package in v1. The API is the contract, defined with Zod OpenAPI. The mobile app
mirrors the DTOs in `mobile/src/types`. A generated client can replace the mirror later if
drift becomes a problem.

## 8. Stack

Mobile:

- Expo SDK 58, React 19.3, React Native 0.88, TypeScript 6
- expo-router
- Uniwind 1.13 with Tailwind CSS 4 for styling
- Zustand 5 for session, locale, and UI state
- TanStack Query 5 for server state and polling
- Better Auth Expo client with SecureStore
- axios for REST, `expo/fetch` for SSE streaming
- react-native-svg for charts, FlashList 2 for long lists
- react-native-reanimated 4, gesture-handler, keyboard-controller
- i18next and react-i18next, expo-localization
- expo-web-browser for article links, expo-font for bundled fonts
- react-native-markdown-display for AI answers

Backend:

- Bun runtime, Hono 4
- Zod 4, `@hono/zod-openapi`, Scalar API reference
- Drizzle ORM and drizzle-kit, Postgres 16
- Better Auth with the Drizzle adapter
- Pino for structured logs
- NVIDIA NIM OpenAI-compatible chat completions
- `fast-xml-parser` for RSS
- Resend for verification email, with console logging of the verification link in dev

Infrastructure:

- Docker Compose for local Postgres
- Two processes in development and production: `api` and `worker`
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
| sector | text null | |
| industry | text null | |
| logoid | text null | TradingView logo id |
| kind | text not null default `stock` | `stock`, `index`, `etf` |
| currency | text not null default `EGP` | |
| is_active | boolean not null default true | |
| created_at, updated_at | timestamptz not null | |

Indexes: unique `ticker`, unique `tv_symbol`, GIN trigram on `name_en` and `name_ar` after
enabling `pg_trgm`, btree on `sector`.

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

`id uuid`, `thread_id`, `role` (`user`, `assistant`, `system`), `content`, `citations
jsonb`, `model`, `token_usage jsonb`, `status` (`complete`, `failed`), `created_at`.

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

Timezone is `Africa/Cairo`. Trading days are Sunday to Thursday.

| Job | Schedule | Notes |
|---|---|---|
| Universe refresh | Daily 17:00, plus on worker boot | TradingView `/egypt/scan`, 296 instruments |
| Fundamentals refresh | Daily 17:10 | Same scan response, persisted per instrument |
| Quotes | Every 5 minutes, 10:00 to 14:30 | Last run at 14:35 captures the close |
| Daily bars | Daily 16:30, plus 60 day backfill on first boot | Yahoo `.CA` chart endpoint |
| News | Every 20 minutes, all day | Publisher RSS, both languages |
| Snapshot retention | Daily 03:00 | Delete snapshots older than 90 days |
| Index refresh | Daily 17:15, plus on boot | See open question 3 |

Schedules are configuration values, not hardcoded strings. The market calendar module
returns `isTradingDay` and `sessionState` (`pre`, `open`, `closed`) and is the only place
that knows EGX hours and holidays.

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
| POST | `/api/chat/stream` | SSE, body `{ threadId, message, locale }` |
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

Before calling the model, the backend builds a context bundle:

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

### Model call

- Provider: NVIDIA NIM, OpenAI-compatible endpoint.
- Model: `meta/llama-3.3-70b-instruct`, configurable through `NIM_CHAT_MODEL`.
- Request: server-side system prompt, last 6 messages, the context bundle, temperature 0.2,
  max output 800 tokens, timeout 120 seconds.
- Streaming: SSE events `token`, `citations`, `done`, `error`. The app uses `expo/fetch` to
  read the stream and can abort.
- Persistence: the user message is stored immediately. The assistant message is stored on
  completion with citations, model name, and token usage. Aborted messages are stored with
  status `failed` and a short error note.
- Guardrail: the system prompt is versioned in `backend/src/services/ai/prompts.ts`.

Tool calling is not a dependency in v1. The context bundle covers the known questions. If
the configured model reliably supports OpenAI tool calls, a second iteration can add
`get_news`, `get_peers`, and `get_history` tools without changing the app contract.

### Citation format

```json
[
  { "type": "quote", "ticker": "COMI", "label": "COMI 131.50 EGP", "asOf": "2026-10-26T12:35:00Z" },
  { "type": "fundamentals", "ticker": "COMI", "label": "P/E 6.24, ROE 34.4%", "asOf": "2026-09-30" },
  { "type": "news", "id": "uuid", "label": "Arab Finance headline", "url": "https://..." }
]
```

### Cost and abuse control

- 20 messages per hour per user.
- Context capped at 12,000 tokens.
- One in-flight stream per user.
- Failed or timed-out calls do not retry automatically more than once.
- Token usage stored per message for review.

## 13. Mobile application

### Navigation

```
app/
  _layout.tsx                 providers, fonts, auth gate, RTL bootstrap
  (auth)/
    sign-in.tsx
    sign-up.tsx
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
- Chart: custom SVG area chart with 1W, 1M, 3M, 6M, 1Y ranges and a gradient fill.
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
- Polling: overview and watchlist every 60 seconds while foregrounded. Instrument detail
  every 60 seconds during an open session.
- Optimistic watchlist add and remove with rollback on error.
- Zustand for session, locale, and UI state. Locale persisted with AsyncStorage.
- Chat streaming managed by a dedicated hook with an AbortController.
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

- Custom `react-native-svg` area chart with a gold line and low-opacity gradient fill.
- Positive range uses green fill, negative range uses red fill, line stays gold.
- Axis labels are muted, grid lines 1px border color.
- Touch scrub shows a vertical rule and the close for that day.
- No candlesticks in v1.

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
- Passwords hashed by Better Auth. Email verification required in production. In local
  development the verification link is written to the API log.
- Auth rate limiting and bot protection on the auth routes.
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
- API integration tests against a test Postgres database, covering auth, watchlist
  isolation between users, pagination, and error envelopes.
- AI context builder tests with a mocked database. No live model calls in tests.

Mobile:

- Jest and React Native Testing Library for formatting, RTL text direction helpers, and
  watchlist optimistic updates.
- Component tests for quote rows, stale badges, and empty states.
- Manual Android checklist: sign in, search in Arabic, add to watchlist, switch language,
  read news, stream an AI answer, kill the network and verify the offline banner.

Acceptance for data correctness:

- Every displayed price has an as-of time.
- No UI path shows a zero for a missing fundamental.
- No path shows USD-derived values labelled EGP.

## 19. Milestones and acceptance criteria

M1. Foundation

- Monorepo folders, Expo app boots on Android, API boots with Postgres, migrations run.
- Better Auth sign up, sign in, Google sign in, session gate in the app.
- Design tokens and base UI components.
- Acceptance: a new user can sign up and reach an empty Markets screen.

M2. Ingestion and market API

- TradingView universe and fundamentals, Yahoo bars, quotes polling, RSS news.
- Instruments, overview, history, news, and status endpoints.
- Acceptance: 296 instruments stored, quotes refresh on schedule, `/api/status/data` shows
  successful runs, stale logic verified.

M3. Core mobile experience

- Markets, search, stock detail, watchlist, news.
- Acceptance: Arabic search finds COMI, watchlist persists across restarts, detail shows a
  chart, stats, peers, and news.

M4. AI assistant

- Threads, context builder, streaming chat, citations, rate limit.
- Acceptance: "قارن كومي واتصالات" returns a streamed answer citing both quotes and
  fundamentals with dates and the disclaimer.

M5. Hardening

- RTL polish, error and empty states, accessibility pass, reduced motion.
- Data status screen, README, env example, EAS Android build profile.
- Acceptance: manual checklist passes on a physical Android device.

## 20. Risks and open questions

1. TradingView and Yahoo terms. Both are unofficial and their terms may restrict
   commercial use. v1 is private. Resolve before any public launch.
2. Delayed versus real-time TradingView data for EGX is unconfirmed. The UI must say
   delayed and show as-of times.
3. Index symbols. Confirm EGX 30, EGX 70, and EGX 100 availability from TradingView or
   Yahoo. If unavailable, fall back to breadth and a market-cap weighted proxy.
4. EGX holiday calendar. Source an official list and encode it in the market calendar.
   Until then, weekends and known holidays are configured, and the quotes job tolerates
   empty responses without overwriting data.
5. Fundamentals coverage. Only 70 to 90 names have usable data. The UI must show coverage
   honestly.
6. NIM model quality in Egyptian Arabic and structured output. Evaluate with a fixed prompt
   set. If quality is insufficient, switch `NIM_CHAT_MODEL` to a stronger model.
7. RTL reload UX. The language switch requires a restart. This is acceptable for v1 but
   should be revisited.
8. NTFS project storage. Metro and file watching on NTFS can be slower. If it becomes a
   blocker, move caches to a small ext4 location without moving the project data.
9. News licensing. Headline, summary, and link only. Full text requires a licence.
10. Private app security. Accounts are required, but there is no admin role. If the app is
    shared, add per-user rate limits and monitoring before opening sign ups.

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
