import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorResponseSchema,
  InstrumentHistoryResponseSchema,
} from "@egx/contracts";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client";
import { dailyBars, instruments } from "../db/schema";
import { getIntradayBars } from "../lib/intraday";
import {
  computeHistoryStats,
  computeSupportResistance,
  type BarForLevels,
} from "../lib/levels";
import { cairoDate, numberOrNull } from "../lib/market";

const RANGE_DAYS = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
} as const;

const historyRoute = createRoute({
  method: "get",
  path: "/api/instruments/{ticker}/history",
  tags: ["market"],
  summary: "Daily bars, range stats, and support/resistance levels",
  request: {
    params: z.object({
      ticker: z.string().trim().min(1).max(20),
    }),
    query: z.object({
      range: z.enum(["1D", "1W", "1M", "3M", "6M", "1Y"]).default("1D"),
    }),
  },
  responses: {
    200: {
      description: "Instrument history",
      content: {
        "application/json": {
          schema: InstrumentHistoryResponseSchema,
        },
      },
    },
    404: {
      description: "Instrument not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export const instrumentHistoryRoutes = new OpenAPIHono();

instrumentHistoryRoutes.openapi(historyRoute, async (c) => {
  const { ticker } = c.req.valid("param");
  const { range } = c.req.valid("query");

  const [instrument] = await db
    .select({
      id: instruments.id,
      ticker: instruments.ticker,
      tvSymbol: instruments.tvSymbol,
      yahooSymbol: instruments.yahooSymbol,
      updatedAt: instruments.updatedAt,
    })
    .from(instruments)
    .where(eq(instruments.ticker, ticker.toUpperCase()))
    .limit(1);

  if (!instrument) {
    return c.json(
      {
        error: {
          code: "INSTRUMENT_NOT_FOUND",
          message: `No instrument matches ${ticker}`,
        },
      },
      404,
    );
  }

  const rows = await db
    .select({
      date: dailyBars.date,
      open: dailyBars.open,
      high: dailyBars.high,
      low: dailyBars.low,
      close: dailyBars.close,
      adjClose: dailyBars.adjClose,
      volume: dailyBars.volume,
      priceBasis: dailyBars.priceBasis,
      source: dailyBars.source,
    })
    .from(dailyBars)
    .where(eq(dailyBars.instrumentId, instrument.id))
    .orderBy(asc(dailyBars.date));

  const allBars: BarForLevels[] = rows.map((row) => ({
    date: row.date,
    high: numberOrNull(row.high),
    low: numberOrNull(row.low),
    close: numberOrNull(row.close),
    volume: row.volume,
  }));

  // 1D = live intraday (5-minute bars), fetched on demand with a short cache.
  if (range === "1D") {
    const intraday = await getIntradayBars({
      ticker: instrument.ticker,
      yahooSymbol: instrument.yahooSymbol,
      tvSymbol: instrument.tvSymbol,
    });
    const lastIntraday = intraday.bars[intraday.bars.length - 1] ?? null;
    const lastIntradayMs = lastIntraday
      ? new Date(lastIntraday.date).getTime()
      : null;
    // Intraday is stale when the session data is older than ~30 minutes
    // (provider outage) or missing entirely.
    const stale =
      lastIntradayMs === null ||
      Date.now() - lastIntradayMs > 30 * 60_000;

    return c.json(
      {
        data: intraday.bars.map((bar) => ({
          date: bar.date,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          adjClose: null,
          volume: bar.volume,
        })),
        stats: computeHistoryStats(allBars, 0),
        levels: computeSupportResistance(allBars),
        meta: {
          asOf: intraday.asOf,
          source: intraday.source,
          stale,
          universeAsOf: instrument.updatedAt.toISOString(),
        },
      },
      200,
    );
  }

  const cutoff = cairoDate(
    new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000),
  );
  const rangeRows = rows.filter((row) => row.date >= cutoff);
  const lastRow = rows[rows.length - 1];
  const lastDate = lastRow?.date ?? null;
  const lastBarTime = lastDate
    ? new Date(`${lastDate}T00:00:00Z`).getTime()
    : null;
  const stale =
    lastBarTime === null ||
    Date.now() - lastBarTime > 5 * 24 * 60 * 60 * 1000;

  return c.json(
    {
      data: rangeRows.map((row) => ({
        date: row.date,
        open: numberOrNull(row.open),
        high: numberOrNull(row.high),
        low: numberOrNull(row.low),
        close: numberOrNull(row.close),
        adjClose: numberOrNull(row.adjClose),
        volume: row.volume,
      })),
      stats: computeHistoryStats(allBars, rangeRows.length),
      levels: computeSupportResistance(allBars),
      meta: {
        asOf: lastDate ? `${lastDate}T12:00:00.000Z` : null,
        source: lastRow?.source ?? "none",
        stale,
        universeAsOf: instrument.updatedAt.toISOString(),
      },
    },
    200,
  );
});
