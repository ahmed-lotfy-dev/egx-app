# AI Market Assistant (المساعد)

## Overview

**Feature:** Grounded market assistant — chat about any EGX stock or the whole market.
**Status:** ✅ Shipped
**Branch:** `feat/m3-stock-detail`
**Commits:** `b232248` (chat + endpoint), deploy via local image build (GHCR pulls starved the box).

Replaces the old "قريبًا" teasers (AI tab placeholder + stock-detail AI sheet) with a
real assistant. Every answer is grounded in the app's own database — the model is
instructed to never invent numbers.

## Architecture

```
Mobile chat tab ──POST /api/ai/chat──► API route
                                        ├─ buildTickerContext(ticker)   ← same tables as the app
                                        ├─ buildMarketContext()         ← EGX30/breadth/movers/macro
                                        └─ NVIDIA NIM (nemotron-3-ultra)→ answer
```

- **Provider:** NVIDIA NIM (`integrate.api.nvidia.com/v1`), model
  `nvidia/nemotron-3-ultra-550b-a55b`. Same `NVIDIA_API_KEY` the worker's news
  analyzer uses (shared server `.env`).
- **Stateless:** the client sends the whole conversation each request; the server
  keeps no chat history.
- **Grounding snapshot injected into the system prompt:**
  - With a ticker: quote (price/change/asOf/source), last 10 closes, 52w + 20d
    highs/lows, avg volume 20d, floor-trader pivot levels (S1–S3/R1–R3),
    fundamentals (PE/PB/EPS/ROE/yield/margin), 5 newest linked news items.
  - Without a ticker: EGX30 level/change, market breadth (advancers/decliners),
    top 5 gainers + losers, macro strip (USD/EGP, Brent, WTI, gold).
- **Prompt rules:** reply in the request locale, ground every number in the
  MARKET DATA block, respect the ~15–20 min delayed EGX feed, ≤ ~180 words,
  explain concepts (P/E, supports) freely, never give instructions to trade,
  and end every answer with a "not investment advice" line.

## API — `POST /api/ai/chat`

Request (`AiChatRequestSchema` in `packages/contracts/src/ai.ts`):

```json
{
  "messages": [{ "role": "user", "content": "..." }],  // 1–24, oldest first, last must be user
  "ticker": "COMI",          // optional — grounds the thread on one instrument
  "locale": "ar"             // "ar" | "en"
}
```

Response: `data.message` (assistant reply) + `data.groundedTicker` + `meta.model`,
`meta.grounded`.

Guards:
- 12 requests/min per IP (in-memory sliding window) → `429`.
- Unknown ticker → the model is told to say so (no hallucinated listing) → `200`.
- NIM timeout 60s / empty answer / missing key → `503`.
- Message history capped at last 12 messages, 2000 chars each.

Files: `apps/api/src/routes/ai.ts`, `apps/api/src/lib/ai-context.ts`,
`apps/api/src/lib/nim.ts`, `apps/api/src/config/env.ts` (`NVIDIA_API_KEY`,
`NVIDIA_NIM_MODEL` — both optional).

## Mobile

- **AI tab** (`apps/mobile/src/app/(app)/(tabs)/ai/index.tsx`): chat bubbles
  (gold = user, surface = assistant), suggestion chips (market-wide vs
  ticker-scoped), typing indicator, inline error banner with retry, "new chat"
  (+) button, ticker context chip — clearing it switches to market-wide without
  losing the scroll.
- **Thread scoping:** a thread is reset whenever the grounding context changes.
  Opening the tab with `ticker` (+ optional `q`) starts a fresh thread and
  auto-sends `q`.
- **Stock detail** (`stock/[ticker].tsx`): the AI card opens the bottom sheet;
  each of the five data rows (quote / chart / levels / fundamentals / news) now
  navigates to the chat with that question prefilled and auto-sent; the CTA
  "اسأل المساعد عن {ticker}" opens the chat without a preset question.
  "قريبًا" badges removed.
- Markdown `**` markers from NIM replies are stripped (app renders plain text).

## Ops notes

- The server box (954MB micro) thrashes when several GHCR pulls run at once —
  deploy workflows timed out twice at 20m. Workaround used: build locally
  (`.dockerignore` added so host `node_modules` doesn't poison the context),
  `docker save | gzip` → scp → `docker load` → `docker compose up -d egx-api`.
  Consider raising `command_timeout` in both deploy workflows.
- NIM latency observed: ~3–10s per answer.

## Grounding (EGX only)

- **Two-pass grounding:** (1) exact ticker → `resolveMentionedTicker`; (2) when no
  exact match, normalized Arabic/English name search over EGX instruments →
  catalog injection (`buildCatalog`) → final `[[GROUND:TICKER]]` re-ground before
  the response. No inventing of numbers.
- **Verified:** `سهم كوره` → KORA after the Arabic-name backfill.
- **Provider:** NVIDIA NIM (`integrate.api.nvidia.com/v1`, model
  `nvidia/nemotron-3-ultra-550b-a55b`) with the shared `NVIDIA_API_KEY`; chat uses
  `apps/api/src/routes/ai.ts` → `lib/nim.ts` + `lib/ai-context.ts`.
- **Scope:** EGX only. Saudi and international instruments were removed on
  2026-11-03; the catalog and entity resolution only see EGX rows.

## Prod ops notes

- Deploy = `docker save` → scp → `docker load` → `docker compose up -d egx-api egx-worker` (image tags pinned in compose). Box is a 954MB micro; GHCR pulls thrashed the box previously — local build + image transfer is the working path.
- Env vars (`NVIDIA_API_KEY`, `NVIDIA_NIM_MODEL`) live on the server `.env` as shared constants; `apps/api/src/config/env.ts` reads them optionally (without failing if absent in dev).
