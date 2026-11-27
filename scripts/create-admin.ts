/**
 * Creates (or resets the password of) a user.
 *   ADMIN_EMAIL=you@school.com ADMIN_PASSWORD='long passphrase' ADMIN_ROLE=admin npm run create-admin
 * The password is read from the environment, never stored in the repo or shell history files you commit.
 */
import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users } from "../src/server/db/schema";

async function main() {
  const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ROLE = "admin" } = process.env;
  if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Set DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD");
  if (ADMIN_PASSWORD.length < 12) throw new Error("Password must be at least 12 characters");
  if (ADMIN_ROLE !== "admin" && ADMIN_ROLE !== "accountant") throw new Error("ADMIN_ROLE must be admin or accountant");

  const passwordHash = await hash(ADMIN_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  await db.insert(users).values({ email: ADMIN_EMAIL.toLowerCase(), passwordHash, role: ADMIN_ROLE })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash, role: ADMIN_ROLE, active: true, failedLogins: 0, lockedUntil: null } });
  await pool.end();
  console.log(`User ${ADMIN_EMAIL.toLowerCase()} saved with role ${ADMIN_ROLE}.`);
}
main().catch((e) => { console.error("Failed:", e?.cause?.message ?? (e instanceof Error ? e.message.split("\n")[0] : "unknown error")); process.exit(1); });
