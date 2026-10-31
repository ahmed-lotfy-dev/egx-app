import { cairoDate } from "./market";
import { tvHistory } from "./tradingview-history";

/**
 * On-demand intraday bars (5-minute), Thndr/Telda-style: fetched live when a
 * user opens the 1D chart and cached in-memory for a few minutes so repeated
 * views and polling clients do not hammer the upstream providers.
 */

export type IntradayBar = {
  /** Bar open time as ISO timestamp. */
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

const CACHE_TTL_MS = 4 * 60_000;
const MAX_BARS = 200;

type CacheEntry = {
  bars: IntradayBar[];
  fetchedAt: number;
  source: string;
};

const cache = new Map<string, CacheEntry>();

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Keep only the most recent Cairo session's bars — the 1D chart shows a single
 * trading day (like Telda/Thndr), and providers may return a few past sessions
 * within the requested bar count.
 */
function lastSessionBars(bars: IntradayBar[]): IntradayBar[] {
  const last = bars[bars.length - 1];

  if (!last) {
    return bars;
  }

  const lastDay = cairoDate(new Date(last.date));

  return bars.filter((bar) => cairoDate(new Date(bar.date)) === lastDay);
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
};

async function fetchYahooIntraday(
  yahooSymbol: string,
): Promise<IntradayBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=5m`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo intraday failed with ${response.status}`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const bars: IntradayBar[] = [];

  for (let i = 0; i < timestamps.length; i += 1) {
    const timestamp = timestamps[i];
    const close = num(quote?.close?.[i] ?? null);

    if (timestamp === undefined || close === null) {
      continue;
    }

    bars.push({
      date: new Date(timestamp * 1000).toISOString(),
      open: num(quote?.open?.[i]),
      high: num(quote?.high?.[i]),
      low: num(quote?.low?.[i]),
      close,
      volume: num(quote?.volume?.[i]),
    });
  }

  return bars.slice(-MAX_BARS);
}

async function fetchTradingViewIntraday(
  tvSymbol: string,
): Promise<IntradayBar[]> {
  const bars = await tvHistory(tvSymbol, "5", 150);

  return bars
    .map((bar) => ({
      date: new Date(bar[0] * 1000).toISOString(),
      open: bar[1],
      high: bar[2],
      low: bar[3],
      close: bar[4],
      volume: Number.isFinite(bar[5]) ? Math.round(bar[5]) : null,
    }))
    .slice(-MAX_BARS);
}

export type IntradayResult = {
  bars: IntradayBar[];
  source: string;
  asOf: string | null;
};

export async function getIntradayBars(options: {
  ticker: string;
  yahooSymbol: string | null;
  tvSymbol: string | null;
}): Promise<IntradayResult> {
  const { ticker } = options;
  const cached = cache.get(ticker);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      bars: cached.bars,
      source: cached.source,
      asOf: cached.bars[cached.bars.length - 1]?.date ?? null,
    };
  }

  let bars: IntradayBar[] = [];
  let source = "none";

  // TradingView first: it serves every EGX listing with a tvSymbol and its
  // websocket history is far more reliable than Yahoo's public chart endpoint.
  if (options.tvSymbol) {
    try {
      bars = lastSessionBars(await fetchTradingViewIntraday(options.tvSymbol));

      if (bars.length > 0) {
        source = "tradingview";
      }
    } catch {
      // Fall through to Yahoo.
    }
  }

  if (bars.length === 0 && options.yahooSymbol) {
    try {
      bars = lastSessionBars(await fetchYahooIntraday(options.yahooSymbol));

      if (bars.length > 0) {
        source = "yahoo";
      }
    } catch {
      // No intraday data available from either provider.
    }
  }

  if (bars.length > 0) {
    cache.set(ticker, { bars, fetchedAt: Date.now(), source });
  } else if (cached) {
    // Upstream failed — serve the previous data rather than nothing.
    return {
      bars: cached.bars,
      source: cached.source,
      asOf: cached.bars[cached.bars.length - 1]?.date ?? null,
    };
  }

  return {
    bars,
    source,
    asOf: bars[bars.length - 1]?.date ?? null,
  };
}
