import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../config/env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, {
  // The API shares a small box with the ingest worker and other apps; a
  // small pool keeps the database responsive instead of queueing dozens of
  // slow queries behind each other.
  max: env.NODE_ENV === "production" ? 8 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export const pgClient = client;

export async function closeDb() {
  await client.end({ timeout: 5 });
}
