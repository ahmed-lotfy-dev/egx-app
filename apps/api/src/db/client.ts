import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../config/env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === "production" ? 20 : 5,
});

export const db = drizzle(client, { schema });
export const pgClient = client;

export async function closeDb() {
  await client.end({ timeout: 5 });
}
