import { db } from "./db";
import { createAuth } from "./auth/config";

// require explicit configuration; never use a shared fallback signing secret
export const auth = createAuth(db, {
  baseURL: Bun.env.BETTER_AUTH_URL ?? "",
  secret: Bun.env.BETTER_AUTH_SECRET ?? "",
});
