import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorResponseSchema,
  InstrumentNewsResponseSchema,
} from "@egx/contracts";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client";
import {
  instruments,
  newsInstrumentLinks,
  newsItems,
} from "../db/schema";

const newsRoute = createRoute({
  method: "get",
  path: "/api/instruments/{ticker}/news",
  tags: ["market"],
  summary: "News linked to one instrument",
  request: {
    params: z.object({
      ticker: z.string().trim().min(1).max(20),
    }),
    query: z.object({
      limit: z.coerce.number().int().min(1).max(20).default(10),
      lang: z.enum(["ar", "en"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Instrument news",
      content: {
        "application/json": {
          schema: InstrumentNewsResponseSchema,
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

export const instrumentNewsRoutes = new OpenAPIHono();

instrumentNewsRoutes.openapi(newsRoute, async (c) => {
  const { ticker } = c.req.valid("param");
  const { limit, lang } = c.req.valid("query");

  const [instrument] = await db
    .select({
      id: instruments.id,
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
      id: newsItems.id,
      source: newsItems.source,
      lang: newsItems.lang,
      title: newsItems.title,
      summary: newsItems.summary,
      url: newsItems.url,
      publishedAt: newsItems.publishedAt,
      matchType: newsInstrumentLinks.matchType,
    })
    .from(newsInstrumentLinks)
    .innerJoin(newsItems, eq(newsInstrumentLinks.newsId, newsItems.id))
    .where(eq(newsInstrumentLinks.instrumentId, instrument.id))
    .orderBy(desc(newsItems.publishedAt))
    .limit(50);

  const preferred = lang ?? "ar";
  const preferredRows = rows.filter((row) => row.lang === preferred);
  const selected = preferredRows.length > 0 ? preferredRows : rows;
  const actualLang: "ar" | "en" | null =
    selected[0]?.lang === "en"
      ? "en"
      : selected[0]?.lang === "ar"
        ? "ar"
        : null;
  const fallback = actualLang !== null && actualLang !== preferred;
  const page = selected.slice(0, limit);
  const latest = page[0]?.publishedAt ?? null;

  return c.json(
    {
      data: page.map((row) => ({
        id: row.id,
        source: row.source,
        lang: row.lang === "en" ? ("en" as const) : ("ar" as const),
        title: row.title,
        summary: row.summary,
        url: row.url,
        publishedAt: row.publishedAt.toISOString(),
        matchType:
          row.matchType === "ticker" ? ("ticker" as const) : ("name" as const),
      })),
      meta: {
        asOf: latest?.toISOString() ?? null,
        source: page[0]?.source ?? "none",
        stale:
          latest === null ||
          Date.now() - latest.getTime() > 7 * 24 * 60 * 60 * 1000,
        universeAsOf: instrument.updatedAt.toISOString(),
        lang: actualLang,
        fallback,
      },
    },
    200,
  );
});
