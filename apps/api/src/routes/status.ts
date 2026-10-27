import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { ErrorResponseSchema, StatusResponseSchema } from "@egx/contracts";
import { sql } from "drizzle-orm";

import { db } from "../db/client";

const statusRoute = createRoute({
  method: "get",
  path: "/api/status",
  tags: ["status"],
  summary: "API and database health",
  responses: {
    200: {
      description: "Service status",
      content: {
        "application/json": {
          schema: StatusResponseSchema,
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

export const statusRoutes = new OpenAPIHono();

statusRoutes.openapi(statusRoute, async (c) => {
  let database: "up" | "down" = "up";

  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "down";
  }

  return c.json(
    {
      ok: database === "up",
      version: "0.1.0",
      time: new Date().toISOString(),
      database,
    },
    200,
  );
});
