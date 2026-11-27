import { sql } from "drizzle-orm";
import { counters } from "@/server/db/schema";
import type { DB } from "@/server/db/types";

/** Atomic, gap-tolerant counter (safe under concurrent requests). */
export async function nextCounter(db: DB, key: string): Promise<number> {
  const [row] = await db
    .insert(counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return row.value;
}
