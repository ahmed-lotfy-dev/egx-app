import { app } from "./app";
import { env } from "./config/env";
import { closeDb } from "./db/client";
import { logger } from "./lib/logger";

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

logger.info({ port: server.port, env: env.NODE_ENV }, "API listening");

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  await server.stop();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
