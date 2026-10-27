# Auth starter

This branch is a working snapshot of the M1 scaffold: email OTP and Google
sign-in on Expo SDK 58. Use it as the starting point for a new app.

## Included

- Bun workspace: `apps/mobile` (Expo Router), `apps/api` (Hono + Better Auth),
  and `packages/contracts` (Zod + OpenAPI).
- Email OTP sign-in. In development the code is written to the API log when
  `RESEND_API_KEY` is unset.
- Google sign-in through the Better Auth Expo proxy. It works in Expo Go and in
  development builds.
- Session persistence in SecureStore, root auth redirects, sign-out, and a
  not-found screen.
- Arabic/English i18n with RTL handling, Uniwind design tokens, and the empty
  Markets tabs.
- Drizzle schema, initial migration, and generated OpenAPI types.

## Reuse checklist

1. Copy this branch into the new repository.
2. Change `name`, `slug`, `scheme`, and the Android/iOS bundle IDs in
   `apps/mobile/app.json`.
3. Use the same new scheme in `apps/mobile/src/lib/auth-client.ts` and in
   `TRUSTED_ORIGINS`.
4. Create a Postgres database, set `DATABASE_URL`, and run `bun run db:migrate`.
5. Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.
6. Create a **Web application** OAuth client in Google Cloud Console with
   `http://localhost:3000/api/auth/callback/google` as an authorized redirect
   URI, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. Copy `.env.example` to `.env` and to `apps/mobile/.env`.
8. Run `bun install`, `bun run db:up`, `bun run dev:api`, and
   `bun run dev:mobile`.
9. On the Android emulator, run `adb reverse tcp:3000 tcp:3000` so the OAuth
   callback and the API share `localhost`.

## Notes

- Expo Go uses `exp://<host>/--/` as the OAuth callback because it cannot handle
  the app's custom scheme. Development and release builds use the custom scheme.
- `bun run typecheck` and `bun run contracts:check` must pass before committing.
- The repo has a gitleaks pre-commit hook and a global pre-push scan; never
  commit `.env` files or credentials.
