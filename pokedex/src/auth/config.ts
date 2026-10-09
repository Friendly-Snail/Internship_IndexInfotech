import type { BetterAuthOptions } from "better-auth";
import { openAPI } from "better-auth/plugins";

// share behavior between the application and tests without creating an auth instance here
// database, origin, and secret are supplied where betterAuth() is called
export const authOptions = {
  basePath: "/api/auth",
  emailAndPassword: { enabled: true },
  plugins: [openAPI({ disableDefaultReference: true })],
  // keep origin/CSRF checks active in tests as well as normal server requests
  advanced: { disableOriginCheck: false, disableCSRFCheck: false },
} satisfies BetterAuthOptions;
