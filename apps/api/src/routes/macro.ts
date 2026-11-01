import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorResponseSchema,
  MacroQuotesResponseSchema,
  MACRO_KEYS,
} from "@egx/contracts";
import { asc } from "drizzle-orm";

import { db } from "../db/client";
import { macroQuotes } from "../db/schema/market";
import { cached } from "../lib/cache";

/**
 * A macro quote older than this is considered stale — the card shows "—"
 * instead of a price so the app never presents outdated rates as current.
 */
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

const macroRoute = createRoute({
  method: "get",
  path: "/api/macro",
  tags: ["market"],
  summary: "Economy strip quotes (USD/EGP, oil, gold)",
  responses: {
    200: {
      description: "Latest macro quotes with staleness flags",
      content: {
        "application/json": {
          schema: MacroQuotesResponseSchema,
        },
      },
    },
    500: {
      description: "Unexpected error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export const macroRoutes = new OpenAPIHono();

macroRoutes.openapi(macroRoute, async (c) => {
  // Every client polls this endpoint; a short cache keeps the shared box calm.
  const quotes = await cached("macro:quotes", 15_000, async () => {
    const rows = await db
      .select()
      .from(macroQuotes)
      .orderBy(asc(macroQuotes.key));

    const now = Date.now();
    const order = new Map(MACRO_KEYS.map((key, index) => [key, index]));

    return rows
      .map((row) => {
        const asOf = row.asOf ? new Date(row.asOf).toISOString() : null;
        const stale =
          !row.asOf || now - new Date(row.asOf).getTime() > STALE_AFTER_MS;

        return {
          key: row.key as (typeof MACRO_KEYS)[number],
          value: row.value === null ? null : Number(row.value),
          change: row.change === null ? null : Number(row.change),
          changePct: row.changePct === null ? null : Number(row.changePct),
          currency: row.currency,
          unit: row.unit,
          source: row.source,
          asOf,
          stale,
        };
      })
      .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
  });

  return c.json({ data: quotes }, 200);
});
