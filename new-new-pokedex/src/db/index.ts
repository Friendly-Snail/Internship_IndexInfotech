import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

// Drizzle infers this object's driver and schema types; consumers use typeof db
export const db = drizzle({ connection: { url: process.env.DATABASE_URL }, schema });
