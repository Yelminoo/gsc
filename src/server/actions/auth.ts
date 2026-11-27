"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { dummyHash, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";
import { getCurrentUser } from "@/server/auth/dal";
import { registerFailedLogin, registerSuccessfulLogin } from "@/server/services/auth";
import { audit } from "@/server/services/audit";
import { loginSchema } from "@/lib/validators";
import { formObject } from "./helpers";
import type { ActionState } from "./types";

// One generic message for every failure so attackers cannot tell which part was wrong.
const GENERIC = "Invalid email or password, or the account is temporarily locked.";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: GENERIC };
  const { email, password } = parsed.data;

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    await verifyPassword(await dummyHash(), password); // equalise timing
    return { error: GENERIC };
  }

  const locked = !!user.lockedUntil && user.lockedUntil > new Date();
  const passwordOk = await verifyPassword(user.passwordHash, password); // always run the hash
  if (locked || !user.active || !passwordOk) {
    if (!locked) await registerFailedLogin(db, user.id);
    await audit(db, { userId: user.id, action: "login.failed", entity: "user", entityId: user.id, detail: { locked } });
    return { error: GENERIC };
  }

  await registerSuccessfulLogin(db, user.id);
  await createSession({ userId: user.id, sessionVersion: user.sessionVersion });
  await audit(db, { userId: user.id, action: "login.success", entity: "user", entityId: user.id });
  redirect("/students");
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    const db = getDb();
    // Bumping session_version revokes every token issued to this user.
    const [row] = await db.select({ v: users.sessionVersion }).from(users).where(eq(users.id, user.id));
    await db.update(users).set({ sessionVersion: row.v + 1 }).where(eq(users.id, user.id));
    await audit(db, { userId: user.id, action: "logout", entity: "user", entityId: user.id });
  }
  await destroySession();
  redirect("/login");
}
