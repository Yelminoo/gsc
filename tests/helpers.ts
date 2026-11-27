import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import type { DB } from "@/server/db/types";
import { createPaymentTerm } from "@/server/services/terms";
import { registerStudent } from "@/server/services/students";

export async function testDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as DB;
}

export async function seed(db: DB) {
  const [user] = await db.insert(schema.users).values({ email: "a@x.com", passwordHash: "x", role: "admin" }).returning();
  const [program] = await db.insert(schema.programs).values({ name: "Gem Cutting", tuitionFee: "15000.00" }).returning();
  const term = await createPaymentTerm(db, {
    name: "3 payments", discountPercent: 0, userId: user.id,
    installments: [{ percentage: 33.33, dueOffsetDays: 0 }, { percentage: 33.33, dueOffsetDays: 30 }, { percentage: 33.34, dueOffsetDays: 60 }],
  });
  const student = await registerStudent(db, { fullName: "Mya Mya", programId: program.id, guardianName: "U Ba" }, user.id);
  return { user, program, term, student };
}
