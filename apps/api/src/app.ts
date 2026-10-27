import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";

import { env } from "./config/env";
import { auth } from "./lib/auth";
import { logger } from "./lib/logger";
import { OPENAPI_CONFIG } from "./openapi";
import { dataStatusRoutes } from "./routes/data-status";
import { instrumentHistoryRoutes } from "./routes/instrument-history";
import { instrumentNewsRoutes } from "./routes/instrument-news";
import { instrumentRoutes } from "./routes/instruments";
import { marketRoutes } from "./routes/market";
import { statusRoutes } from "./routes/status";

export const app = new OpenAPIHono();

app.use("*", requestId());

app.use("*", async (c, next) => {
  const startedAt = performance.now();
  await next();
  logger.info(
    {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    },
    "request",
  );
});

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return "*";
      }
      return env.trustedOrigins.includes(origin) ? origin : undefined;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 600,
  }),
);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/", statusRoutes);
app.route("/", dataStatusRoutes);
app.route("/", instrumentRoutes);
app.route("/", instrumentHistoryRoutes);
app.route("/", instrumentNewsRoutes);
app.route("/", marketRoutes);

app.doc31("/openapi.json", OPENAPI_CONFIG);

app.onError((error, c) => {
  logger.error(
    { requestId: c.get("requestId"), error },
    "Unhandled request error",
  );

  return c.json(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong. Try again.",
        requestId: c.get("requestId"),
      },
    },
    500,
  );
});

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "Route not found." } }, 404),
);

export type AppType = typeof app;
