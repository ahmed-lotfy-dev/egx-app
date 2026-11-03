# Ingest Scheduler (auto-updating prices & data)

## 1. What

A long-running worker (`apps/worker/src/scheduler.ts`, `bun src/cli.ts schedule`) deployed as the `egx-worker` container on the OCI server next to `egx-api`. All times are Africa/Cairo.

| Job | Schedule | Source |
|---|---|---|
| quotes | every **3 min** during EGX market hours (Sun–Thu 09:30–15:00), every 30 min off-hours | TradingView scanner (one request covers all instruments) |
| universe + yahoo symbols | daily 08:30 | TradingView scan |
| bars | daily 15:15 (after close) | Yahoo first, TradingView websocket fallback |
| fundamentals | daily 04:30 | TradingView scan |
| news sync | every 30 min | Egypt sources (Arab Finance, Egyptian outlets) |
| news AI analysis | every 20 min, batch 25 | NVIDIA NIM (small batches to respect rate limits) |

Each job has an overlap guard (a still-running job skips its tick), and every run is logged with duration.

## 2. Why

Prices, bars and news previously only refreshed when the worker was run manually — the app showed stale quotes and KORA-style one-bar charts. The user asked for continuous price updates and confirmed a ~25-minute delay is acceptable.

**Note on delay:** TradingView's EGX feed is inherently delayed (~15–20 min) because EGX charges for real-time data — so quotes are at most one 3-minute cycle behind TV, plus TV's own exchange delay.

## 3. TradingView limits (question that drove this)

- There is **no official public API and no published rate limit** — these are unofficial endpoints.
- Practically, TV throttles per-IP (HTTP 429 / dropped connections) when hammered. Our volume is tiny: 1 scan request per quotes cycle (~20/hour in market hours), one websocket connection per ticker for history (255 took ~8 minutes with 2 workers, zero throttling).
- `fetchWithRetry` already backs off on failures. If TV ever blocks harder, the quotes cadence (3 min) can be relaxed without app changes.

## 4. Deployment

- `apps/worker/Dockerfile` → `ghcr.io/ahmed-lotfy-dev/egx-worker:latest` via `.github/workflows/deploy-worker.yml` (same SSH deploy pattern as the API).
- Server: `~/apps/egx-api/docker-compose.yml` has an `egx-worker` service (`env_file: .env`, `apps-net` network, 300m mem limit). `.env` carries `DATABASE_URL`, `NVIDIA_API_KEY`, `NVIDIA_NIM_MODEL`.
- Deploy: push → CI builds → `docker compose up -d egx-worker` (the workflow does it automatically).

## 5. Bars data policy

- The bars job covers **all** active stock/index instruments with a `tv_symbol` or `yahoo_symbol` (TV-only tickers no longer require a Yahoo symbol).
- Yahoo first; TradingView fallback whenever Yahoo fails or returns <2 bars.
- Bars sourced from TV **fully replace** that instrument's stored rows first — TV prices are split-adjusted while Yahoo's are raw, so a single chart never mixes sources.
- One-off full TV pass (2026-10-31): 255 instruments, ~148k bars; ~32 suspended listings have no chart history on TV (or Yahoo) and stay on the app's "insufficient history" state.

## 6. Testing

- [x] Local smoke test: scheduler tick fires quotes/fundamentals/news immediately
- [x] Prod: `egx-worker` container running, quotes `as_of` updates on schedule
- [x] `bun run typecheck` green
