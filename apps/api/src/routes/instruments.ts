import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorResponseSchema,
  InstrumentDetailResponseSchema,
  InstrumentListResponseSchema,
} from "@egx/contracts";
import {
  and,
  asc,
  count,
  eq,
  gt,
  ilike,
  max,
  min,
  or,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client";
import {
  dailyBars,
  fundamentals,
  instruments,
  latestQuotes,
} from "../db/schema";
import { marketColumns } from "../db/selects";
import {
  latestQuoteAsOf,
  latestUniverseAsOf,
  numberOrNull,
  quoteIsStale,
  toInstrumentSummary,
} from "../lib/market";
import { normalizeSearch } from "../lib/text";

const listRoute = createRoute({
  method: "get",
  path: "/api/instruments",
  tags: ["market"],
  summary: "List and search instruments",
  request: {
    query: z.object({
      q: z.string().trim().max(80).optional(),
      sector: z.string().trim().max(80).optional(),
      kind: z.enum(["stock", "index"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().trim().max(20).optional(),
    }),
  },
  responses: {
    200: {
      description: "Instrument page",
      content: {
        "application/json": {
          schema: InstrumentListResponseSchema,
        },
      },
    },
  },
});

const detailRoute = createRoute({
  method: "get",
  path: "/api/instruments/{ticker}",
  tags: ["market"],
  summary: "Instrument identity, latest quote, and history coverage",
  request: {
    params: z.object({
      ticker: z.string().trim().min(1).max(20),
    }),
  },
  responses: {
    200: {
      description: "Instrument detail",
      content: {
        "application/json": {
          schema: InstrumentDetailResponseSchema,
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

export const instrumentRoutes = new OpenAPIHono();

instrumentRoutes.openapi(listRoute, async (c) => {
  const { q, sector, kind, limit, cursor } = c.req.valid("query");
  const conditions: SQL[] = [eq(instruments.isActive, true)];

  if (q) {
    const normalized = normalizeSearch(q);
    const search = or(
      ilike(instruments.ticker, `%${q}%`),
      ilike(instruments.searchNameEn, `%${normalized}%`),
      ilike(instruments.searchNameAr, `%${normalized}%`),
    );

    if (search) {
      conditions.push(search);
    }
  }

  if (sector) {
    conditions.push(eq(instruments.sector, sector));
  }

  if (kind) {
    conditions.push(eq(instruments.kind, kind));
  }

  if (cursor) {
    conditions.push(gt(instruments.ticker, cursor.toUpperCase()));
  }

  const rows = await db
    .select(marketColumns)
    .from(instruments)
    .leftJoin(latestQuotes, eq(latestQuotes.instrumentId, instruments.id))
    .where(and(...conditions))
    .orderBy(asc(instruments.ticker))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const asOf = latestQuoteAsOf(page);
  const universeAsOf = latestUniverseAsOf(page);

  return c.json(
    {
      data: page.map((row) => toInstrumentSummary(row)),
      meta: {
        asOf: asOf?.toISOString() ?? null,
        source: page.find((row) => row.quoteSource)?.quoteSource ?? "none",
        stale: quoteIsStale(asOf),
        universeAsOf: universeAsOf?.toISOString() ?? null,
        nextCursor:
          rows.length > limit
            ? (page[page.length - 1]?.ticker ?? null)
            : null,
      },
    },
    200,
  );
});

instrumentRoutes.openapi(detailRoute, async (c) => {
  const { ticker } = c.req.valid("param");
  const [row] = await db
    .select({
      ...marketColumns,
      tvSymbol: instruments.tvSymbol,
      yahooSymbol: instruments.yahooSymbol,
      isin: instruments.isin,
      logoid: instruments.logoid,
    })
    .from(instruments)
    .leftJoin(latestQuotes, eq(latestQuotes.instrumentId, instruments.id))
    .where(eq(instruments.ticker, ticker.toUpperCase()))
    .limit(1);

  if (!row) {
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

  const [coverage] = await db
    .select({
      barCount: count(),
      firstDate: min(dailyBars.date),
      lastDate: max(dailyBars.date),
    })
    .from(dailyBars)
    .where(eq(dailyBars.instrumentId, row.id));

  const [fundamentalRow] = await db
    .select()
    .from(fundamentals)
    .where(
      and(
        eq(fundamentals.instrumentId, row.id),
        eq(fundamentals.source, "tradingview"),
      ),
    )
    .limit(1);

  return c.json(
    {
      data: {
        ...toInstrumentSummary(row),
        tvSymbol: row.tvSymbol,
        yahooSymbol: row.yahooSymbol,
        isin: row.isin,
        logoid: row.logoid,
        history: {
          barCount: coverage?.barCount ?? 0,
          firstDate: coverage?.firstDate ?? null,
          lastDate: coverage?.lastDate ?? null,
        },
        fundamentals: fundamentalRow
          ? {
              source: fundamentalRow.source,
              asOf: fundamentalRow.asOf,
              observedAt: fundamentalRow.observedAt.toISOString(),
              currency: fundamentalRow.currency,
              marketCap: numberOrNull(fundamentalRow.marketCap),
              pe: numberOrNull(fundamentalRow.pe),
              pb: numberOrNull(fundamentalRow.pb),
              eps: numberOrNull(fundamentalRow.eps),
              roe: numberOrNull(fundamentalRow.roe),
              roa: numberOrNull(fundamentalRow.roa),
              debtToEquity: numberOrNull(fundamentalRow.debtToEquity),
              dividendYield: numberOrNull(fundamentalRow.dividendYield),
              revenueTtm: numberOrNull(fundamentalRow.revenueTtm),
              netIncomeTtm: numberOrNull(fundamentalRow.netIncomeTtm),
              fcfTtm: numberOrNull(fundamentalRow.fcfTtm),
              currentRatio: numberOrNull(fundamentalRow.currentRatio),
              beta: numberOrNull(fundamentalRow.beta),
              grossMargin: numberOrNull(fundamentalRow.grossMargin),
              netMargin: numberOrNull(fundamentalRow.netMargin),
              totalDebt: numberOrNull(fundamentalRow.totalDebt),
              totalAssets: numberOrNull(fundamentalRow.totalAssets),
              bookValuePerShare: numberOrNull(
                fundamentalRow.bookValuePerShare,
              ),
              evEbitda: numberOrNull(fundamentalRow.evEbitda),
            }
          : null,
      },
      meta: {
        asOf: row.quoteAsOf?.toISOString() ?? null,
        source: row.quoteSource ?? "none",
        stale: quoteIsStale(row.quoteAsOf),
        universeAsOf: row.updatedAt.toISOString(),
      },
    },
    200,
  );
});
