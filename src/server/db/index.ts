import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pool?: Pool };

export function getDb(): NodePgDatabase<typeof schema> {
  const env = getEnv();
  globalForDb.__pool ??= new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  return drizzle(globalForDb.__pool, { schema });
}
