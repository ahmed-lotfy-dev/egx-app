# EGX App

Arabic-first mobile app for the Egyptian Exchange: markets, stock data, news, a
watchlist, manual positions, alerts, and a grounded AI assistant.

The design is in [docs/superpowers/specs/2026-10-26-egx-app-design.md](docs/superpowers/specs/2026-10-26-egx-app-design.md).
Milestone 1 covers the workspace, authentication, generated API types, design tokens,
and an empty Markets screen.

## Layout

```
apps/mobile      Expo SDK 58 app (expo-router, Uniwind, Better Auth)
apps/api         Bun + Hono API, Drizzle, Better Auth, pg-boss worker (M2)
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
bun run dev:api
bun run dev:mobile
```

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
| `bun run contracts:generate` | Regenerate OpenAPI document and mobile types |
| `bun run contracts:check` | Verify generated artifacts are current |
| `bun run typecheck` | Typecheck both apps |

## Development builds

Expo Go is enough for M1 (email OTP and the empty Markets screen). Push
notifications, custom native modules, and release builds need a development build
(`npx expo run:android` or EAS Build); Expo Go cannot load those native modules.

## Google sign in

Create a **Web application** OAuth client in Google Cloud Console and register
`http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Then set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the root `.env`, and set
`EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true` in `apps/mobile/.env`. Without the credentials the
Google button is hidden and email OTP remains available.

The callback is built from `BETTER_AUTH_URL`, so keep it at `http://localhost:3000` in
development. On the Android emulator, run `adb reverse tcp:3000 tcp:3000` once per boot so
the browser can reach the API at `localhost:3000`.
