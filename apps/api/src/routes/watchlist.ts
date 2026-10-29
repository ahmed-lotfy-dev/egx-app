import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorResponseSchema,
  PredefinedWatchlistsResponseSchema,
} from "@egx/contracts";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client";
import { instruments, latestQuotes } from "../db/schema";

const watchlistRoute = createRoute({
  method: "get",
  path: "/api/watchlists/predefined",
  tags: ["market"],
  summary: "Predefined watchlists (EGX30, EGX70, sectors, etc.)",
  responses: {
    200: {
      description: "Predefined watchlists with instruments and quotes",
      content: {
        "application/json": {
          schema: PredefinedWatchlistsResponseSchema,
        },
      },
    },
  },
});

export const watchlistRoutes = new OpenAPIHono();

watchlistRoutes.openapi(watchlistRoute, async (c) => {
  // Fetch all active instruments with their latest quotes
  const instrumentRows = await db
    .select({
      id: instruments.id,
      ticker: instruments.ticker,
      nameEn: instruments.nameEn,
      nameAr: instruments.nameAr,
      sector: instruments.sector,
      quotePrice: latestQuotes.price,
      quoteChange: latestQuotes.change,
      quoteChangePct: latestQuotes.changePct,
      quoteCurrency: latestQuotes.currency,
    })
    .from(instruments)
    .leftJoin(latestQuotes, eq(instruments.id, latestQuotes.instrumentId))
    .where(eq(instruments.isActive, true))
    .orderBy(desc(latestQuotes.marketCap));

  const bySector = new Map<string, typeof instrumentRows>();

  for (const row of instrumentRows) {
    const sector = row.sector ?? "غير مصنف";
    const list = bySector.get(sector) ?? [];
    list.push(row);
    bySector.set(sector, list);
  }

  const sectorLists = [...bySector.entries()].map(([sector, rows]) => ({
    id: `sector:${sector.toLowerCase().replace(/\s+/g, "-")}`,
    nameAr: `قطاع ${sector}`,
    nameEn: `${sector} Sector`,
    type: "sector" as const,
    instrumentCount: rows.length,
    instruments: rows.map(mapInstrument),
  }));

  // EGX30 / EGX70 / EWI by market cap ranking
  const withMarketCap = instrumentRows
    .filter((r) => r.quotePrice !== null)
    .sort((a, b) => Number(b.quotePrice ?? 0) - Number(a.quotePrice ?? 0));

  const egx30 = withMarketCap.slice(0, 30);
  const egx70 = withMarketCap.slice(30, 100);
  const ewi = withMarketCap.slice(0, 100);

  const indexLists = [
    {
      id: "egx30",
      nameAr: "EGX30",
      nameEn: "EGX30",
      type: "index" as const,
      instrumentCount: egx30.length,
      instruments: egx30.map(mapInstrument),
    },
    {
      id: "egx70",
      nameAr: "EGX70",
      nameEn: "EGX70",
      type: "index" as const,
      instrumentCount: egx70.length,
      instruments: egx70.map(mapInstrument),
    },
    {
      id: "ewi",
      nameAr: "EGX100",
      nameEn: "EGX100",
      type: "index" as const,
      instrumentCount: ewi.length,
      instruments: ewi.map(mapInstrument),
    },
  ];

  // Sharia list (EGX33) - placeholder until sharia_status table exists
  const shariaList = {
    id: "egx33_sharia",
    nameAr: "مؤشر الشريعة EGX33",
    nameEn: "EGX33 Sharia",
    type: "sharia" as const,
    instrumentCount: 0,
    instruments: [] as ReturnType<typeof mapInstrument>[],
  };

  const allLists = [...indexLists, shariaList, ...sectorLists];

  const latestQuote = instrumentRows.find((r) => r.quotePrice !== null);
  const asOf = latestQuote
    ? new Date().toISOString()
    : null;

  return c.json(
    {
      data: allLists,
      meta: {
        asOf,
        source: "universe+quotes",
      },
    },
    200,
  );
});

type RawInstrumentRow = {
  id: number;
  ticker: string;
  nameEn: string;
  nameAr: string | null;
  sector: string | null;
  quotePrice: string | null;
  quoteChange: string | null;
  quoteChangePct: string | null;
  quoteCurrency: string | null;
};

function mapInstrument(row: RawInstrumentRow) {
  return {
    ticker: row.ticker,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    sector: row.sector,
    quote:
      row.quotePrice !== null
        ? {
            price: Number(row.quotePrice),
            change: row.quoteChange !== null ? Number(row.quoteChange) : null,
            changePct: row.quoteChangePct !== null ? Number(row.quoteChangePct) : null,
            currency: row.quoteCurrency,
          }
        : null,
  };
}