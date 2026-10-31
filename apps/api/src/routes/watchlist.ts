import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  AddWatchlistItemRequestSchema,
  CreateWatchlistRequestSchema,
  ErrorResponseSchema,
  RenameWatchlistRequestSchema,
  WatchlistsResponseSchema,
} from "@egx/contracts";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "../lib/auth";
import { SHARIA_TICKERS } from "../lib/sharia-tickers";
import { db } from "../db/client";
import { instruments, latestQuotes, watchlistItems, watchlists } from "../db/schema";

type WatchlistPayload = z.infer<typeof WatchlistsResponseSchema>["data"][number];
type WatchlistInstrument = WatchlistPayload["instruments"][number];

const EGX30_SIZE = 30;

// ---------- helpers ----------

async function getSessionUserId(c: { req: { raw: Request } }): Promise<string | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  return session?.user?.id ?? null;
}

type QuoteRow = {
  id: number;
  ticker: string;
  nameEn: string;
  nameAr: string | null;
  sector: string | null;
  price: string | null;
  change: string | null;
  changePct: string | null;
  currency: string | null;
  marketCap: string | null;
  asOf: Date | null;
};

function mapInstrument(row: Omit<QuoteRow, "id">): WatchlistInstrument {
  return {
    ticker: row.ticker,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    sector: row.sector,
    quote:
      row.price !== null
        ? {
            price: Number(row.price),
            change: row.change !== null ? Number(row.change) : null,
            changePct: row.changePct !== null ? Number(row.changePct) : null,
            currency: row.currency,
          }
        : null,
  };
}

function selectQuoteRows() {
  return db
    .select({
      id: instruments.id,
      ticker: instruments.ticker,
      nameEn: instruments.nameEn,
      nameAr: instruments.nameAr,
      sector: instruments.sector,
      price: latestQuotes.price,
      change: latestQuotes.change,
      changePct: latestQuotes.changePct,
      currency: latestQuotes.currency,
      marketCap: latestQuotes.marketCap,
      asOf: latestQuotes.asOf,
    })
    .from(instruments)
    .leftJoin(latestQuotes, eq(instruments.id, latestQuotes.instrumentId));
}

function newestAsOf(rows: QuoteRow[]): string | null {
  const times = rows
    .map((r) => r.asOf)
    .filter((t): t is Date => t !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  return times[0] ? times[0].toISOString() : null;
}

function buildDefaultLists(rows: QuoteRow[]): WatchlistPayload[] {
  const quoted = rows.filter((r) => r.price !== null);

  // EGX30: top 30 by market cap (nulls excluded)
  const byMarketCap = quoted
    .filter((r) => r.marketCap !== null)
    .sort((a, b) => Number(b.marketCap ?? 0) - Number(a.marketCap ?? 0));
  const egx30 = byMarketCap.slice(0, EGX30_SIZE);

  // Sharia: static curated list intersected with instruments, by market cap
  const shariaSet = new Set<string>(SHARIA_TICKERS);
  const sharia = byMarketCap.filter((r) => shariaSet.has(r.ticker));

  return [
    {
      id: "default:egx30",
      kind: "egx30" as const,
      name: "EGX30",
      editable: false,
      instrumentCount: egx30.length,
      instruments: egx30.map(mapInstrument),
    },
    {
      id: "default:sharia",
      kind: "sharia" as const,
      name: "الشريعة",
      editable: false,
      instrumentCount: sharia.length,
      instruments: sharia.map(mapInstrument),
    },
  ];
}

async function buildCustomLists(userId: string): Promise<WatchlistPayload[]> {
  const lists = await db
    .select()
    .from(watchlists)
    .where(eq(watchlists.userId, userId))
    .orderBy(asc(watchlists.createdAt));

  if (lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);
  const itemRows = await db
    .select({
      watchlistId: watchlistItems.watchlistId,
      position: watchlistItems.position,
      ticker: instruments.ticker,
      nameEn: instruments.nameEn,
      nameAr: instruments.nameAr,
      sector: instruments.sector,
      price: latestQuotes.price,
      change: latestQuotes.change,
      changePct: latestQuotes.changePct,
      currency: latestQuotes.currency,
      marketCap: latestQuotes.marketCap,
      asOf: latestQuotes.asOf,
    })
    .from(watchlistItems)
    .innerJoin(instruments, eq(watchlistItems.instrumentId, instruments.id))
    .leftJoin(latestQuotes, eq(instruments.id, latestQuotes.instrumentId))
    .where(inArray(watchlistItems.watchlistId, listIds))
    .orderBy(asc(watchlistItems.position), asc(watchlistItems.id));

  const byList = new Map<number, typeof itemRows>();
  for (const row of itemRows) {
    const list = byList.get(row.watchlistId) ?? [];
    list.push(row);
    byList.set(row.watchlistId, list);
  }

  return lists.map((l) => {
    const rows = byList.get(l.id) ?? [];
    return {
      id: `custom:${l.id}`,
      kind: "custom" as const,
      name: l.name,
      editable: true,
      instrumentCount: rows.length,
      instruments: rows.map(mapInstrument),
    };
  });
}

// ---------- routes ----------

const listWatchlistsRoute = createRoute({
  method: "get",
  path: "/api/watchlists",
  tags: ["market"],
  summary: "Watchlists: EGX30 + Sharia defaults, plus the signed-in user's custom lists",
  responses: {
    200: {
      description: "Watchlists with instruments and quotes",
      content: {
        "application/json": {
          schema: WatchlistsResponseSchema,
        },
      },
    },
  },
});

const createWatchlistRoute = createRoute({
  method: "post",
  path: "/api/watchlists",
  tags: ["market"],
  summary: "Create a custom watchlist (requires sign-in)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateWatchlistRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Created watchlist",
      content: {
        "application/json": {
          schema: WatchlistsResponseSchema.pick({ data: true }).extend({
            data: WatchlistsResponseSchema.shape.data.element,
          }),
        },
      },
    },
    401: {
      description: "Sign-in required",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Failed to create watchlist",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const renameWatchlistRoute = createRoute({
  method: "patch",
  path: "/api/watchlists/{id}",
  tags: ["market"],
  summary: "Rename a custom watchlist (owner only)",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: {
      content: {
        "application/json": {
          schema: RenameWatchlistRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Renamed",
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean() }),
        },
      },
    },
    401: {
      description: "Sign-in required",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "List not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const deleteWatchlistRoute = createRoute({
  method: "delete",
  path: "/api/watchlists/{id}",
  tags: ["market"],
  summary: "Delete a custom watchlist (owner only)",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    200: {
      description: "Deleted",
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean() }),
        },
      },
    },
    401: {
      description: "Sign-in required",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "List not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const addWatchlistItemRoute = createRoute({
  method: "post",
  path: "/api/watchlists/{id}/items",
  tags: ["market"],
  summary: "Add a stock to a custom watchlist (owner only)",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: {
      content: {
        "application/json": {
          schema: AddWatchlistItemRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Added",
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean() }),
        },
      },
    },
    401: {
      description: "Sign-in required",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "List or instrument not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const removeWatchlistItemRoute = createRoute({
  method: "delete",
  path: "/api/watchlists/{id}/items/{ticker}",
  tags: ["market"],
  summary: "Remove a stock from a custom watchlist (owner only)",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
      ticker: z.string().min(1).max(20),
    }),
  },
  responses: {
    200: {
      description: "Removed",
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean() }),
        },
      },
    },
    401: {
      description: "Sign-in required",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "List or item not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export const watchlistRoutes = new OpenAPIHono();

watchlistRoutes.openapi(listWatchlistsRoute, async (c) => {
  const userId = await getSessionUserId(c);

  const rows = await selectQuoteRows();
  const defaults = buildDefaultLists(rows);
  const customs = userId ? await buildCustomLists(userId) : [];

  return c.json(
    {
      data: [...defaults, ...customs],
      meta: {
        asOf: newestAsOf(rows),
      },
    },
    200,
  );
});

watchlistRoutes.openapi(createWatchlistRoute, async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in to create watchlists." } }, 401);
  }

  const { name } = c.req.valid("json");
  const created = (
    await db
      .insert(watchlists)
      .values({ userId, name, kind: "custom" })
      .returning()
  )[0];
  if (!created) {
    return c.json({ error: { code: "INTERNAL", message: "Failed to create watchlist." } }, 500);
  }

  return c.json(
    {
      data: {
        id: `custom:${created.id}`,
        kind: "custom" as const,
        name: created.name,
        editable: true,
        instrumentCount: 0,
        instruments: [],
      },
    },
    201,
  );
});

async function requireOwnedWatchlist(userId: string, listId: number) {
  const [list] = await db
    .select()
    .from(watchlists)
    .where(and(eq(watchlists.id, listId), eq(watchlists.userId, userId)))
    .limit(1);
  return list ?? null;
}

watchlistRoutes.openapi(renameWatchlistRoute, async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in to edit watchlists." } }, 401);
  }

  const { id } = c.req.valid("param");
  const list = await requireOwnedWatchlist(userId, id);
  if (!list) {
    return c.json({ error: { code: "NOT_FOUND", message: "Watchlist not found." } }, 404);
  }

  const { name } = c.req.valid("json");
  await db
    .update(watchlists)
    .set({ name, updatedAt: new Date() })
    .where(eq(watchlists.id, id));

  return c.json({ ok: true }, 200);
});

watchlistRoutes.openapi(deleteWatchlistRoute, async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in to delete watchlists." } }, 401);
  }

  const { id } = c.req.valid("param");
  const list = await requireOwnedWatchlist(userId, id);
  if (!list) {
    return c.json({ error: { code: "NOT_FOUND", message: "Watchlist not found." } }, 404);
  }

  await db.delete(watchlists).where(eq(watchlists.id, id));
  return c.json({ ok: true }, 200);
});

watchlistRoutes.openapi(addWatchlistItemRoute, async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in to edit watchlists." } }, 401);
  }

  const { id } = c.req.valid("param");
  const list = await requireOwnedWatchlist(userId, id);
  if (!list) {
    return c.json({ error: { code: "NOT_FOUND", message: "Watchlist not found." } }, 404);
  }

  const { ticker } = c.req.valid("json");
  const [instrument] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.ticker, ticker))
    .limit(1);
  if (!instrument) {
    return c.json({ error: { code: "NOT_FOUND", message: `Unknown ticker: ${ticker}` } }, 404);
  }

  const positionRow = (
    await db
      .select({ nextPosition: sql<number>`coalesce(max(${watchlistItems.position}), -1) + 1` })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, id))
  )[0];
  const nextPosition = positionRow?.nextPosition ?? 0;

  await db
    .insert(watchlistItems)
    .values({ watchlistId: id, instrumentId: instrument.id, position: nextPosition })
    .onConflictDoNothing();

  return c.json({ ok: true }, 201);
});

watchlistRoutes.openapi(removeWatchlistItemRoute, async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in to edit watchlists." } }, 401);
  }

  const { id, ticker } = c.req.valid("param");
  const list = await requireOwnedWatchlist(userId, id);
  if (!list) {
    return c.json({ error: { code: "NOT_FOUND", message: "Watchlist not found." } }, 404);
  }

  const deleted = await db
    .delete(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, id),
        inArray(
          watchlistItems.instrumentId,
          db.select({ id: instruments.id }).from(instruments).where(eq(instruments.ticker, ticker.toUpperCase())),
        ),
      ),
    )
    .returning({ id: watchlistItems.id });

  if (deleted.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Item not in list." } }, 404);
  }

  return c.json({ ok: true }, 200);
});
