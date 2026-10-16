import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { databaseEnv } from "../env/database";

// node-postgres works in both the Vite (Node) dev server and the production server build
// Drizzle infers this object's driver and schema types; consumers use typeof db
export const db = drizzle({ connection: { connectionString: databaseEnv.DATABASE_URL }, schema });
