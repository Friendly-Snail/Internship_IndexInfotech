import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";
import * as schema from "./db/schema/auth-schema";
import { authOptions } from "./auth/config";

// require explicit configuration; never use a shared fallback signing secret
const baseURL = Bun.env.BETTER_AUTH_URL ?? "";
const secret = Bun.env.BETTER_AUTH_SECRET ?? "";

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
}
if (!URL.canParse(baseURL)) {
  throw new Error("BETTER_AUTH_URL is required, for example http://localhost:3000.");
}
const origin = new URL(baseURL);
if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== baseURL) {
  throw new Error("BETTER_AUTH_URL must be an origin, such as http://localhost:3000.");
}

// one configured instance shared by the running application
export const auth = betterAuth({
  ...authOptions,
  baseURL,
  secret,
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
});

// type-only imports let routes and tests use this shape without loading the real database
export type Auth = typeof auth;
