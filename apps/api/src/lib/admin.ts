import type { Context } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { user } from "../db/schema";
import { auth } from "./auth";

export type AdminUser = {
  id: string;
  email: string;
};

/**
 * Returns the signed-in admin, or null. Callers must respond 403 when null.
 * Admin access is the `user.is_admin` flag, not a separate credential.
 */
export async function getAdmin(c: Context): Promise<AdminUser | null> {
  const session = await auth.api
    .getSession({ headers: c.req.raw.headers })
    .catch(() => null);

  const sessionUser = session?.user;
  if (!sessionUser?.id || !sessionUser.email) {
    return null;
  }

  // The session payload does not carry custom columns; check the flag in the DB.
  const [row] = await db
    .select({ isAdmin: user.isAdmin })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);

  if (!row?.isAdmin) {
    return null;
  }

  return { id: sessionUser.id, email: sessionUser.email };
}
