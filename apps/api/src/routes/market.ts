import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { MarketOverviewResponseSchema } from "@egx/contracts";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "../db/client";
import { dailyBars, instruments, latestQuotes } from "../db/schema";
import { marketColumns } from "../db/selects";
import {
  latestQuoteAsOf,
  latestUniverseAsOf,
  numberOrNull,
  quoteIsStale,
  toInstrumentSummary,
} from "../lib/market";

const overviewRoute = createRoute({
  method: "get",
  path: "/api/market/overview",
  tags: ["market"],
  summary: "Market index, breadth, movers, and sector performance",
  responses: {
    200: {
      description: "Market overview",
      content: {
        "application/json": {
          schema: MarketOverviewResponseSchema,
        },
      },
    },
  },
});

export const marketRoutes = new OpenAPIHono();

marketRoutes.openapi(overviewRoute, async (c) => {
  const rows = await db
    .select(marketColumns)
    .from(instruments)
    .leftJoin(latestQuotes, eq(latestQuotes.instrumentId, instruments.id))
    .where(and(eq(instruments.isActive, true)))
    .orderBy(asc(instruments.ticker));

  const now = new Date();
  const stockRows = rows.filter((row) => row.kind !== "index");
  const indexRows = rows.filter((row) => row.kind === "index");
  const stocks = stockRows.map((row) => toInstrumentSummary(row, now));

  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;

  for (const stock of stocks) {
    const changePct = stock.quote?.changePct;

    if (changePct === null || changePct === undefined) {
      continue;
    }

    if (changePct > 0) {
      advancers += 1;
    } else if (changePct < 0) {
      decliners += 1;
    } else {
      unchanged += 1;
    }
  }

  const ranked = stocks.filter(
    (stock) =>
      stock.quote?.changePct !== null && stock.quote?.changePct !== undefined,
  );
  const gainers = [...ranked]
    .sort(
      (a, b) => (b.quote?.changePct ?? 0) - (a.quote?.changePct ?? 0),
    )
    .slice(0, 5);
  const losers = [...ranked]
    .sort(
      (a, b) => (a.quote?.changePct ?? 0) - (b.quote?.changePct ?? 0),
    )
    .slice(0, 5);

  const sectorMap = new Map<
    string,
    {
      sum: number;
      quoted: number;
      total: number;
      advancers: number;
      decliners: number;
    }
  >();

  for (const stock of stocks) {
    const sector = stock.sector ?? "Other";
    const entry = sectorMap.get(sector) ?? {
      sum: 0,
      quoted: 0,
      total: 0,
      advancers: 0,
      decliners: 0,
    };
    const changePct = stock.quote?.changePct;

    entry.total += 1;

    if (changePct !== null && changePct !== undefined) {
      entry.sum += changePct;
      entry.quoted += 1;

      if (changePct > 0) {
        entry.advancers += 1;
      } else if (changePct < 0) {
        entry.decliners += 1;
      }
    }

    sectorMap.set(sector, entry);
  }

  const sectors = [...sectorMap.entries()]
    .map(([sector, entry]) => ({
      sector,
      changePct:
        entry.quoted > 0
          ? Number((entry.sum / entry.quoted).toFixed(4))
          : null,
      advancers: entry.advancers,
      decliners: entry.decliners,
      count: entry.total,
    }))
    .sort((a, b) => {
      if (a.changePct === null) return 1;
      if (b.changePct === null) return -1;
      return b.changePct - a.changePct;
    });

  const indexRow =
    indexRows.find((row) => row.ticker === "EGX30") ?? indexRows[0];
  const asOf = latestQuoteAsOf(rows);
  const universeAsOf = latestUniverseAsOf(rows);

  let indexSparkline: number[] = [];

  if (indexRow) {
    const indexBars = await db
      .select({ close: dailyBars.close })
      .from(dailyBars)
      .where(eq(dailyBars.instrumentId, indexRow.id))
      .orderBy(desc(dailyBars.date))
      .limit(30);

    indexSparkline = indexBars
      .map((bar) => numberOrNull(bar.close))
      .filter((close): close is number => close !== null)
      .reverse();
  }

  return c.json(
    {
      data: {
        index: indexRow ? toInstrumentSummary(indexRow, now) : null,
        indexSparkline,
        breadth: {
          advancers,
          decliners,
          unchanged,
          total: advancers + decliners + unchanged,
        },
        gainers,
        losers,
        sectors,
        instrumentCount: stocks.length,
      },
      meta: {
        asOf: asOf?.toISOString() ?? null,
        source: rows.find((row) => row.quoteSource)?.quoteSource ?? "none",
        stale: quoteIsStale(asOf, now),
        universeAsOf: universeAsOf?.toISOString() ?? null,
      },
    },
    200,
  );
});
