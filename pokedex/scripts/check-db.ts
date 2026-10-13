import { SQL } from "bun";
import { databaseEnv } from "../src/env/database";

// use the same Bun SQL driver and validated URL as the application's Drizzle client
const client = new SQL(databaseEnv.DATABASE_URL, { connectionTimeout: 10, max: 1 });
try {
  const [connection] = await client`SELECT current_database() AS database`;
  console.log(`Connected to database: ${connection.database}`);
  const [result] = await client`SELECT count(*)::integer AS count FROM public.pokemon`;
  console.log(`Pokemon table is readable; cached Pokemon: ${result.count}`);
} catch {
  // connection errors may include credentials; print troubleshooting guidance instead
  console.error(
    "Database check failed. Check Compose health, DATABASE_URL, and bun run db:migrate.",
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
