import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { databaseEnv } from "../env/database";

// keep the existing database and schema; only the client driver changes
export const pool = new Pool({
  connectionString: databaseEnv.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 10,
});
// idle connections can fail after PostgreSQL restarts. Do not log credentials
pool.on("error", () => console.error("PostgreSQL connection lost; check Docker and DATABASE_URL."));
export const db = drizzle({ client: pool, schema });
