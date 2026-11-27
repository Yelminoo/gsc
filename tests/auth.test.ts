import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { MAX_FAILED_LOGINS, registerFailedLogin, registerSuccessfulLogin } from "@/server/services/auth";
import type { DB } from "@/server/db/types";
import { testDb } from "./helpers";

let db: DB;
let id: string;
const get = async () => (await db.select().from(users).where(eq(users.id, id)))[0];

beforeAll(async () => {
  db = await testDb();
  [{ id }] = await db.insert(users).values({ email: "u@x.com", passwordHash: "x" }).returning({ id: users.id });
});

describe("login lockout", () => {
  it("locks after the maximum number of failures", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) await registerFailedLogin(db, id);
    expect((await get()).lockedUntil).toBeNull();
    await registerFailedLogin(db, id);
    const u = await get();
    expect(u.failedLogins).toBe(MAX_FAILED_LOGINS);
    expect(u.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("starts a fresh count once an old lock has expired", async () => {
    await db.update(users).set({ lockedUntil: sql`now() - interval '1 minute'` }).where(eq(users.id, id));
    await registerFailedLogin(db, id);
    const u = await get();
    expect(u.failedLogins).toBe(1);
    expect(u.lockedUntil!.getTime()).toBeLessThan(Date.now());
  });

  it("clears the counters on success", async () => {
    await registerSuccessfulLogin(db, id);
    const u = await get();
    expect(u.failedLogins).toBe(0);
    expect(u.lockedUntil).toBeNull();
  });
});
