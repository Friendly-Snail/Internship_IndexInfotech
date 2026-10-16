import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { openAPI } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import * as schema from "#/db/schema/auth-schema";
import { env } from "#/env";

// one configured instance shared by the running application
export const auth = betterAuth({
  basePath: "/api/auth",
  emailAndPassword: { enabled: true },
  // tanstackStartCookies must stay last so it can forward cookies set by other plugins
  plugins: [openAPI({ disableDefaultReference: true }), tanstackStartCookies()],
  // keep origin and CSRF checks active for cookie-based authentication
  advanced: { disableOriginCheck: false, disableCSRFCheck: false },
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
});

export type Auth = typeof auth;
