import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { createAuth } from "../src/auth/config";
import { createAuthRoutes } from "../src/routes/auth";
import * as schema from "../src/db/auth-schema";

// an isolated embedded postgresql instance: these tests never use DATABASE_URL
// and never create accounts in your real pokedex database.
const client = new PGlite();
const db = drizzle(client, { schema });
const baseURL = "http://localhost:3000";
const auth = createAuth(db, { baseURL, secret: crypto.randomUUID() + crypto.randomUUID() });
const app = createAuthRoutes(auth);

beforeAll(async () => {
  const migration = readFileSync(
    new URL("../drizzle/0010_better_auth.sql", import.meta.url),
    "utf8",
  );
  await client.exec(migration);
}, 30000);
afterAll(async () => {
  await client.close();
});

// keep response cookies just as an API client's cookie jar would
class ApiClient {
  cookies = new Map<string, string>();

  /**
   * Combine the test client's stored cookies into a request header.
   *
   * @returns Cookie name/value pairs separated by semicolons.
   */
  cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  /**
   * Send a GET or JSON POST request and update the test client's cookie jar.
   *
   * @param path - API path relative to the test origin.
   * @param body - Optional JSON body; supplying it selects POST.
   * @returns The application response, with returned cookies retained for later requests.
   */
  async request(path: string, body?: unknown): Promise<Response> {
    const response = await app.request(`${baseURL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: baseURL,
        Cookie: this.cookieHeader(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
}

const credentials = { name: "Ash", email: "ash@example.com", password: "Pikachu-Test-123!" };

test("sign-up, session identity, sign-out, and sign-in work through API requests", async () => {
  const api = new ApiClient();
  expect((await api.request("/me")).status).toBe(401);

  const signup = await api.request("/api/auth/sign-up/email", credentials);
  expect(signup.status).toBe(200);
  const registered = await signup.json();
  expect(typeof registered.user.id).toBe("string");
  expect(signup.headers.getSetCookie().some((cookie) => /httponly/i.test(cookie))).toBe(true);

  const [loginAccount] = await db
    .select()
    .from(schema.account)
    .where(eq(schema.account.userId, registered.user.id));
  expect(loginAccount.providerId).toBe("credential");
  expect(loginAccount.password).toBeTruthy();
  expect(loginAccount.password).not.toBe(credentials.password);

  const me = await api.request("/me");
  expect(me.status).toBe(200);
  expect(me.headers.get("cache-control")).toBe("no-store");
  const identity = await me.json();
  expect(identity.user.id).toBe(registered.user.id);
  expect(identity.user.name).toBe("Ash");
  expect(identity.session.token).toBeUndefined();
  expect(identity.user.password).toBeUndefined();
  expect((await api.request("/api/auth/get-session")).status).toBe(200);

  const oldCookie = api.cookieHeader();
  expect((await api.request("/api/auth/sign-out", {})).status).toBe(200);
  expect((await api.request("/me")).status).toBe(401);
  expect((await app.request(`${baseURL}/me`, { headers: { Cookie: oldCookie } })).status).toBe(401);

  const incorrect = await api.request("/api/auth/sign-in/email", {
    email: credentials.email,
    password: "Incorrect-password!",
  });
  expect(incorrect.status).toBe(401);
  expect((await api.request("/me")).status).toBe(401);

  expect((await api.request("/api/auth/sign-in/email", credentials)).status).toBe(200);
  expect((await (await api.request("/me")).json()).user.id).toBe(registered.user.id);
  await api.request("/api/auth/sign-out", {});
}, 30000);

test("rejects invalid signup input and duplicate email", async () => {
  const api = new ApiClient();
  const duplicate = { ...credentials, email: "duplicate@example.com" };
  expect((await api.request("/api/auth/sign-up/email", duplicate)).status).toBe(200);
  expect(
    (await api.request("/api/auth/sign-up/email", { ...credentials, email: "invalid" })).status,
  ).toBeGreaterThanOrEqual(400);
  expect(
    (
      await api.request("/api/auth/sign-up/email", {
        ...credentials,
        email: "weak@example.com",
        password: "short",
      })
    ).status,
  ).toBeGreaterThanOrEqual(400);
  expect((await api.request("/api/auth/sign-up/email", duplicate)).status).toBeGreaterThanOrEqual(
    400,
  );
});

test("expired and tampered cookies cannot identify a user", async () => {
  const api = new ApiClient();
  expect(
    (
      await api.request("/api/auth/sign-up/email", {
        ...credentials,
        email: "expired@example.com",
      })
    ).status,
  ).toBe(200);
  const current = await (await api.request("/me")).json();
  await db
    .update(schema.session)
    .set({ expiresAt: new Date(0) })
    .where(eq(schema.session.id, current.session.id));
  expect((await api.request("/me")).status).toBe(401);
  expect(
    (
      await app.request(`${baseURL}/me`, {
        headers: { Cookie: "better-auth.session_token=tampered" },
      })
    ).status,
  ).toBe(401);
});

test("untrusted origins are rejected for auth mutations", async () => {
  const response = await app.request(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  expect(response.status).toBe(403);
});
