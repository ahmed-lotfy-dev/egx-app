# EGX App

Arabic-first mobile app for the Egyptian Exchange: markets, stock data, news, a
watchlist, manual positions, alerts, and a grounded AI assistant.

The design is in [docs/superpowers/specs/2026-10-26-egx-app-design.md](docs/superpowers/specs/2026-10-26-egx-app-design.md).
Milestone 1 covers the workspace, authentication, generated API types, and design tokens.
M2a adds the market schema, the ingestion worker, the instruments/overview/status APIs,
and the live Markets screen. M3 adds the stock detail screen, daily history with support
and resistance, TradingView fundamentals, and per-stock Arab Finance news. Scheduled
ingestion (pg-boss) is M2b.

## Layout

```
apps/mobile      Expo SDK 58 app (expo-router, Uniwind, Better Auth)
apps/api         Bun + Hono API, Drizzle, Better Auth
apps/worker      ingestion CLI (TradingView universe/quotes/fundamentals, Yahoo bars, RSS news)
packages/contracts  shared Zod schemas and the generated OpenAPI document
```

## Prerequisites

- Bun 1.3+
- Docker with Compose
- Android emulator or a device with Expo Go for the auth flow

The development database listens on host port `5433` because `5432` may already be in
use. It runs in the `egx-db` container with a named volume.

## Setup

```sh
cp .env.example .env
# fill BETTER_AUTH_SECRET; generate one with: openssl rand -base64 32
cp .env.example apps/mobile/.env
# keep the EXPO_PUBLIC_* values; use 10.0.2.2 for the Android emulator

bun install
bun run db:up
bun run db:migrate
bun run sync:all          # universe, symbols, bars, quotes, fundamentals, news
bun run dev:api
bun run dev:mobile
```

`sync:all` needs the root `.env` with `DATABASE_URL`; it runs the universe, Yahoo-symbol
resolver, bars, quotes, fundamentals, and news jobs. Re-run `bun run sync:quotes` whenever
you want fresh prices, and `bun run sync:bars -- --missing` to fill only tickers with no
stored bars.

The API listens on `http://localhost:3000`. In development, when `RESEND_API_KEY` is
unset, the email OTP is written to the API log instead of being sent.

`EXPO_PUBLIC_API_URL` must be reachable from the device. `10.0.2.2` is the Android
emulator's alias for the host. A physical device needs the host LAN address. Use the
origin only (for example `http://10.0.2.2:3000`); the app appends `/api/auth` for
Better Auth and uses the `/api/...` paths from the generated contract.

## Contracts

`packages/contracts` owns the Zod request and response schemas. The API builds the
OpenAPI document from them, and `apps/mobile/src/types/api.d.ts` is generated with
`openapi-typescript`.

```sh
bun run contracts:generate   # regenerate openapi.json and api.d.ts
bun run contracts:check      # fail when either artifact is stale
```

## Market data (M2a)

The worker writes to the same Postgres database as the API:

```sh
bun run sync:universe   # TradingView: 296 instruments, Arabic names, sectors, logos
bun run sync:quotes     # TradingView: latest quotes + snapshots
bun run sync:symbols    # resolve missing EGX tickers to Yahoo symbols
bun run sync:bars       # Yahoo: daily bars (requests one year)
bun run sync:bars -- --missing   # only tickers with no stored bars
bun run sync:fundamentals        # TradingView scan: valuation, profitability, health
bun run sync:news                # Arab Finance RSS (10 categories, Arabic + English)
bun run sync:all                 # universe -> symbols -> bars -> quotes -> fundamentals -> news
```

`sync:bars` also accepts `--tickers COMI,HRHO`, `--limit 10`, and `--days 365`.

Verified endpoints:

| Endpoint | Returns |
|---|---|
| `GET /api/instruments?q=&sector=&kind=&limit=&cursor=` | Searchable, paginated instrument list with latest quote |
| `GET /api/instruments/:ticker` | Identity, quote, Yahoo/TradingView symbols, history coverage, fundamentals |
| `GET /api/instruments/:ticker/history?range=1W\|1M\|3M\|6M\|1Y` | Daily bars, range stats, and pivot support/resistance |
| `GET /api/instruments/:ticker/news?limit=10&lang=ar\|en` | Linked Arab Finance headlines with language fallback |
| `GET /api/market/overview` | EGX30, breadth, top gainers/losers, 21 sectors, sparkline |
| `GET /api/status/data` | Last run per job and stored row counts |
| `GET /api/status` | API and database health |

Coverage on the verified snapshot: 296 instruments (295 stocks + EGX30), 296 quotes,
249 stocks with a Yahoo symbol, and 42,835 stored daily bars across 246 instruments
(245 stocks + EGX30). History is bimodal: 176 stocks have 240–243 bars, while 69 stocks
and EGX30 have a single recent bar because Yahoo returns only the latest day for those
symbols. 50 stocks have no bars at all: 46 have no Yahoo listing and four are
placeholder-only (`GPPL`, `MISR`, `SAIB`, `GROV`). Quotes and search still work for every
instrument. EGX30 history is unavailable from Yahoo and TradingView, so `indexSparkline`
is served from stored index bars and the UI hides it until there are at least two points.

### M3 coverage notes

TradingView's scan endpoint reports unavailable metrics as `0`, so the worker stores those
as null and the UI renders `غير متاح` instead of a fabricated zero. On the verified
snapshot, 295 stocks have a fundamentals row: market cap 245, P/E 63, EPS 72, P/B 119,
ROE 69, ROA 69, debt/equity 164, dividend yield 85, revenue and net income 72, free cash
flow 62, current ratio 167, beta 241, gross margin 55, and net margin 71. A stock with no
row shows the financials empty state.

`sync:news` reads the 10 Arab Finance category feeds in both languages and links an
article only on a conservative match: the full normalized company name (legal suffixes
removed), the name before ` - `, a short parenthetical alias, or an exact ticker with word
boundaries. On the verified snapshot, 996 articles produced 98 links across 49 stocks, so
an empty news state is expected for most tickers. The endpoint prefers the requested
language and falls back to the other one, setting `meta.fallback` when it does.

Provider and RTL details, including the Yahoo cookie/crumb flow and the `كل` font
workaround, are in [docs/discovery/07-m2a-ingestion-and-rtl-spike.md](docs/discovery/07-m2a-ingestion-and-rtl-spike.md).

## Locale and RTL

Arabic is the default locale; English is a full translation. The locale is stored in
SecureStore and the root view sets Yoga's `direction` from it, so Expo Go and standalone
builds mirror rows, tabs, and cards immediately. A standalone build also applies
`I18nManager.forceRTL` on the next launch for native controls. Signed values are wrapped
in Unicode LTR isolates so `+2.91%` stays intact in Arabic paragraphs.

## Styling

Uniwind turns the Tailwind classes and tokens in `apps/mobile/src/global.css` into React
Native styles. The generated declarations are committed; regenerate them after changing
the tokens or theme list:

```sh
bun run --cwd apps/mobile uniwind:generate
```

## Scripts

| Script | Purpose |
|---|---|
| `bun run db:up` / `db:down` | Start or stop Postgres 18 |
| `bun run db:generate` | Generate a Drizzle migration from schema changes |
| `bun run db:migrate` | Apply pending migrations |
| `bun run dev:api` | API with watch mode |
| `bun run dev:mobile` | Expo dev server |
| `bun run sync:universe` | Ingest the TradingView instrument universe |
| `bun run sync:quotes` | Ingest the latest TradingView quotes |
| `bun run sync:symbols` | Resolve missing EGX tickers to Yahoo symbols |
| `bun run sync:bars` | Backfill Yahoo daily bars |
| `bun run sync:fundamentals` | Ingest TradingView fundamentals |
| `bun run sync:news` | Ingest and link Arab Finance news |
| `bun run sync:all` | Run universe, symbols, bars, quotes, fundamentals, then news |
| `bun run contracts:generate` | Regenerate OpenAPI document and mobile types |
| `bun run contracts:check` | Verify generated artifacts are current |
| `bun run typecheck` | Typecheck the API, worker, and mobile app |

## Development builds

Expo Go is enough for M1 and the M2a Markets screen (email OTP, live market data, Arabic
and English). Push notifications, custom native modules, and release builds need a
development build (`npx expo run:android` or EAS Build); Expo Go cannot load those native
modules.

## Google sign in

Create a **Web application** OAuth client in Google Cloud Console and register
`http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Then set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the root `.env`, and set
`EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true` in `apps/mobile/.env`. Without the credentials the
Google button is hidden and email OTP remains available.

The callback is built from `BETTER_AUTH_URL`, so keep it at `http://localhost:3000` in
development. On the Android emulator, run `adb reverse tcp:3000 tcp:3000` once per boot so
the browser can reach the API at `localhost:3000`.
