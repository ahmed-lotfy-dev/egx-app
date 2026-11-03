import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { user } from "../db/schema";

/**
 * Grants admin access to an existing user. Sign in once first (email OTP) so
 * the user row exists, then run:
 *
 *   bun --cwd apps/api src/scripts/seed-admin.ts [email]
 */
const email = (process.argv[2] ?? "elshenawy19@gmail.com").trim().toLowerCase();

const [row] = await db
  .update(user)
  .set({ isAdmin: true })
  .where(eq(user.email, email))
  .returning({ id: user.id, email: user.email, isAdmin: user.isAdmin });

if (!row) {
  console.error(
    `No user with email ${email}. Sign in to the app once, then rerun this script.`,
  );
  process.exit(1);
}

console.log(`Admin granted: ${row.email} (${row.id})`);
process.exit(0);
