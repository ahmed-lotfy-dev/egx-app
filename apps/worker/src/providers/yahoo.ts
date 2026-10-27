import { cairoDate } from "@egx/api/market";

import { fetchWithRetry, sleep } from "../lib/http";
import type {
  DailyBarRecord,
  InstrumentRef,
  InstrumentSeed,
  MarketDataProvider,
  QuoteRecord,
} from "./types";

const COOKIE_URL = "https://fc.yahoo.com";
const CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// Yahoo returns 429 for non-browser user agents on the public chart endpoint.
// This is provider-specific; every other outbound request uses the app UA.
const YAHOO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

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
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }> | null;
    error?: { code?: string; description?: string } | null;
  };
};

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function cookiePairs(header: string | null): string[] {
  if (!header) {
    return [];
  }

  return header
    .split(/,(?=\s*[^;=]+=)/)
    .map((part) => part.split(";")[0]?.trim() ?? "")
    .filter(Boolean);
}

function setCookies(response: Response): string[] {
  const withGetSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values = withGetSetCookie.getSetCookie?.();

  return values?.length
    ? values.map((value) => value.split(";")[0]?.trim() ?? "")
    : cookiePairs(response.headers.get("set-cookie"));
}

function rangeForDays(days: number): string {
  if (days <= 7) return "5d";
  if (days <= 35) return "1mo";
  if (days <= 100) return "3mo";
  if (days <= 200) return "6mo";
  return "1y";
}

const NAME_STOPWORDS = new Set([
  "a",
  "al",
  "an",
  "and",
  "co",
  "company",
  "egp",
  "egp10",
  "egp100",
  "egp5",
  "el",
  "for",
  "of",
  "sa",
  "sae",
  "the",
]);

/** Significant name tokens, used to score Yahoo search candidates. */
function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !NAME_STOPWORDS.has(token));
}

/**
 * Yahoo search matches short names better than full legal names. Try the full
 * name first, then progressively shorter forms, and finally the ticker.
 */
function searchVariants(name: string, ticker: string): string[] {
  const base = name.split(" - ")[0]?.trim() ?? name;
  const tokens = nameTokens(base);
  const variants = [name, base];

  if (tokens.length > 2) {
    variants.push(tokens.slice(0, 3).join(" "));
  }

  if (tokens.length > 1) {
    variants.push(tokens.slice(0, 2).join(" "));
  }

  variants.push(ticker);

  return [...new Set(variants.map((variant) => variant.trim()).filter(Boolean))];
}

function validateBar(
  ticker: string,
  bar: {
    date: string;
    high: number;
    low: number;
    close: number;
    volume: number | null;
  },
): void {
  // Yahoo mixes 2-decimal ticks with float32 prices, so allow a small rounding
  // tolerance. Open is handled separately: Yahoo reports the previous close as
  // open, so it is only stored when it falls inside the day's range.
  const epsilon = 0.02;
  const invalidRange = bar.high + epsilon < bar.low;
  const invalidClose =
    bar.close < bar.low - epsilon || bar.close > bar.high + epsilon;
  const invalidVolume = bar.volume !== null && bar.volume < 0;

  if (invalidRange || invalidClose || invalidVolume) {
    throw new Error(`Invalid bar for ${ticker} on ${bar.date}`);
  }
}

export class YahooProvider implements MarketDataProvider {
  readonly name = "yahoo";

  private cookie: string | null = null;
  private crumb: string | null = null;
  private authPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    await this.ensureAuth();
  }

  async resolveSymbol(name: string, ticker: string): Promise<string | null> {
    const target = nameTokens(name);
    let best: { symbol: string; score: number } | null = null;

    for (const query of searchVariants(name, ticker)) {
      const quotes = await this.searchQuotes(query);

      for (const quote of quotes) {
        if (!quote.symbol) {
          continue;
        }

        if (quote.exchange !== "CAI" && !quote.symbol.endsWith(".CA")) {
          continue;
        }

        const candidate = nameTokens(
          quote.shortname ?? quote.longname ?? "",
        );
        const score = candidate.filter((token) =>
          target.includes(token),
        ).length;

        if (score > 0 && (!best || score > best.score)) {
          best = { symbol: quote.symbol, score };
        }
      }

      if (best && best.score >= Math.min(2, target.length)) {
        break;
      }

      await sleep(250);
    }

    return best?.symbol ?? null;
  }

  private async searchQuotes(query: string): Promise<
    Array<{
      symbol?: string;
      exchange?: string;
      shortname?: string;
      longname?: string;
    }>
  > {
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", query);
    url.searchParams.set("quotesCount", "20");
    url.searchParams.set("newsCount", "0");

    const response = await fetchWithRetry(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": YAHOO_USER_AGENT,
        },
      },
      { retries: 3, baseDelayMs: 1000 },
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      quotes?: Array<{
        symbol?: string;
        exchange?: string;
        shortname?: string;
        longname?: string;
      }>;
    };

    return payload.quotes ?? [];
  }

  private async ensureAuth(force = false): Promise<void> {
    if (!force && this.cookie && this.crumb) {
      return;
    }

    if (!force && this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = this.authenticate(force).finally(() => {
      this.authPromise = null;
    });

    return this.authPromise;
  }

  private async authenticate(force: boolean): Promise<void> {
    if (force) {
      this.cookie = null;
      this.crumb = null;
    }

    const cookieResponse = await fetchWithRetry(
      COOKIE_URL,
      {
        redirect: "manual",
        headers: { "User-Agent": YAHOO_USER_AGENT },
      },
      { retries: 2 },
    );
    const a3 = setCookies(cookieResponse).find((cookie) =>
      cookie.startsWith("A3="),
    );

    if (!a3) {
      throw new Error(
        `Yahoo cookie flow failed with ${cookieResponse.status}; no A3 cookie`,
      );
    }

    const crumbResponse = await fetchWithRetry(
      CRUMB_URL,
      {
        headers: {
          "User-Agent": YAHOO_USER_AGENT,
          Cookie: a3,
        },
      },
      { retries: 5, baseDelayMs: 1500 },
    );

    if (!crumbResponse.ok) {
      throw new Error(
        `Yahoo crumb request failed with ${crumbResponse.status}`,
      );
    }

    const crumb = (await crumbResponse.text()).trim();

    if (!crumb || crumb.startsWith("{") || crumb.length > 40) {
      throw new Error("Yahoo returned an invalid crumb");
    }

    this.cookie = a3;
    this.crumb = crumb;
  }

  private chartRequest(symbol: string, range: string): Promise<Response> {
    const url = new URL(`${CHART_URL}/${encodeURIComponent(symbol)}`);
    url.searchParams.set("range", range);
    url.searchParams.set("interval", "1d");
    url.searchParams.set("events", "div,splits");

    if (this.crumb) {
      url.searchParams.set("crumb", this.crumb);
    }

    return fetchWithRetry(
      url,
      {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: this.cookie ?? "",
          Referer: "https://finance.yahoo.com/",
          "User-Agent": YAHOO_USER_AGENT,
        },
      },
      { retries: 4, baseDelayMs: 1000 },
    );
  }

  async fetchDailyBars(
    instrument: InstrumentRef,
    days: number,
  ): Promise<DailyBarRecord[]> {
    if (!instrument.yahooSymbol) {
      throw new Error(`No Yahoo symbol for ${instrument.ticker}`);
    }

    await this.ensureAuth();
    const range = rangeForDays(days);
    let response = await this.chartRequest(instrument.yahooSymbol, range);

    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 429
    ) {
      await this.ensureAuth(true);
      response = await this.chartRequest(instrument.yahooSymbol, range);
    }

    if (!response.ok) {
      throw new Error(
        `Yahoo chart failed for ${instrument.ticker} with ${response.status}`,
      );
    }

    const payload = (await response.json()) as YahooChartResponse;
    const result = payload.chart?.result?.[0];

    if (!result) {
      throw new Error(
        payload.chart?.error?.description ??
          `Yahoo returned no chart for ${instrument.ticker}`,
      );
    }

    const timestamps = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
    const bars: DailyBarRecord[] = [];
    const seen = new Set<string>();
    let skipped = 0;

    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = timestamps[index];

      if (timestamp === undefined) {
        continue;
      }

      const open = num(quote.open?.[index]);
      const high = num(quote.high?.[index]);
      const low = num(quote.low?.[index]);
      const close = num(quote.close?.[index]);

      if (open === null || high === null || low === null || close === null) {
        continue;
      }

      // Yahoo emits an all-zero placeholder for the current session before it
      // has traded. Only completed, priced bars belong in the history table.
      if (close <= 0 || high <= 0 || low <= 0) {
        continue;
      }

      const date = cairoDate(new Date(timestamp * 1000));

      if (seen.has(date)) {
        continue;
      }

      const volume = num(quote.volume?.[index]);

      try {
        validateBar(instrument.ticker, { date, high, low, close, volume });
      } catch {
        // A single bad day should not discard an otherwise usable year of
        // history. Skip it and report the count below.
        skipped += 1;
        continue;
      }

      const adjClose = num(adjusted[index]);
      const reliableOpen =
        open >= low - 0.02 && open <= high + 0.02 ? open : null;

      bars.push({
        date,
        open: reliableOpen,
        high,
        low,
        close,
        adjClose,
        volume: volume === null ? 0 : Math.trunc(volume),
        priceBasis: adjClose === null ? "raw" : "adjusted",
        source: this.name,
        raw: {
          timestamp,
          open,
          high,
          low,
          close,
          adjclose: adjClose,
          volume,
          openIsPreviousClose: reliableOpen === null,
        },
      });
      seen.add(date);
    }

    if (bars.length === 0) {
      throw new Error(`Yahoo returned no usable bars for ${instrument.ticker}`);
    }

    if (skipped > 0) {
      console.warn(
        `  yahoo: skipped ${skipped} invalid bar(s) for ${instrument.ticker}`,
      );
    }

    if (bars.some((bar) => bar.adjClose === null)) {
      for (const bar of bars) {
        bar.adjClose = null;
        bar.priceBasis = "raw";
      }
    }

    return bars.sort((a, b) => a.date.localeCompare(b.date));
  }

  fetchUniverse(): Promise<InstrumentSeed[]> {
    throw new Error("Yahoo does not provide the EGX universe");
  }

  fetchQuotes(_instruments: InstrumentRef[]): Promise<QuoteRecord[]> {
    throw new Error(
      "Yahoo quotes are stale for EGX; quotes come from TradingView",
    );
  }
}
