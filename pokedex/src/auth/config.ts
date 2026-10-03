import { betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "../db/auth-schema";

type AuthSettings = { baseURL: string; secret: string };

/**
 * Configure email/password authentication and session cookies
 *
 * @param database - Drizzle database passed to the Better Auth adapter
 * @param settings - Application origin and a secret of at least 32 characters
 * @returns The configured Better Auth instance
 * @throws If the secret is too short or the URL is not an HTTP(S) origin
 */
export function createAuth(database: Parameters<typeof drizzleAdapter>[0], settings: AuthSettings) {
  if (!settings.secret || settings.secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
  if (!URL.canParse(settings.baseURL)) {
    throw new Error("BETTER_AUTH_URL is required, for example http://localhost:3000.");
  }
  const baseURL = new URL(settings.baseURL);
  if (!["http:", "https:"].includes(baseURL.protocol) || baseURL.origin !== settings.baseURL) {
    throw new Error("BETTER_AUTH_URL must be an origin, such as http://localhost:3000.");
  }

  return betterAuth({
    baseURL: settings.baseURL,
    basePath: "/api/auth",
    secret: settings.secret,
    database: drizzleAdapter(database, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: true },
    plugins: [openAPI({ disableDefaultReference: true })],
    // keep origin/CSRF checks active in tests as well as normal server requests
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
  });
}
