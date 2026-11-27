import { eq, sql } from "drizzle-orm";
import { users } from "@/server/db/schema";
import type { DB } from "@/server/db/types";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Atomically count a failed login and lock the account after too many in a row. */
export async function registerFailedLogin(db: DB, userId: string) {
  await db.update(users).set({
    // A lock that has already expired starts a fresh count.
    failedLogins: sql`case when ${users.lockedUntil} is not null and ${users.lockedUntil} <= now() then 1 else ${users.failedLogins} + 1 end`,
    lockedUntil: sql`case when (case when ${users.lockedUntil} is not null and ${users.lockedUntil} <= now() then 1 else ${users.failedLogins} + 1 end) >= ${MAX_FAILED_LOGINS}
      then now() + make_interval(mins => ${LOCK_MINUTES}) else ${users.lockedUntil} end`,
  }).where(eq(users.id, userId));
}

export async function registerSuccessfulLogin(db: DB, userId: string) {
  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
}
