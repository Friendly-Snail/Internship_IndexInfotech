import { drizzle } from "drizzle-orm/postgres-js";
import { relations } from "./schema/relations";

// Drizzle infers this object's driver and schema types; consumers use typeof db
export const db = drizzle(process.env.DATABASE_URL!, { relations });
