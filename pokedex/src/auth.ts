import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";
import * as schema from "./db/schema/auth-schema";
import { openAPI } from "better-auth/plugins";
import { env } from "./env";

// one configured instance shared by the running application
export const auth = betterAuth({
  basePath: "/api/auth",
  emailAndPassword: { enabled: true },
  plugins: [openAPI({ disableDefaultReference: true })],
  // keep origin and CSRF checks active for cookie-based authentication
  advanced: { disableOriginCheck: false, disableCSRFCheck: false },
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
});

// type-only imports let routes and tests use this shape without loading the real database
export type Auth = typeof auth;
