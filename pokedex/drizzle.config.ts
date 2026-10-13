import { defineConfig } from "drizzle-kit";
import { databaseEnv } from "./src/env/database";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseEnv.DATABASE_URL },
});
