import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";
import { databaseEnv } from "../env/database";

// Drizzle infers this object's driver and schema types; consumers use typeof db
export const db = drizzle({ connection: { url: databaseEnv.DATABASE_URL }, schema });
