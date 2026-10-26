# EGX Mobile App and API: Design Specification

Status: revised 2026-10-26, awaiting review
Date: 2026-10-26
Owner: Ahmed Lotfy
Project path: `/mnt/hdd/projects/mobile/ongoing/egx-app`

## 1. Summary

A private, Arabic-first mobile app for the Egyptian Exchange (EGX). It brings a market
overview, searchable stock directory, stock detail with charts, a personal watchlist,
manual positions, bilingual news, a warning engine that flags technical and financial
deterioration in stocks you hold, price alerts, and an AI research assistant that answers
questions using data stored in our own database.

The app is not a trading platform. It does not place orders, move money, or promise
returns. The AI provides grounded analysis and risk context with source dates, never
guaranteed outcomes or direct buy and sell instructions. Alerts are informational: they
state what changed and when, not what to do.

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

The same daily bars and fundamentals that feed the charts also make a deterministic warning
engine possible. Technical and financial alerts need no new data source; the rules read
what is already stored, which keeps every warning explainable and auditable.

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
   a web portal later.
6. Warnings you can trust: every alert names the rule, the values behind it, and the date
   of the data, so it can be verified or dismissed rather than taken on faith.
7. Positions with unrealized profit and loss, so a warning is ranked by what it actually
   costs the owner.

## 4. Non-goals for v1

- Order execution, brokerage integration, or payments.
- Realized profit and loss, a trade ledger, dividends, and brokerage import. Positions are
  entered manually and show unrealized P&L only.
- Intraday technical signals. Technical rules run on daily closes. Intraday movement is
  covered by user price alerts.
- Alert backtesting, strategy building, or custom rule scripting.
- Email alert digests, SMS, and WhatsApp.
- A Sharia compliance engine or verdicts. This needs a licensed methodology and
  structured statements. It stays out until those inputs exist.
- DCF or intrinsic valuation.
- Real-time tick streaming.
- Public web portal, SEO, and marketing site.
- Social features, comments, or community feeds.
- Offline write queue.

## 5. Users and core flows

Primary user: an Egyptian retail investor who follows EGX-listed companies, wants Arabic
company names and Arabic news, holds a handful of positions, and wants quick answers about
prices, fundamentals, and recent developments.

Core flows:

1. Open app, sign in, land on Markets, see EGX 30, breadth, and movers.
2. Search "كومي" or "COMI", open the stock, read the quote, chart, stats, peers, and news.
3. Add the stock to the watchlist and reorder it later.
4. Read Arabic or English news, filtered by sector.
5. Ask the AI "هل كومي مكسب؟" or "Compare COMI and ETEL on P/E and dividends" and receive
   a streamed answer with citations and a disclaimer.
6. Add a holding by entering quantity and average cost, then see unrealized P&L, weight,
   and any active technical or financial warnings for it.
7. Set a price alert above, below, or on a percentage move, and receive a push with the
   ticker, level, and as-of time.
8. Open a warning from the push or the inbox, read the rule, values, threshold, and data
   date behind it, and optionally ask the AI to explain it.
9. Switch the interface to English from Profile.

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
            | auth, market, AI    |
            +----+-----------+----+
                 |           |
          +------v---+   +---v-----------------+
          | Postgres |   | NVIDIA NIM          |
          | Drizzle  |   | chat completions    |
          +------^---+   +---------------------+
                 |
       +---------+----------+        +------------------+
       | Ingestion worker   |        | Expo Push Service|
       | TradingView, Yahoo |------->| FCM / APNs       |
       | RSS, signals, push |        +------------------+
       +--------------------+
```

Rules:

- No third-party market call at request time.
- The worker and the API are separate processes with separate entrypoints. They share the
  database and the provider modules.
- Mobile never holds provider credentials.
- One provider interface, so TradingView or Yahoo can be replaced without touching the
  app or the API contract.
- Indicators, signals, and alert fan-out run in the worker only. The API never computes
  indicators during a request.
- Push payloads carry the ticker, rule, and a short message only. They never carry
  quantity, average cost, portfolio value, or P&L.

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
        features/          market, stock, watchlist, portfolio, alerts, news, ai, auth
        lib/               api client, auth client, i18n, format, notifications
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
        ingest/            universe, quotes, bars, signals, news, jobs
        routes/            auth, market, instruments, watchlist, portfolio, alerts,
                           news, chat, status, push
        services/          market, instruments, news, watchlist, portfolio, ai, tools,
                           signals, alerts, push
        lib/               logger, errors, rate limit, freshness
        index.ts           API entrypoint
        worker.ts          ingestion, signal, and push job entrypoint
      tests/
        fixtures/          copied reference JSON, RSS samples, bar series for rules
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
- expo-notifications 58.1.6, expo-device 58.0.5, expo-constants 58.0.13 for push tokens,
  permissions, and notification deep links
- react-native-markdown-display for AI answer text

Backend:

- Bun runtime, Hono 4.13.14
- Zod 4.6.7, `@hono/zod-openapi`, Scalar API reference
- Drizzle ORM 0.45.4 and drizzle-kit, Postgres 18
- Better Auth 1.7.13 with the Drizzle adapter and the email OTP plugin
- pg-boss 12.38 for durable jobs, cron schedules, retries, and backoff
- `trading-signals` 8.3.0 for SMA, EMA, MACD, and RSI, pinned and wrapped in our own
  indicator module so the library can be swapped after golden tests
- `expo-server-sdk` 8.0.0 for Expo Push API sends, chunking, and receipt checks
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

`instrument_id`, `date` (Cairo trading date), `open`, `high`, `low`, `close`, `adj_close`
nullable, `volume`, `price_basis` (`adjusted` or `raw`), `source`, `raw jsonb`. Unique on
`(instrument_id, date)`. History backfill: 1 year for every instrument, which gives roughly
250 sessions and is enough for SMA200. If a provider returns less, store what it returns and
surface the coverage gap on the stock detail card.

Bars are validated before insert: `high >= low`, `low <= open <= high`, `low <= close <=
high`, and non-negative volume. An invalid bar fails the run instead of being stored.
Indicators use `adj_close` when present and `close` otherwise, and record which basis was
used. One basis is used for a whole series, never mixed row by row; if adjusted coverage is
incomplete, the series falls back to raw and records `raw`. Quote-facing levels remain raw
close.

### `fundamentals`

The current observation per instrument and source, updated on every refresh.

`instrument_id`, `source`, `as_of date` nullable (statement period when the provider
states it), `observed_at timestamptz`, `values_hash text`, `currency`, `market_cap`, `pe`,
`pb`, `eps`, `roe`, `roa`, `debt_to_equity`, `dividend_yield`, `revenue_ttm`,
`net_income_ttm`, `fcf_ttm`, `current_ratio`, `beta`, `total_shares`, `raw jsonb`. Primary
key `(instrument_id, source)`. Missing values stay null. The API exposes coverage flags
instead of filling gaps with zero. `total_shares` is a share count, not a money amount. It
may come from TradingView `/symbol` only after a verification pass, because that endpoint
mixes unit bases. If unverified, it stays null. `observed_at` advances on every successful
refresh even when the values are unchanged; the history table records only real changes.

### `fundamentals_history`

Append-only change log used by financial rules and by the AI for trend context.

`id bigserial`, `instrument_id`, `source`, `as_of date` nullable, `observed_at`,
`values_hash`, `values jsonb`, `raw jsonb`. `values` holds the same ratio and absolute
fields as `fundamentals` (`eps`, `roe`, `debt_to_equity`, `current_ratio`, `revenue_ttm`,
`net_income_ttm`, and the rest), so financial rules diff two history rows without joining
the current table. A row is inserted only when `values_hash` differs from the latest row for
that instrument and source. The daily refresh therefore does not create one row per day,
only one row per actual change. Retention: all changes, which is a few rows per company per
year. Unique on `(instrument_id, source, observed_at)`.

Financial rules compare the latest two rows. A first observation never produces a signal,
and a comparison whose previous row is older than 400 days is skipped rather than treated
as recent deterioration.

### `technical_indicators`

One row per instrument per trading date, computed in the worker from `daily_bars` only.

`instrument_id`, `date`, `close`, `sma50`, `sma200`, `macd`, `macd_signal`,
`macd_hist`, `rsi14`, `high20`, `low20`, `avg_volume20`, `price_basis`, `computed_at`.
Primary key `(instrument_id, date)`. Values are null when there is not enough history. The
worker recomputes the last 250 sessions on every bar backfill and once per trading day. This
table also serves the stock detail technical card and the AI tools, so the app never
computes indicators on a device.

### `positions`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text not null | references Better Auth `user.id` |
| instrument_id | bigint not null | |
| quantity | numeric(18,4) not null | must be greater than zero |
| avg_cost | numeric(18,4) not null | EGP per share, zero allowed |
| currency | text not null default `EGP` | |
| opened_at | date null | |
| notes | text null | |
| created_at, updated_at | timestamptz not null | |

Unique on `(user_id, instrument_id)`. One position per stock, no lots and no trade ledger.
Unrealized P&L is computed at read time as `(price - avg_cost) * quantity`, and weight as
market value divided by total portfolio market value. Nothing is stored twice. Cost basis
is not adjusted for corporate actions in v1; the edit screen states this.

### `signals`

Global, deterministic facts about an instrument, not per user. One row per rule firing.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| instrument_id | bigint not null | |
| rule | text not null | e.g. `tech_sma50_break` |
| category | text not null | `technical` or `financial` |
| severity | text not null | `warning` or `severe` |
| trigger_ref | text not null | `bar:2026-10-26` or `fin:1288` |
| as_of | timestamptz not null | date of the data, not the compute time |
| expires_at | timestamptz not null | `as_of` plus 20 trading days for technical (market calendar), 120 days for financial |
| value | jsonb not null | measured values, threshold, and previous value |
| created_at | timestamptz not null | |

Unique on `(instrument_id, rule, trigger_ref)` so a rerun cannot duplicate a signal.
Indexes on `(instrument_id, as_of desc)`, `(expires_at)`, `(category, as_of desc)`, and
`rule`. Signals are kept for 2 years, which also gives the AI a signal history to reason
over.

### `alert_rules`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text not null | |
| instrument_id | bigint not null | |
| kind | text not null | `price_above`, `price_below`, `pct_move_up`, `pct_move_down`, `signal` |
| params | jsonb not null | validated by Zod per kind |
| origin | text not null | `user` or `position` |
| is_enabled | boolean not null default true | |
| cooldown_minutes | integer not null default 1440 | |
| last_value | numeric null | last evaluated price or percent move |
| condition_active | boolean not null default false | edge-trigger state for price rules |
| active_since | timestamptz null | |
| last_fired_at | timestamptz null | |
| created_at, updated_at | timestamptz not null | |

Param shapes:

- `price_above` and `price_below`: `{ "threshold": 85.0 }`
- `pct_move_up` and `pct_move_down`: `{ "pct": 5 }`
- `signal`: `{ "categories": ["technical", "financial"], "disabledRules": [] }`

One `signal` rule per user and instrument, created automatically when a position is added
with `origin = position`. The user can disable individual rules inside `disabledRules` or
turn the whole subscription off. Deleting a position disables its `origin = position`
rules and leaves user-created price alerts untouched. Price alerts are unique per
`(user_id, instrument_id, kind, params)`; duplicates are rejected by the service.

Limits: 20 active rules per user, 5 per instrument, threshold greater than zero, percent
move between 1 and 50.

### `alert_events`

The durable record of everything that fired. Push is best effort; this table is the truth.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text not null | |
| instrument_id | bigint not null | |
| rule_id | uuid null | null for system events |
| signal_ids | bigint[] null | one or more signals behind a warning |
| kind | text not null | `price`, `technical`, `financial`, `system` |
| severity | text not null | `info`, `warning`, `severe` |
| locale | text not null | locale used to render the copy |
| title, body | text not null | rendered at creation time |
| data | jsonb not null | ticker, deep link, evidence, as-of |
| dedupe_key | text unique not null | idempotency across retries |
| created_at | timestamptz not null | |
| read_at | timestamptz null | |
| push_status | text not null | `pending`, `sent`, `skipped`, `failed` |
| push_skip_reason | text null | `quiet_hours`, `push_disabled`, or `no_token` |
| push_error | text null | |
| push_ticket_id | text null | checked against Expo receipts |
| pushed_at | timestamptz null | |

Indexes on `(user_id, created_at desc)` and a partial index on unread rows. Retention: 180
days. Signals of the same category for the same user, instrument, and Cairo date are
collapsed into one event with several `signal_ids`, so three technical rules firing together
produce one notification, not three. A grouped event takes the highest severity among its
signals. Technical and financial warnings remain separate events.

### `push_tokens`

`id uuid`, `user_id`, `token text unique`, `platform` (`ios` or `android`), `device_name`,
`app_version`, `last_seen_at`, `is_active`, `created_at`. A token is deactivated on sign
out, on an Expo `DeviceNotRegistered` receipt, and after 60 days without a heartbeat.
Tokens are never written to logs.

### `notification_prefs`

`user_id` PK, `push_enabled`, `technical_enabled`, `financial_enabled`, `price_enabled`
(all boolean, default true), `quiet_hours_start time` default `22:00`, `quiet_hours_end
time` default `08:00`, `timezone` default `Africa/Cairo`, `locale` default `ar`. The row is
created lazily on first read. The four toggles control push delivery only. An inbox event is
created whenever the corresponding alert rule is enabled, so turning a category off never
hides history. Quiet hours likewise suppress push only. The app syncs `locale` whenever the
language changes, because push copy is rendered server side before the app opens.

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
| Fundamentals refresh | Daily 17:10 | Same scan response; history row only when values change |
| Quotes | Every 10 minutes with jitter, 10:00 to 14:30 | Last run at 14:35 captures the close |
| Daily bars | Daily 16:30, plus 1 year backfill on boot | Yahoo `.CA` chart endpoint |
| Technical indicators | Daily 17:20, and after any bar backfill | Recompute the last 250 sessions |
| Signal evaluation | Daily 17:25 | Technical and financial rules over stored data |
| Price alert evaluation | After each successful quotes batch | Enqueued by the quotes job, singleton per 10 minute bucket |
| Push dispatch | Immediately after fan-out | Expo Push API, batches of 100 |
| Push receipt check | 15 minutes after each dispatch | Deactivate tokens on `DeviceNotRegistered` |
| News | Every 20 minutes, all day | Publisher RSS, both languages |
| Snapshot retention | Daily 03:00 | Delete snapshots older than 90 days |
| Alert retention | Daily 04:00 | Delete events older than 180 days, signals older than 2 years |
| Index refresh | Daily 17:15, plus on boot | See open question 3 |

Schedules are configuration values, not hardcoded strings. The market calendar module
returns `isTradingDay` and `sessionState` (`pre`, `open`, `closed`) and is the only place
that knows EGX hours and holidays. Jitter is plus or minus 60 seconds, so quote polls do
not arrive on a fixed pattern.

Market-data jobs (quotes, bars, indicators, signals, and price alert evaluation) run only on
trading days. News and retention run every day. Signal evaluation refuses to run when that
day's bar job failed or wrote no new bars, and records the run as failed rather than
evaluating stale history.

### Source rules

1. Absolute figures (market cap, revenue, net income, debt, assets) come only from
   TradingView `/scan`. Never mix them with `/symbol`.
2. Every stored absolute value records `currency = EGP`.
3. Ratio fields are safe from either endpoint.
4. Yahoo supplies bars only. Yahoo fundamentals and statement endpoints are not used.
5. If a provider returns an empty or partial payload, the run is recorded as `partial` or
   `failed`, and existing rows are not overwritten.
6. Every write records `source` and `as_of`. Fundamentals also record `observed_at` and a
   `values_hash`; a history row is appended only when that hash changes.
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

### Signal and alert evaluation

Four stages, each in the worker and each idempotent:

1. Compute indicators from `daily_bars` into `technical_indicators`.
2. Evaluate rules and insert new rows into `signals`, keyed by `trigger_ref`.
3. Fan out new signals and price crossings into per-user `alert_events`.
4. Dispatch pending pushes, then check receipts.

Signals are computed for every instrument with enough bars, not only held names, so any
stock detail can show a warning card and the AI can reason over it. Fan-out is the step
that filters by subscription.

#### Technical rules

Evaluated once per trading day on the daily close, after bars are written.

| Rule | Fires when | Minimum bars | Severity |
|---|---|---|---|
| `tech_sma50_break` | Close crosses below SMA50 after at least 5 closes at or above it | 50 | warning |
| `tech_death_cross` | SMA50 crosses below SMA200 | 200 | severe |
| `tech_macd_bearish` | MACD(12,26,9) line crosses below its signal line | 35 | warning |
| `tech_low20_break` | Close below the prior 20-session low on volume at least 1.5 times the 20-session average | 21 | warning |
| `tech_rsi_weak` | RSI14 crosses below 30 | 15 | warning |

The threshold values live in one module with the rule ids, so tests and copy share them.
These are heuristics, not predictions, and the copy says so.

Crossings are confirmed against the stored indicator rows: `tech_sma50_break` requires the
prior five sessions at or above SMA50, and `tech_rsi_weak` requires the prior RSI at or
above 30. `tech_low20_break` uses the 20 sessions before today and excludes today's bar.

A signal is an event, not a permanent state. Technical signals expire 20 trading days after
the bar that produced them, and financial signals 120 days after the observation. The stock
detail card shows non-expired signals plus the current indicator snapshot, so it can say
both "this fired on 26 October" and "price is still below SMA50". Expired signals stay in
the table for history and for the AI.

#### Financial rules

Evaluated only when a new `fundamentals_history` row is written, comparing it with the
previous row for the same instrument and source. Both values must be present, and the
previous observation must be no older than 400 days. A first observation never fires.

| Rule | Fires when | Severity |
|---|---|---|
| `fin_debt_spike` | Debt to equity is at least 1.0 and at least 50% above the previous observation | warning |
| `fin_current_ratio_low` | Current ratio falls below 1.0 after being at or above 1.0 | warning |
| `fin_margin_drop` | Net margin falls at least 25% relative, or turns negative | warning, severe if negative |
| `fin_eps_drop` | EPS falls at least 25%, or turns negative from positive | warning, severe if negative |

Coverage is limited to companies with usable fundamentals. A financial warning always
names the observation date, and the copy calls it "latest published figures" rather than
current. Relative comparisons require a previous value greater than zero; otherwise only a
sign change can fire. `fin_debt_spike` requires the previous debt-to-equity value to be
positive, and net margin is `net_income_ttm / revenue_ttm`, skipped when revenue is zero or
negative.

#### Edge triggering and cooldown

- Price rules fire on a crossing, never on a level that is already true. The rule stores
  `condition_active` and `last_value`; it fires only on the false to true transition and
  re-arms when the condition becomes false.
- A rule created while its condition is already true does not fire immediately. It arms on
  the next crossing. Re-enabling a disabled rule behaves the same way. The create screen
  shows the current price and states this plainly.
- Each signal is already an edge event. `signals` is unique on
  `(instrument_id, rule, trigger_ref)`, so rerunning the job cannot duplicate it.
- Per user, instrument, category, and Cairo date, at most one grouped warning event is
  created, so three technical rules firing on the same close produce one notification.
  Technical and financial warnings can each produce one, for a maximum of two warning
  pushes per instrument per day.
- `alert_rules.cooldown_minutes` defaults to 1440 and applies to price rules. A level that
  stays true never re-notifies, and a re-cross inside the cooldown creates no event, so the
  inbox does not fill during a choppy session.

#### Price alert semantics

- `price_above` fires when the previous evaluated price was below the threshold and the
  current price is at or above it. `price_below` is the inverse.
- `pct_move_up` and `pct_move_down` compare `change_pct` against the previous close and
  fire when the absolute move crosses the configured percentage.
- Percent-move rules reset their edge state at the start of each session, because their
  reference resets to the previous close. A 5 percent move today can fire again tomorrow.
- A gap through the level still counts as a crossing. The event records the actual price
  and notes that it gapped.
- Evaluation runs after every successful quotes batch and once on the 14:35 close
  snapshot. A quote marked stale, or with an `as_of` older than 15 minutes during a
  session, is ignored. No event is created from stale data.
- Outside the session, price rules are evaluated only on the close snapshot, never on
  pre-market or weekend quotes.

#### Fan-out and push

- Fan-out selects users with an enabled `signal` rule for the instrument and groups
  technical and financial signals per instrument, category, and Cairo date. Push
  preferences are applied later, at dispatch, so the inbox stays complete even when a
  category is silenced.
- Copy is rendered in the user's locale at creation time and stored on the event. The app
  renders the inbox and detail from structured `data` in the current locale, falling back to
  the stored copy.
- `dedupe_key` is `userId:instrumentId:cairoDate:category` for grouped warnings and
  `ruleId:triggerRef` for price events. Inserts use `ON CONFLICT DO NOTHING`.
- Only events with `push_status = pending` are dispatched. Quiet hours mark the event
  `skipped` with reason `quiet_hours`, as do a disabled push preference and a missing token.
  The inbox still shows the event. Nothing is held back and sent later, because a stale
  alert is worse than no alert.
- Sends are chunked at 100 messages per Expo request. A failed send keeps the event with
  `push_status = failed` and retries up to 3 times with backoff.
- Receipts are checked 15 minutes later. `DeviceNotRegistered` deactivates the token.
- Push payloads carry ticker, rule label, short message, and event id. They never carry
  quantity, cost, portfolio value, or P&L.

#### Alert copy

Templates live in the API, not in the mobile app, because push text is rendered before the
app opens. Both locales are complete.

- Technical example, Arabic: "تحذير فني: أغلق COMI عند 78.40، تحت المتوسط 50 يوم
  (80.12) لأول مرة في 12 جلسة. البيانات حتى 26 أكتوبر."
- Financial example, Arabic: "تحذير مالي: ارتفع الدين إلى حقوق الملكية إلى 1.42 من 0.91
  في أحدث قوائم منشورة (30 يونيو 2026)."
- Every template includes the measured value, the threshold, the data date, and
  "معلوماتي وليس توصية" or "Informational, not advice".
- No template says buy, sell, hold, or implies an action. No expected returns.
- Push body is at most 160 characters. The evidence table lives in the inbox event.

#### Missing and degraded data

- No bar history: no technical rules, and the detail card shows "n of 200 sessions
  available".
- No quote: no price alert, and the position shows cost with "price unavailable".
- Inactive or delisted instrument: rules pause, they are not deleted.
- Fundamentals older than 400 days: no financial comparison, and the card labels the data
  as old.
- A failed indicator or signal run leaves the previous signals in place and is visible on
  the data status screen.

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
| GET | `/api/instruments/:ticker/signals` | Recent non-expired signals, latest technical snapshot, history coverage |
| GET | `/api/news?lang=ar\|en&sector=&cursor=` | Cursor feed |
| GET | `/api/watchlist` | Current user's list with quotes |
| POST | `/api/watchlist` | Body `{ ticker }` |
| DELETE | `/api/watchlist/:ticker` | Remove |
| PATCH | `/api/watchlist/order` | Body `{ tickers: string[] }` |
| GET | `/api/portfolio` | Positions with quotes, unrealized P&L, weights, totals |
| POST | `/api/portfolio/positions` | Body `{ ticker, quantity, avgCost, openedAt?, notes? }`, also creates or re-enables a position-origin signal rule |
| PATCH | `/api/portfolio/positions/:id` | Update quantity, cost, opened date, notes |
| DELETE | `/api/portfolio/positions/:id` | Remove, and disable its position-origin signal rule |
| GET | `/api/alerts/rules` | Current user's rules with instrument identity |
| POST | `/api/alerts/rules` | Body `{ ticker, kind, params }` |
| PATCH | `/api/alerts/rules/:id` | Enable, disable, or change params |
| DELETE | `/api/alerts/rules/:id` | Delete |
| GET | `/api/alerts/events?cursor=&unread=&kind=` | Inbox, newest first |
| GET | `/api/alerts/unread-count` | Badge count |
| POST | `/api/alerts/events/read` | Body `{ ids: string[] }` |
| PATCH | `/api/alerts/events/:id` | Body `{ read: boolean }` |
| POST | `/api/alerts/events/read-all` | Mark every event read |
| POST | `/api/push/register` | Body `{ token, platform, deviceName, appVersion }` |
| POST | `/api/push/unregister` | Body `{ token }`, called on sign out |
| GET | `/api/notifications/prefs` | Global toggles and quiet hours |
| PATCH | `/api/notifications/prefs` | Update toggles, quiet hours, and locale |
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
- Positions limited to 200 per user. Quantity greater than zero and at most 1e9. Average
  cost zero or more and at most 1e7. Notes at most 280 characters.
- Positions and price alerts are limited to instruments with `kind = stock`.
- Alert rules limited to 20 active per user and 5 per instrument. Price threshold greater
  than zero. Percent move between 1 and 50. `disabledRules` may only contain known rule ids.
- Alert events paginate 50 at a time. Unread count is a cheap indexed query.
- Quiet hours start and end must differ. The window may cross midnight.
- Push registration is limited to 10 calls per hour per user and 5 active devices. Tokens
  must match the Expo push token format and be at most 200 characters. Registering a token
  that already belongs to another user reassigns it to the current user, which is the
  correct behavior on a shared device.
- Every mutation on a position, rule, or event is scoped by `user_id`; a row that belongs
  to another user returns 404, not 403, so existence is not leaked.
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
- Explain a warning by naming the rule, the measured value, the threshold, and the date,
  and never present the warning as a reason to trade.

### Context assembly

The backend builds a base context bundle and exposes tools for deeper retrieval:

- Instrument identity: ticker, names, sector, industry.
- Latest quote with `asOf` and `stale`.
- Fundamentals with `as_of`, `observed_at`, and explicit missing fields.
- 30 day statistics: return, volatility, high and low.
- Peer set: up to 8 same-sector names with median P/E, P/B, dividend yield.
- Up to 10 recent news items with source, date, title, and summary.
- Watchlist membership.
- Recent non-expired signals with rule, severity, values, and `as_of`, plus indicator
  coverage and the current technical state.
- The user's position in the instrument: quantity, average cost, unrealized P&L, and
  portfolio weight, when one exists.
- Active price alerts for the instrument.
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
| `get_signals` | Active and recent signals for an instrument, with values and trigger dates |
| `get_technical` | Latest indicator snapshot and available history coverage |
| `get_portfolio` | The user's positions with unrealized P&L and weights |
| `get_alerts` | The user's recent alert events and their evidence |

Tools never call a third party. They read Postgres. Tool results carry `source` and
`asOf`, and the system prompt requires them in the answer.

Portfolio and alert tools are read-only and scoped to the authenticated user. The assistant
cannot create, change, or delete a position, rule, or alert. It may suggest creating one,
and the UI performs it after an explicit user action.

Position data is personal. It enters a model request only when the user's message asks about
their portfolio or a stock they hold, never as ambient context for unrelated questions.
Tool results are not logged, and only the fields needed to answer are sent to the provider.

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
  _layout.tsx                 providers, fonts, auth gate, RTL bootstrap, push handler
  (auth)/
    sign-in.tsx              email entry and Google
    otp.tsx                  six digit code entry
  (app)/
    (tabs)/
      _layout.tsx             5 tabs
      index.tsx               Markets, bell with unread badge
      watchlist.tsx           My Stocks: Watchlist and Positions segments
      news.tsx                News
      ai/
        index.tsx             Thread list
        [threadId].tsx        Chat
      profile.tsx             Profile, language, data status
    stock/[ticker].tsx        Stock detail, warnings, position, price alert sheet
    alerts/
      index.tsx               Alert inbox
      [id].tsx                Alert detail with evidence
    settings/
      notifications.tsx       Push, quiet hours, per-rule toggles
```

Tabs: Markets, My Stocks, News, AI, Profile. The bell in the Markets header opens the
alert inbox with an unread badge. Stock detail opens as a stack screen from lists, search,
news, AI citations, alerts, and push notifications.

### Authentication

- Email OTP and Google only. No passwords in v1.
- The email screen calls `authClient.emailOtp.sendVerificationOtp`, then the code screen
  calls `authClient.signIn.emailOtp` with the six digit code.
- Codes expire after 10 minutes, allow 5 attempts, and are rate limited by email and IP.
- A new user record is created on the first successful OTP or Google sign in. There is no
  separate registration screen.
- Google uses the Better Auth Expo client with the `egx://` callback scheme.
- Apple sign in is required before an iOS App Store release and is added in M6.
- Sign out clears the secure session, the query cache, and the push token for this device.

### Screens

Markets:

- EGX 30 card with value, change, and 30 day sparkline.
- Market breadth: advancers, decliners, unchanged.
- Gainers and losers, five each.
- Sector performance strip.
- Header bell with an unread alert count. Tapping opens the inbox.
- Pull to refresh. Auto refetch every 60 seconds while foregrounded and the session is open.

My Stocks:

- Segmented control: Watchlist and Positions. The last used segment is remembered.
- Watchlist rows keep the existing list behavior and show an amber dot when a stock has a
  non-expired warning.
- Position rows show quantity, average cost, market value, unrealized P&L in EGP and
  percent, and day change.
- Totals card above the positions: market value, total cost, unrealized P&L, and day
  change. Cash is not tracked, so the total is explicitly labeled "invested positions".
- If any held quote is stale, the totals card shows a stale marker and the oldest quote
  time. Positions without a quote are excluded from market value and weight, and the card
  states how many were excluded.
- Positions sort by market value. No manual reorder.
- Empty positions state explains that adding a holding enables warnings, with a search
  action. No cash balance field.

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
- Position strip under the header when the stock is held: quantity, average cost,
  unrealized P&L, and portfolio weight.
- Warnings card under the chart: up to three recent warnings with severity, a plain-language
  line, and the data date. Expanding a warning shows measured value, threshold, previous
  value, and source. The card links to "Ask AI why". With none it says there are no recent
  warnings, naming the 20 session technical and 120 day financial windows, and shows the
  current indicator state. With insufficient history it says how many sessions are available
  out of what each rule needs.
- Technical snapshot: SMA50, SMA200, RSI14, MACD state, and the 20-day range, each with an
  as-of date and a "heuristic, not a prediction" note. When a rule used adjusted closes,
  the card labels the basis and shows the adjusted value the rule used, while the quoted
  price stays raw.
- Key stats: market cap, P/E, P/B, EPS, ROE, dividend yield, debt to equity, 52 week range.
  Missing fields show "غير متاح" or "Not available".
- Peers: same-sector names with P/E and dividend yield.
- News: latest five linked articles with source and time.
- Primary action: add or remove from watchlist.
- Bell action: open the price alert sheet.
- Secondary action: add or edit position.
- Tertiary action: Ask AI about this stock. Opens a thread scoped to the instrument.

Price alert sheet:

- Chooses above, below, up X percent today, or down X percent today. For absolute levels,
  presets of 2, 5, and 10 percent from the current price fill the threshold. Percent-move
  rules measure from the previous close and reset each session.
- Shows the current price and as-of time. Saving is disabled when the quote is stale.
- States that alerts are evaluated on the 10 minute quote cycle during the session, so they
  can lag the market, and that provider data may itself be delayed.
- States that a rule armed while its level is already true fires on the next crossing, not
  immediately.
- Lists existing rules for this stock with enable, disable, and delete.
- The first alert or position triggers the push permission pre-prompt, not first launch.

Alert inbox:

- Grouped by day, newest first, with All, Price, Technical, and Financial filters.
- Row shows severity icon, ticker and name, title, relative time, and an unread dot.
- Mark all read, pull to refresh, and an empty state that explains what will appear here.
- Refetches when a push arrives while the app is foregrounded.

Alert detail:

- Title, body, severity, instrument, and the data date.
- Evidence table: rule, measured value, threshold, previous value, trigger date, and source.
- Actions: open the stock, ask the AI why, mark unread.
- Persistent disclaimer footer.

Notification settings:

- Push permission state, with a link to system settings when denied.
- Toggles for push, technical warnings, financial warnings, and price alerts. Turning a
  category off suppresses push but keeps its events in the inbox.
- Quiet hours start and end in Cairo time, with the note that pushes are suppressed, not
  delayed.
- Per-instrument signal rules with technical and financial switches and per-rule switches.
  These control what is recorded for that stock. The global toggles above only silence push,
  and disabling a rule never hides the research warning card on the stock page.
- Price rules list with the same controls as the sheet.

Push handling:

- The token is registered after sign-in when permission is granted, refreshed on app start
  and on token change, and removed on sign out.
- Permission is requested after the first position or price alert, behind a pre-permission
  sheet that explains the value. Never at first launch.
- Android uses an `alerts` channel at high importance for price alerts and severe warnings.
  Informational warnings use a default-importance channel.
- A foreground push invalidates the unread count and inbox queries and shows a small toast,
  not a duplicate banner.
- Taps deep link to `egx://stock/COMI` for price alerts and `egx://alerts/<id>` for
  warnings. Cold starts are handled with `getLastNotificationResponseAsync`.
- A notification whose event was deleted falls back to the inbox.
- Push text is already localized at send time. The detail screen renders structured `data`
  in the current locale instead of reusing the stored push string.

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
- Notifications row linking to push, quiet hours, and per-rule settings.
- Data status: last ingestion per job, last signal evaluation, last push dispatch, stale
  sources.
- Disclaimer and data attribution.

### State and data fetching

- TanStack Query for all server state. Query keys include the ticker, range, position id,
  alert kind, and cursor.
- REST calls go through a typed `openapi-fetch` client generated from
  `packages/contracts`. Regenerating types is part of the API change workflow.
- Polling: overview, watchlist, and portfolio every 60 seconds while foregrounded.
  Instrument detail every 60 seconds during an open session. Unread alert count every 60
  seconds and immediately on a foreground push. Server-side quote polling is the slower 10
  minute interval.
- Optimistic watchlist add and remove, and optimistic alert read state, both with rollback
  on error. Position edits invalidate portfolio, instrument detail, and totals.
- A push token hook owns registration, refresh, and sign-out cleanup. It runs after the
  session is ready and never blocks the first render.
- Zustand for session, locale, and UI state. Locale persisted with AsyncStorage.
- AI chat uses `useChat` with `DefaultChatTransport({ api, fetch: expoFetch })`. The screen
  renders text parts, tool call status, tool results, citations, and errors. A stop button
  aborts the stream.
- The AI SDK Expo setup polyfills are imported once at app startup, before any transport is
  created, following the official Expo guide.
- Offline: previously fetched data stays in memory and a banner explains that updates are
  paused. No offline mutations in v1, including alert rules and positions.

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
| warning | `#F59E0B` | Signal icon, warning border, severity label |
| warningSurface | `rgba(245,158,11,0.10)` | Warning card background |
| up | `#22C55E` | Positive change only |
| down | `#EF4444` | Negative change only |
| text | `#F5F1E8` | Primary text |
| textSecondary | `#A8ADB8` | Secondary text |
| textMuted | `#6E7480` | Metadata, placeholders |
| overlay | `rgba(15,17,21,0.7)` | Scrims |

Warnings use amber, never red. Red is reserved for price direction, so a warning cannot be
confused with a losing quote. Severity is expressed by icon, weight, and order, not a new
hue: `severe` uses a filled amber badge and sorts first. A warning card is never filled
with a strong color across its whole surface, because that would read as an alarm rather
than information.

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
- Insufficient bar history: the warning card says how many sessions exist against what each
  rule needs. Death cross stays silent until 200 sessions exist.
- Position without a quote: cost and quantity stay visible, price and P&L show
  "price unavailable", and no price alert can be created.
- Stale quote: price alert creation is disabled, existing price rules pause, and no event
  is created from stale data.
- Old fundamentals: the warning names the observation date, and a comparison older than
  400 days is skipped with a note instead of firing.
- Push permission denied: the inbox still works, and settings shows the denied state with a
  link to system settings. The app never asks again on its own.
- Quiet hours: the event appears immediately, the push is skipped, and nothing is sent
  later. The event keeps its original timestamp.
- A level that stays true does not repeat. A re-cross after the condition clears can fire
  again, subject to the 24 hour cooldown.
- Several rules firing on one close: one grouped event and one push, with the card showing
  three and a "show all" action.
- Position deleted: its position-origin signal rule is disabled; user-created price alerts
  remain.
- Delisted or inactive stock: rules pause, the position shows the last known price with a
  "not trading" label.
- Invalid or expired push token: the token is deactivated silently and the inbox is
  unaffected.
- Notification for a deleted event: the app opens the inbox instead of an error.

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
`EXPO_ACCESS_TOKEN` (optional but recommended), `CORS_ORIGINS`, `TZ`.

Mobile environment variables:

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AUTH_SCHEME`.

Push and alert privacy:

- A push token is a delivery credential. It is stored server side, never logged, and
  deactivated on sign out, on a `DeviceNotRegistered` receipt, or after 60 days unseen.
- Push payloads contain ticker, rule label, short message, and event id only. Quantity,
  average cost, portfolio value, and P&L never leave the database in a push, so a lock
  screen cannot leak a position size.
- Positions, rules, events, and notification preferences are scoped by `user_id` in every
  query. Cross-user access returns 404.
- Deep links from notifications are validated against known routes and existing tickers
  before navigation.
- Alert copy never contains an instruction to buy, sell, or hold, and always carries the
  informational disclaimer.
- Push registration and preference writes are authenticated and rate limited.
- Alert logs record rule ids, counts, and suppression reasons. They never record tokens,
  position sizes, or alert body text.
- All SQL through Drizzle. No string-built queries.
- All request bodies and query parameters validated with Zod.
- Chat content is private to the user and never used for training.
- Logs redact authorization headers, cookies, and API keys.
- Data attribution in Profile: TradingView, Yahoo Finance, and each news publisher.
- Persistent disclaimer in AI and an About section stating that data may be delayed,
  unofficial, and not investment advice. The same disclaimer appears in the alert inbox.
- Only headlines, summaries, and links are stored for news.
- Before public distribution, review TradingView and Yahoo terms and publisher RSS
  conditions. The v1 build is private.

## 17. Observability

- Pino JSON logs with request id, user id where authenticated, route, status, and latency.
- One log line per ingestion run with job, source, status, rows, and duration.
- One log line per signal run with instruments evaluated, signals inserted, and duration.
- One log line per fan-out with events created, events grouped, and counts by suppression
  reason (quiet hours, cooldown, no subscription, stale quote).
- One log line per push batch with chunk count, sent, failed, and receipt failures. No
  tokens and no message bodies.
- Counters: `alerts.signals_created`, `alerts.events_created`, `alerts.push_sent`,
  `alerts.push_failed`, `alerts.suppressed`, `alerts.rules_evaluated`, and
  `alerts.signal_run_ms`, each labeled by rule and category.
- A daily fire-rate summary per rule. A rule that fires on more than 20 percent of the
  instruments it evaluated is flagged for tuning, because that usually means a threshold
  is wrong, not that the market collapsed.
- One log line per AI turn with thread id, provider, model, tool names, token usage,
  latency, and whether fallback ran. No prompt or answer text in logs by default.
- `ai_fallback` events are counted so provider health is visible.
- `/api/status/data` returns last success and last failure per job, including signal
  evaluation and push dispatch.
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
- Indicator golden tests against hand-computed series for SMA, EMA seeding, MACD, Wilder
  RSI, and ATR. The `trading-signals` version is pinned, and the wrapper is tested
  independently so the library can be replaced.
- One test per technical rule covering: fires once on the crossing, stays silent while the
  condition holds, re-arms after it clears, stays silent with insufficient bars, handles a
  gap through the level, and requires the volume condition where specified.
- One test per financial rule covering: first observation is silent, a real change fires,
  identical values do not, a previous observation older than 400 days is skipped, a
  negative denominator is handled, and turning negative raises severity.
- Price rule tests: crossing versus merely touching, gap through the threshold, percent
  move measured from the previous close, stale quote suppression, and a rule created while
  its condition is already true not firing immediately.
- Fan-out tests: three holders of one instrument produce three events; rerunning produces
  zero duplicates; three signals on one close produce one grouped event; quiet hours keep
  the event and skip the push; cooldown blocks a second push within 24 hours.
- Push tests with a mocked Expo endpoint: chunking at 100, retry on 5xx, receipt
  `DeviceNotRegistered` deactivating the token, and no token or message body in logs.
- Ownership tests: a second user gets 404 on another user's position, rule, and event.
- P&L tests: quantity times price minus cost, zero cost basis, fractional quantity, weight
  across several positions, and a missing quote.
- Timezone tests with a fake clock: quiet hours across midnight and an Africa/Cairo DST
  transition.
- Contract drift test: regenerate OpenAPI types and fail if the checked-in output differs.
- AI tool tests with a mocked database and seeded fixtures. No live model calls in CI.
- A separate `bun run ai:eval` script runs the 10 prompt evaluation set against the
  configured NIM and Gemini models. It is manual, not part of CI.

Mobile:

- Jest and React Native Testing Library for formatting, RTL text direction helpers, and
  watchlist optimistic updates.
- Component tests for quote rows, stale badges, empty states, AI tool and citation parts,
  warning cards with insufficient history, and position P&L formatting.
- Alert tests: price sheet rejects stale quotes, inbox filters, optimistic read state and
  rollback, badge count, permission pre-prompt, and the denied state.
- Deep link tests for a warm and a cold start from both a price alert and a warning.
- Maestro flows for OTP sign in, Arabic search and watchlist add, one streamed AI turn, and
  add position, open a seeded warning, and reach the stock detail.
- Manual Android checklist: sign in, search in Arabic, add to watchlist, add a position, set
  a price alert, switch language, read news, stream an AI answer, kill the network and
  verify the offline banner.

Acceptance for data correctness:

- Every displayed price has an as-of time.
- No UI path shows a zero for a missing fundamental.
- No path shows USD-derived values labelled EGP.

Acceptance for alerts:

- No alert is created from a stale quote.
- Every alert names the rule, measured value, threshold, and data date.
- No alert copy contains buy, sell, or hold.
- Rerunning any job never duplicates an event.
- Disabling a category suppresses push but never loses the inbox event.

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
- Acceptance: 296 instruments stored, one year of daily bars backfilled, quotes refresh on
  the 10 minute schedule, `/api/status/data` shows successful runs, stale logic verified.

M3. Core mobile experience

- Markets, search, stock detail, watchlist, news.
- Acceptance: Arabic search finds COMI, watchlist persists across restarts, detail shows a
  chart, stats, peers, and news.

M4. Positions and alerts

- Positions CRUD with unrealized P&L, portfolio totals, and weights.
- `technical_indicators`, the five technical rules, the four financial rules, `signals`,
  edge triggering, cooldowns, daily grouping, and fan-out.
- Price alerts for above, below, percent up, and percent down.
- Expo push registration, the alert inbox, quiet hours, and deep links.
- Stock detail warning card and technical snapshot, price alert sheet, alert detail,
  notification settings.
- Acceptance: add a COMI position, seed a bar series that breaks SMA50, run the daily job,
  and receive exactly one push naming the rule and the data date. Open it to the evidence
  table, then rerun the job and confirm zero duplicates. A price alert above the current
  price fires once on the crossing, stays silent while the level holds, and re-arms after
  it falls back. During quiet hours the event is in the inbox and no push is sent. Denying
  push permission leaves the inbox fully usable.

M5. AI assistant

- AI SDK 7 with `useChat`, typed tools including signals, technical, portfolio, and
  alerts, citations, persistence, and rate limits.
- Model benchmark across NIM candidates and Gemini, then pin the defaults.
- NIM primary with Gemini fallback and fallback logging.
- Acceptance: "قارن كومي واتصالات" streams a grounded answer that calls tools, cites both
  quotes and fundamentals with dates, shows the disclaimer, and survives a forced primary
  provider failure by answering through Gemini. "ليه جاتلي تحذيرات على كومي؟" names each
  rule, value, threshold, and date, and does not recommend an action.

M6. Hardening

- RTL polish, error and empty states, accessibility pass, reduced motion.
- Apple sign in for iOS, contract drift CI, data status screen including signal and push
  jobs, README, env example, EAS Android build profile, and a documented development build
  for push testing.
- A two week tuning pass on the rule thresholds using seeded history, with the fire-rate
  report reviewed per rule.
- Acceptance: manual checklist passes on a physical Android device, including a real push
  on a development build.

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
13. pg-boss on Bun and Postgres 18. Validate the worker, cron, retry, and alert fan-out
    behavior in M2 and M4 before relying on it. Fallback is a scheduler with Postgres
    advisory locks.
14. Typed client drift. The OpenAPI document and generated types can diverge if the CI
    drift check is skipped. Treat regeneration as part of every API change.
15. Alert fatigue. Nine rules across a handful of holdings can still produce noise.
    Mitigations: edge triggering, a 24 hour per-rule cooldown, one grouped warning per
    category per instrument per day, per-rule switches, plain-language evidence, and a two
    week tuning pass with a per-rule fire-rate review while the app is private.
16. False precision in technical rules. Daily closes from an unofficial source can be
    adjusted inconsistently, and a partial backfill cannot support SMA200. Mitigations:
    explicit `adj_close` and `price_basis`, a 200 session requirement, an honest
    insufficient-history state, and copy that calls the rules heuristics.
17. Financial alert coverage and staleness. Only 70 to 90 names have fundamentals, and
    updates may arrive quarterly without an as-of date. Mitigations: fire only on a value
    change, cite `observed_at`, skip comparisons older than 400 days, and label the figures
    as the latest published.
18. Push delivery and permissions. Expo Push depends on FCM and APNs, tokens churn, and
    Android 13 and iOS both require permission. Mitigations: the inbox is the source of
    truth, receipts are checked, tokens are cleaned up, and settings shows the permission
    state.
19. Advice perception. A warning on a held stock can read as "sell". Mitigations: neutral
    copy with no action verbs, visible evidence, and the disclaimer on every alert detail.
20. A bad bar creates a false signal. Mitigations: OHLC validation before insert, rejection
    of impossible bars, recomputation of the last 250 sessions after any backfill, and a
    signal run that fails rather than writes on incomplete data.
21. Remote push cannot be tested in Expo Go on Android. A development build with an EAS
    project id is required from M4 onward. The README must state this before the milestone
    starts, so testing is not blocked late.
22. Quiet hours and session times depend on the timezone database. Egypt reintroduced DST,
    so `Africa/Cairo` must come from a current tz database. Tests cover both a DST
    transition and a window that crosses midnight.

## 21. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-26 | Server-first architecture | One source of truth, simpler AI tools, matches owner stack |
| 2026-10-26 | Free polled market data | No free licensed EGX feed exists |
| 2026-10-26 | Better Auth accounts | Watchlist, positions, and chat history need identity |
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
| 2026-10-26 | Manual positions with unrealized P&L | Scopes warnings by exposure without a trade ledger |
| 2026-10-26 | Five technical and four financial rules | Balanced signal to noise, every rule explainable and toggleable |
| 2026-10-26 | Edge-triggered warnings with 24 hour cooldown | Prevents repeats while a condition holds |
| 2026-10-26 | One grouped warning per category per instrument per day | Three rules on one close should not mean three pushes |
| 2026-10-26 | Push plus durable inbox | Push is best effort, the inbox is the record |
| 2026-10-26 | Technical rules on daily closes only | Intraday quotes are polled and noisy; price alerts cover intraday |
| 2026-10-26 | No position size or P&L in push payloads | Lock-screen privacy |
| 2026-10-26 | Warnings use amber, never red | Red stays reserved for price direction |
| 2026-10-26 | Alerts milestone before AI | Signals become grounded context and tools for the assistant |
| 2026-10-26 | `trading-signals` for indicator math | Maintained, typed, tested, and wrapped for replacement |
| 2026-10-26 | Financial alerts only on value change | Daily refreshes would otherwise fire on unchanged data |
