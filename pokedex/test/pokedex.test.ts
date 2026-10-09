import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { authOptions } from "../src/auth/config";
import * as authSchema from "../src/db/schema/auth-schema";
import { createAuthRoutes } from "../src/routes/auth";
import { createPokedexRoutes } from "../src/routes/pokedex";
import * as schema from "../src/db/schema";

// Real SQL and Better Auth cookies, isolated from DATABASE_URL and PokeAPI
const client = new PGlite();
const db = drizzle(client, { schema });
const baseURL = "http://localhost:3000";
const auth = betterAuth({
  ...authOptions,
  baseURL,
  secret: crypto.randomUUID() + crypto.randomUUID(),
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema, transaction: true }),
});
let lookups = 0;
const app = new Hono();
app.route("/", createAuthRoutes(auth));
app.route(
  "/pokedex",
  createPokedexRoutes(auth, db, async (identifier) => {
    lookups++;
    const [entry] = await db
      .select({ id: schema.pokemon.id, name: schema.pokemon.name })
      .from(schema.pokemon)
      .where(
        /^[0-9]+$/.test(identifier)
          ? eq(schema.pokemon.id, Number(identifier))
          : eq(schema.pokemon.name, identifier),
      );
    if (!entry) throw new HTTPException(404);
    return entry;
  }),
);

class Trainer {
  cookie = "";
  id = "";
  /**
   * Send a trainer request while retaining any returned session cookies.
   *
   * @param path - API path relative to the test origin.
   * @param method - HTTP method; defaults to GET.
   * @param body - Optional JSON request body.
   * @param origin - Origin header; an empty value omits it for rejection tests.
   * @returns The application response.
   */
  async request(path: string, method = "GET", body?: unknown, origin = baseURL) {
    const response = await app.request(`${baseURL}${path}`, {
      method,
      headers: {
        Cookie: this.cookie,
        ...(origin ? { Origin: origin } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) this.cookie = cookies.map((cookie) => cookie.split(";")[0]).join("; ");
    return response;
  }
  /**
   * Create and sign in a test trainer, retaining its ID and session cookie.
   *
   * @param name - Trainer name also used to create a unique test email.
   * @returns A promise that resolves after the successful signup assertion.
   */
  async signup(name: string) {
    const response = await this.request("/api/auth/sign-up/email", "POST", {
      name,
      email: `${name}@example.com`,
      password: "Pikachu-Test-123!",
    });
    expect(response.status).toBe(200);
    this.id = (await response.json()).user.id;
  }
}
const ash = new Trainer();
const misty = new Trainer();

beforeAll(async () => {
  const journal = JSON.parse(
    readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  // Apply the old migrations first and seed existing data before the new one.
  for (const entry of journal.entries.slice(0, -1)) {
    await client.exec(
      readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"),
    );
  }
  await db.insert(schema.pokemon).values([
    {
      id: 25,
      name: "pikachu",
      hp: 35,
      attack: 55,
      defense: 40,
      specialAttack: 50,
      specialDefense: 50,
      speed: 90,
    },
    {
      id: 7,
      name: "squirtle",
      hp: 44,
      attack: 48,
      defense: 65,
      specialAttack: 50,
      specialDefense: 64,
      speed: 43,
    },
  ]);
  await ash.signup("ash");
  await misty.signup("misty");
  await client.exec(
    readFileSync(new URL("../drizzle/0011_pokedex_ownership.sql", import.meta.url), "utf8"),
  );
}, 30000);
afterAll(async () => {
  await client.close();
});

test("ownership migration preserves existing users and cached Pokemon", async () => {
  expect(await db.select().from(schema.user)).toHaveLength(2);
  expect(await db.select().from(schema.pokemon)).toHaveLength(2);
  expect(await db.select().from(schema.pokedex)).toHaveLength(0);
});

test("anonymous and tampered sessions cannot read or change ownership", async () => {
  const anonymous = new Trainer();
  const before = lookups;
  for (const cookie of ["", "better-auth.session_token=tampered"]) {
    anonymous.cookie = cookie;
    expect((await anonymous.request("/pokedex")).status).toBe(401);
    expect((await anonymous.request("/pokedex", "POST", { pokemon: "pikachu" })).status).toBe(401);
    expect((await anonymous.request("/pokedex/25", "DELETE")).status).toBe(401);
  }
  expect(lookups).toBe(before);
});

test("two trainers have private lists and independent ownership of the same Pokemon", async () => {
  expect((await ash.request("/pokedex", "POST", { pokemon: " PIKACHU " })).status).toBe(201);
  expect((await ash.request("/pokedex", "POST", { pokemon: "25" })).status).toBe(409);
  const empty = await misty.request(`/pokedex?userId=${ash.id}`);
  expect((await empty.json()).entries).toHaveLength(0);
  // Misty cannot delete Ash's entry by supplying his ID in a query string.
  expect((await misty.request(`/pokedex/25?userId=${ash.id}`, "DELETE")).status).toBe(404);
  expect((await misty.request("/pokedex", "POST", { pokemon: "pikachu" })).status).toBe(201);
  expect(await db.select().from(schema.pokedex)).toHaveLength(2);
  const ashList = await ash.request("/pokedex");
  expect(ashList.headers.get("cache-control")).toBe("no-store");
  const list = await ashList.json();
  expect(list.count).toBe(1);
  expect(list.entries[0].pokemon).toEqual({ id: 25, name: "pikachu" });
  expect(list.entries[0].addedAt).toBeTruthy();
  expect((await misty.request("/pokedex/25", "DELETE")).status).toBe(200);
  expect((await misty.request("/pokedex/25", "DELETE")).status).toBe(404);
  expect((await (await ash.request("/pokedex")).json()).count).toBe(1);
  expect(await db.select().from(schema.pokemon)).toHaveLength(2);
});

test("rejects spoofed identity, malformed input, and unknown Pokemon", async () => {
  const before = lookups;
  for (const body of [
    { pokemon: "pikachu", userId: misty.id },
    { pokemon: "" },
    { pokemon: 25 },
    {},
  ]) {
    expect((await ash.request("/pokedex", "POST", body)).status).toBe(400);
  }
  expect(lookups).toBe(before);
  for (const id of ["pikachu", "0", "-1", "1.5", "2147483648"]) {
    expect((await ash.request(`/pokedex/${id}`, "DELETE")).status).toBe(400);
  }
  expect((await ash.request("/pokedex", "POST", { pokemon: "missingno" })).status).toBe(404);
});

test("mutations reject missing and untrusted origins before calling the cache", async () => {
  const before = lookups;
  for (const origin of ["", "https://untrusted.example"]) {
    expect((await ash.request("/pokedex", "POST", { pokemon: "squirtle" }, origin)).status).toBe(
      403,
    );
    expect((await ash.request("/pokedex/25", "DELETE", undefined, origin)).status).toBe(403);
  }
  expect(lookups).toBe(before);
  expect((await (await ash.request("/pokedex")).json()).count).toBe(1);
});

test("simultaneous duplicate adds create only one entry and list order is stable", async () => {
  const responses = await Promise.all([
    ash.request("/pokedex", "POST", { pokemon: "squirtle" }),
    ash.request("/pokedex", "POST", { pokemon: "7" }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(
    (await (await ash.request("/pokedex")).json()).entries.map(
      (entry: { pokemon: { id: number } }) => entry.pokemon.id,
    ),
  ).toEqual([7, 25]);
});

test("foreign keys reject orphan ownership and deleting a user clears their entries", async () => {
  await expect(
    db.insert(schema.pokedex).values({ userId: "nonexistent", pokemonId: 25 }).execute(),
  ).rejects.toThrow();
  await expect(
    db.insert(schema.pokedex).values({ userId: ash.id, pokemonId: 999 }).execute(),
  ).rejects.toThrow();
  const temporary = new Trainer();
  await temporary.signup("temporary");
  expect((await temporary.request("/pokedex", "POST", { pokemon: "pikachu" })).status).toBe(201);
  await db.delete(schema.user).where(eq(schema.user.id, temporary.id));
  expect(
    await db.select().from(schema.pokedex).where(eq(schema.pokedex.userId, temporary.id)),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(schema.pokedex)
      .where(and(eq(schema.pokedex.userId, ash.id), eq(schema.pokedex.pokemonId, 25))),
  ).toHaveLength(1);
  expect((await temporary.request("/pokedex")).status).toBe(401);
});

test("sign-out revokes access to ownership", async () => {
  const oldCookie = ash.cookie;
  expect((await ash.request("/api/auth/sign-out", "POST", {})).status).toBe(200);
  ash.cookie = oldCookie;
  expect((await ash.request("/pokedex")).status).toBe(401);
  expect((await ash.request("/pokedex/25", "DELETE")).status).toBe(401);
});
