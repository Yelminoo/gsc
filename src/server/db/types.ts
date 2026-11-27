import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Works for node-postgres (app), PGlite (tests) and transactions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<any, typeof schema>;
