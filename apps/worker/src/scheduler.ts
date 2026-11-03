import { closeDb } from "@egx/api/db";

import { syncMacro } from "./jobs/macro";
import { syncBars } from "./jobs/bars";
import { syncFundamentals } from "./jobs/fundamentals";
import { processAnalysisQueue, syncNews } from "./jobs/news";
import { syncQuotes } from "./jobs/quotes";
import { syncUniverse } from "./jobs/universe";
import { resolveYahooSymbols } from "./jobs/yahoo-symbols";

/**
 * Long-running scheduler for the ingest jobs. Intervals (Africa/Cairo):
 *
 * - quotes: every 3 min during EGX market hours (Sun–Thu 09:30–15:00),
 *   every 30 min otherwise. One scanner request covers all instruments;
 *   TradingView's EGX feed is delayed ~15–20 min by the exchange itself.
 * - macro (USD/EGP, oil, gold): every minute. USD/EGP comes from a live FX
 *   feed (fxratesapi, jsDelivr fallback); oil/metal quotes from one TV scan.
 * - universe + yahoo symbols: daily 08:30 (before the session).
 * - bars: daily 15:15 (after the close) — Yahoo first, TradingView fallback.
 * - fundamentals: daily 04:30.
 * - news sync: every 30 min; AI analysis queue: every 20 min (small batches
 *   to stay under the NVIDIA NIM rate limit).
 */

const MARKET_OPEN_MINUTES = 9 * 60 + 30; // 09:30
const MARKET_CLOSE_MINUTES = 15 * 60; // 15:00
const TRADING_DAYS = new Set(["Sun", "Mon", "Tue", "Wed", "Thu"]);

const QUOTES_INTERVAL_MARKET_MS = 3 * 60_000;
const QUOTES_INTERVAL_OFF_MS = 30 * 60_000;
// FX (USD/EGP) and metals track the market closely; one scan + one FX request
// per minute stays cheap for the micro instance.
const MACRO_INTERVAL_MS = 60_000;
const NEWS_INTERVAL_MS = 30 * 60_000;
const ANALYSIS_INTERVAL_MS = 20 * 60_000;
const TICK_MS = 60_000;

type CairoTime = {
  weekday: string;
  minutes: number;
  dateKey: string;
};

const cairoFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function cairoTime(now: Date): CairoTime {
  const parts = cairoFormatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return {
    weekday: get("weekday"),
    minutes: hour * 60 + minute,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function isMarketTime(time: CairoTime): boolean {
  return (
    TRADING_DAYS.has(time.weekday) &&
    time.minutes >= MARKET_OPEN_MINUTES &&
    time.minutes <= MARKET_CLOSE_MINUTES
  );
}

const state = {
  lastQuotesAt: 0,
  lastMacroAt: 0,
  lastNewsAt: 0,
  lastAnalysisAt: 0,
  lastUniverseDate: "",
  lastBarsDate: "",
  lastFundamentalsDate: "",
  running: new Set<string>(),
};

async function runJob(name: string, job: () => Promise<unknown>) {
  if (state.running.has(name)) {
    console.log(`[scheduler] ${name} still running, skipping tick`);
    return;
  }

  state.running.add(name);
  const startedAt = Date.now();

  try {
    await job();
    console.log(
      `[scheduler] ${name} ok in ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
  } catch (error) {
    console.error(
      `[scheduler] ${name} failed:`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    state.running.delete(name);
  }
}

/**
 * Heavy ingest jobs run one at a time.
 *
 * The worker shares a 1 GB box with the API and other apps; running the
 * quotes, news and analysis jobs concurrently pushed the load average past
 * 10 and made API requests take 40–90 s. `macro` stays outside this queue
 * because it is one small request per minute and the user expects the
 * dollar rate to keep moving.
 */
let heavyQueue: Promise<unknown> = Promise.resolve();

function runHeavyJob(name: string, job: () => Promise<unknown>): void {
  heavyQueue = heavyQueue
    .then(() => runJob(name, job))
    .catch((error) => {
      console.error(
        `[scheduler] ${name} queue error:`,
        error instanceof Error ? error.message : error,
      );
    });
}

async function tick(now: Date): Promise<void> {
  const time = cairoTime(now);
  const market = isMarketTime(time);

  // Quotes — the hot path for live prices.
  const quotesInterval = market
    ? QUOTES_INTERVAL_MARKET_MS
    : QUOTES_INTERVAL_OFF_MS;

  if (Date.now() - state.lastQuotesAt >= quotesInterval) {
    state.lastQuotesAt = Date.now();
    runHeavyJob("quotes", syncQuotes);
  }

  // Macro indicators (USD/EGP, oil, gold) — refresh around the clock.
  if (Date.now() - state.lastMacroAt >= MACRO_INTERVAL_MS) {
    state.lastMacroAt = Date.now();
    void runJob("macro", syncMacro);
  }

  // News + AI analysis around the clock, in small batches.
  if (Date.now() - state.lastNewsAt >= NEWS_INTERVAL_MS) {
    state.lastNewsAt = Date.now();
    runHeavyJob("news", syncNews);
  }

  if (Date.now() - state.lastAnalysisAt >= ANALYSIS_INTERVAL_MS) {
    state.lastAnalysisAt = Date.now();
    runHeavyJob("news:analyze", () => processAnalysisQueue(15));
  }

  // Once-daily jobs.
  if (TRADING_DAYS.has(time.weekday)) {
    if (
      time.minutes >= 8 * 60 + 30 &&
      state.lastUniverseDate !== time.dateKey
    ) {
      state.lastUniverseDate = time.dateKey;
      runHeavyJob("universe", async () => {
        await syncUniverse();
        await resolveYahooSymbols();
      });
    }

    if (time.minutes >= 15 * 60 + 15 && state.lastBarsDate !== time.dateKey) {
      state.lastBarsDate = time.dateKey;
      runHeavyJob("bars", () => syncBars({ days: 400 }));
    }
  }

  if (time.minutes >= 4 * 60 + 30 && state.lastFundamentalsDate !== time.dateKey) {
    state.lastFundamentalsDate = time.dateKey;
    runHeavyJob("fundamentals", syncFundamentals);
  }

  if (!market) {
    console.log(
      `[scheduler] tick ${time.dateKey} ${time.weekday} ${Math.floor(time.minutes / 60)}:${String(time.minutes % 60).padStart(2, "0")} Cairo (market closed)`,
    );
  }
}

export function startScheduler(): void {
  console.log("[scheduler] started (Africa/Cairo) — Ctrl+C to stop");

  // Refresh quotes immediately on boot so the app has fresh prices.
  state.lastQuotesAt = 0;

  const timer = setInterval(() => {
    void tick(new Date());
  }, TICK_MS);

  const shutdown = () => {
    clearInterval(timer);
    console.log("[scheduler] shutting down");
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  void tick(new Date());
}
