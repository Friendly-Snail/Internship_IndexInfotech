import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { databaseEnv } from "./env/database";

// server configuration is validated once when this module is imported
// TanStack Start loads .env files into process.env for server code
export const env = createEnv({
  extends: [databaseEnv],
  server: {
    BETTER_AUTH_URL: z.string().refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && url.origin === value;
    }, "BETTER_AUTH_URL must be an HTTP(S) origin, such as http://localhost:3000"),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must contain at least 32 characters"),
  },
  runtimeEnv: {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  },
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    // include field names and validation messages, never the supplied secret values
    const details = issues.map((issue) => `${issue.path?.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  },
});
