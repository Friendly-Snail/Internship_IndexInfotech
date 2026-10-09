import { Hono } from "hono";
import type { Auth } from "../auth";

/**
 * Forward Better Auth requests and identify the current trainer from session cookies (yummy)
 *
 * @param auth - Better Auth instance that handles requests and resolves sessions
 * @returns Authentication routes and GET /me; anonymous /me requests receive 401
 */
export function createAuthRoutes(auth: Auth) {
  const routes = new Hono();
  routes.all("/api/auth/*", (c) => auth.handler(c.req.raw));

  // identify the caller from the signed cookie, never from a supplied user ID
  routes.get("/me", async (c) => {
    c.header("Cache-Control", "no-store");
    const current = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!current) return c.json({ error: "Sign in to identify your trainer." }, 401);
    return c.json({
      user: {
        id: current.user.id,
        name: current.user.name,
        email: current.user.email,
        emailVerified: current.user.emailVerified,
      },
      session: { id: current.session.id, expiresAt: current.session.expiresAt },
    });
  });
  return routes;
}
