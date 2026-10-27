import type { InstrumentSummary, Quote } from "@egx/contracts";

const CAIRO_TZ = "Africa/Cairo";
const OPEN_MINUTES = 10 * 60;
const CLOSE_MINUTES = 14 * 60 + 30;
const QUOTE_STALE_MS = 15 * 60 * 1000;
const CLOSED_STALE_MS = 24 * 60 * 60 * 1000;

export type MarketSession = "pre" | "open" | "closed";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const cairoClock = new Intl.DateTimeFormat("en-US", {
  timeZone: CAIRO_TZ,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const cairoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function cairoParts(now: Date) {
  const parts = cairoClock.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Fri";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );

  return {
    weekday: WEEKDAY_INDEX[weekday] ?? 5,
    minutes: hour * 60 + minute,
  };
}

/**
 * EGX trades Sunday through Thursday, 10:00 to 14:30 Cairo time. Public
 * holidays are not modelled yet; they will move into a market calendar module
 * with the scheduled worker.
 */
export function sessionState(now = new Date()): MarketSession {
  const { weekday, minutes } = cairoParts(now);

  if (weekday > 4) {
    return "closed";
  }

  if (minutes < OPEN_MINUTES) {
    return "pre";
  }

  if (minutes <= CLOSE_MINUTES) {
    return "open";
  }

  return "closed";
}

export function quoteIsStale(asOf: Date | null, now = new Date()): boolean {
  if (!asOf) {
    return true;
  }

  const age = Math.max(0, now.getTime() - asOf.getTime());

  return sessionState(now) === "open"
    ? age > QUOTE_STALE_MS
    : age > CLOSED_STALE_MS;
}

export function jobIsStale(
  job: string,
  finishedAt: Date | null,
  now = new Date(),
): boolean {
  if (!finishedAt) {
    return true;
  }

  if (job === "quotes") {
    return quoteIsStale(finishedAt, now);
  }

  return now.getTime() - finishedAt.getTime() > 48 * 60 * 60 * 1000;
}

/** Returns the Cairo trading date as YYYY-MM-DD. */
export function cairoDate(date: Date): string {
  return cairoDay.format(date);
}

export function numberOrNull(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export type MarketRow = {
  ticker: string;
  nameEn: string;
  nameAr: string | null;
  sector: string | null;
  industry: string | null;
  kind: string;
  currency: string;
  updatedAt: Date;
  price: string | null;
  change: string | null;
  changePct: string | null;
  volume: number | null;
  marketCap: string | null;
  quoteCurrency: string | null;
  quoteSource: string | null;
  quoteAsOf: Date | null;
};

export function mapQuote(row: MarketRow, now = new Date()): Quote | null {
  if (!row.quoteAsOf) {
    return null;
  }

  return {
    price: numberOrNull(row.price),
    change: numberOrNull(row.change),
    changePct: numberOrNull(row.changePct),
    volume: row.volume,
    marketCap: numberOrNull(row.marketCap),
    currency: row.quoteCurrency ?? row.currency,
    asOf: row.quoteAsOf.toISOString(),
    source: row.quoteSource,
    stale: quoteIsStale(row.quoteAsOf, now),
  };
}

export function toInstrumentSummary(
  row: MarketRow,
  now = new Date(),
): InstrumentSummary {
  return {
    ticker: row.ticker,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    sector: row.sector,
    industry: row.industry,
    kind: row.kind === "index" ? "index" : "stock",
    currency: row.currency,
    quote: mapQuote(row, now),
  };
}

export function latestQuoteAsOf(rows: MarketRow[]): Date | null {
  let latest: Date | null = null;

  for (const row of rows) {
    if (row.quoteAsOf && (!latest || row.quoteAsOf > latest)) {
      latest = row.quoteAsOf;
    }
  }

  return latest;
}

export function latestUniverseAsOf(rows: MarketRow[]): Date | null {
  let latest: Date | null = null;

  for (const row of rows) {
    if (!latest || row.updatedAt > latest) {
      latest = row.updatedAt;
    }
  }

  return latest;
}
