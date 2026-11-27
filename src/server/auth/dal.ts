import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { readSession } from "./session";

export type Role = "admin" | "accountant";
export type CurrentUser = { id: string; email: string; role: Role };

/**
 * Data Access Layer: the single source of truth for "who is calling".
 * The user is re-loaded from the database on every request, so deactivating a user,
 * changing a role or bumping session_version takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await readSession();
  if (!claims) return null;
  const [u] = await getDb().select().from(users).where(eq(users.id, claims.userId));
  if (!u || !u.active || u.sessionVersion !== claims.sessionVersion) return null;
  return { id: u.id, email: u.email, role: u.role };
});

/** Call at the top of EVERY page, server action and route handler that needs a user. */
export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/students?denied=1");
  return user;
}
