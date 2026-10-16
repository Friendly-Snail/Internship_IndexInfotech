import { config } from "dotenv";
import pg from "pg";

config({ path: [".env.local", ".env"], quiet: true });
// import after loading .env so the validated URL is available
const { databaseEnv } = await import("../src/env/database");

// use the same node-postgres driver and validated URL as the application's Drizzle client
const client = new pg.Client({
  connectionString: databaseEnv.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});
try {
  await client.connect();
  const { rows: [connection] } = await client.query("SELECT current_database() AS database");
  console.log(`Connected to database: ${connection.database}`);
  const { rows: [result] } = await client.query(
    "SELECT count(*)::integer AS count FROM public.pokemon",
  );
  console.log(`Pokemon table is readable; cached Pokemon: ${result.count}`);
} catch {
  // connection errors may include credentials; print troubleshooting guidance instead
  console.error(
    "Database check failed. Check Compose health, DATABASE_URL, and bun run db:migrate.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
