import "./load.ts";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// database commands need only DATABASE_URL, not the application's auth settings
export const databaseEnv = createEnv({
  server: {
    DATABASE_URL: z.url().refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname);
    }, "DATABASE_URL must be a postgres:// or postgresql:// connection URL"),
  },
  runtimeEnv: { DATABASE_URL: process.env.DATABASE_URL },
  emptyStringAsUndefined: true,
  onValidationError: () => {
    // report the setting name without printing credentials from the URL
    throw new Error("Invalid DATABASE_URL: set a PostgreSQL connection URL in .env.");
  },
});
