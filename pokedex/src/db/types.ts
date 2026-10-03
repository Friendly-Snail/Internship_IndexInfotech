import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Shared database operations supported by PostgreSQL and our test database. */
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
