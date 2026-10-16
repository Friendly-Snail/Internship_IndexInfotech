import { Client } from "pg";
import { databaseEnv } from "../src/env/database.ts";

// use the same pg driver and validated URL as the application's Drizzle pool
// a separate client lets this short-lived command close its connection cleanly
const client = new Client({
  connectionString: databaseEnv.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});
try {
  await client.connect();
  const {
    rows: [connection],
  } = await client.query<{ database: string }>("SELECT current_database() AS database");
  console.log(`Connected to database: ${connection.database}`);
  const {
    rows: [result],
  } = await client.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM public.pokemon",
  );
  console.log(`Pokemon table is readable; cached Pokemon: ${result.count}`);
} catch {
  // connection errors may include credentials; keep troubleshooting output safe
  console.error(
    "Database check failed. Check Compose health, DATABASE_URL, and bun run db:migrate.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
