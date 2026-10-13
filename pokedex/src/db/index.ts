import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

const databaseUrl = Bun.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.example to .env and set your PostgreSQL connection URL.",
  );
}

// Drizzle infers this object's driver and schema types; consumers use typeof db
export const db = drizzle({ connection: { url: databaseUrl }, schema });
