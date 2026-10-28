import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorResponseSchema,
  NewsFeedResponseSchema,
} from "@egx/contracts";
import {
  and,
  desc,
  eq,
  exists,
  gt,
  lt,
  notExists,
  or,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client";
import { newsInstrumentLinks, newsItems } from "../db/schema";

const newsFeedRoute = createRoute({
  method: "get",
  path: "/api/news",
  tags: ["market"],
  summary: "News feed for the market or economy sections",
  request: {
    query: z.object({
      feed: z.enum(["market", "economy"]),
      limit: z.coerce.number().int().default(20),
      cursor: z.string().trim().min(1).optional(),
      lang: z.enum(["ar", "en"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "News feed page",
      content: {
        "application/json": {
          schema: NewsFeedResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid cursor",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

type Cursor = { publishedAt: Date; id: number };

function decodeCursor(raw: string): Cursor | null {
  let decoded: string;

  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const separator = decoded.lastIndexOf("|");

  if (separator <= 0) {
    return null;
  }

  const publishedAt = new Date(decoded.slice(0, separator));
  const id = Number(decoded.slice(separator + 1));

  if (
    Number.isNaN(publishedAt.getTime()) ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return { publishedAt, id };
}

const linkedSubquery = db
  .select({ one: newsInstrumentLinks.newsId })
  .from(newsInstrumentLinks)
  .where(eq(newsInstrumentLinks.newsId, newsItems.id))
  .limit(1);

export const newsRoutes = new OpenAPIHono();

newsRoutes.openapi(newsFeedRoute, async (c) => {
  const { feed, cursor, lang } = c.req.valid("query");
  const limit = Math.min(30, Math.max(1, c.req.valid("query").limit));

  let cursorData: Cursor | null = null;

  if (cursor) {
    cursorData = decodeCursor(cursor);

    if (!cursorData) {
      return c.json(
        {
          error: {
            code: "INVALID_CURSOR",
            message: "The cursor is not a valid feed cursor.",
          },
        },
        400,
      );
    }
  }

  const conditions = [
    feed === "market" ? exists(linkedSubquery) : notExists(linkedSubquery),
  ];

  if (lang) {
    conditions.push(eq(newsItems.lang, lang));
  }

  if (cursorData) {
    const cursorAt = cursorData.publishedAt;
    conditions.push(
      or(
        lt(newsItems.publishedAt, cursorAt),
        and(
          eq(newsItems.publishedAt, cursorAt),
          lt(newsItems.id, cursorData.id),
        ),
      )!,
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
      category: newsItems.category,
    })
    .from(newsItems)
    .where(and(...conditions))
    .orderBy(desc(newsItems.publishedAt), desc(newsItems.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const asOf = page[0]?.publishedAt ?? null;
  const cursorRow = hasMore ? page[page.length - 1] : null;
  const nextCursor = cursorRow
    ? Buffer.from(
        `${cursorRow.publishedAt.toISOString()}|${cursorRow.id}`,
        "utf8",
      ).toString("base64url")
    : null;

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
        category: row.category,
      })),
      meta: {
        nextCursor,
        limit,
        feed,
        asOf: asOf?.toISOString() ?? null,
      },
    },
    200,
  );
});
