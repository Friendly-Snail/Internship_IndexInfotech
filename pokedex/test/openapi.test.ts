import { afterAll, beforeAll, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { createPokemonService } from "../src/services/pokemon";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { OpenAPIObject, OperationObject, ResponseObject } from "openapi3-ts/oas31";
import { createAuth } from "../src/auth/config";
import { createAuthRoutes } from "../src/routes/auth";
import { createDocsRoutes } from "../src/routes/docs";
import { createPokedexRoutes } from "../src/routes/pokedex";
import { createOpenApiDocument } from "../src/docs/openapi";
import * as schema from "../src/db/schema";

// Separate PostgreSQL and cookies; no real DATABASE_URL or PokeAPI requests.
const client = new PGlite();
const db = drizzle(client, { schema });
const baseURL = "http://localhost:3000";
const auth = createAuth(db, { baseURL, secret: crypto.randomUUID() + crypto.randomUUID() });
const app = new Hono();
app.route("/", createDocsRoutes(auth));
app.route("/", createAuthRoutes(auth));
app.route(
  "/pokedex",
  createPokedexRoutes(auth, db, async () => ({ id: 25, name: "pikachu" })),
);
let document: OpenAPIObject;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

beforeAll(async () => {
  // Request documentation before any tables exist: docs do not query the DB.
  const response = await app.request(`${baseURL}/openapi.json`);
  expect(response.status).toBe(200);
  document = await response.json();
  const journal = JSON.parse(
    readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  for (const entry of journal.entries) {
    await client.exec(
      readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"),
    );
  }
  await db.insert(schema.pokemon).values({
    id: 25,
    name: "pikachu",
    hp: 35,
    attack: 55,
    defense: 40,
    specialAttack: 50,
    specialDefense: 50,
    speed: 90,
  });
}, 30000);
afterAll(async () => {
  await client.close();
});

/**
 * Find one operation in the generated OpenAPI document.
 *
 * @param path - The documented URL path.
 * @param method - The documented HTTP method.
 * @returns The operation definition used by response assertions.
 */
function operation(path: string, method: "get" | "post" | "delete"): OperationObject {
  return document.paths![path]![method]!;
}

/**
 * Check a real JSON response against the schema for its path, method, and status.
 *
 * @param response - The response returned by the test application.
 * @param path - The documented path.
 * @param method - The request method.
 * @returns The parsed response body after its schema assertions pass.
 */
async function checkResponse(response: Response, path: string, method: "get" | "post" | "delete") {
  const documented = operation(path, method).responses![String(response.status)] as ResponseObject;
  expect(documented).toBeDefined();
  const responseSchema = documented.content!["application/json"].schema!;
  // Local $refs resolve into the same components used by Swagger UI.
  const validate = ajv.compile({ ...responseSchema, components: document.components });
  const body = await response.json();
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  return body;
}

test("OpenAPI validates with all refs resolved and covers the Hono endpoints", async () => {
  await SwaggerParser.validate(JSON.parse(JSON.stringify(document)));
  const assembled = createApp(auth, db, createPokemonService(db));
  for (const route of assembled.routes) {
    if (!["GET", "POST", "DELETE"].includes(route.method)) continue;
    const path = route.path.replace(/:([A-Za-z]+)/g, "{$1}");
    expect(
      document.paths?.[path]?.[route.method.toLowerCase() as "get" | "post" | "delete"],
    ).toBeDefined();
  }
  for (const path of [
    "/docs",
    "/openapi.json",
    "/me",
    "/pokedex",
    "/pokedex/{pokemonId}",
    "/api/auth/sign-up/email",
    "/api/auth/sign-in/email",
    "/api/auth/sign-out",
    "/api/auth/get-session",
  ]) {
    expect(document.paths?.[path]).toBeDefined();
  }
  const ids: string[] = [];
  for (const item of Object.values(document.paths!)) {
    for (const method of ["get", "post", "delete"] as const) {
      if (item?.[method]) ids.push(item[method]!.operationId!);
    }
  }
  expect(new Set(ids).size).toBe(ids.length);
});

test("all documented response examples match their schemas", () => {
  for (const item of Object.values(document.paths!)) {
    for (const method of ["get", "post", "delete"] as const) {
      for (const response of Object.values(item?.[method]?.responses ?? {})) {
        if ("$ref" in response) continue;
        const content = response.content?.["application/json"];
        if (content?.example === undefined) continue;
        const validate = ajv.compile({ ...content.schema, components: document.components });
        expect(validate(content.example), JSON.stringify(validate.errors)).toBe(true);
      }
    }
  }
});

test("Swagger UI points at the local contract and uses browser cookies", async () => {
  const response = await app.request(`${baseURL}/docs`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  const html = await response.text();
  expect(html).toContain("/openapi.json");
  expect(html).toMatch(/withCredentials\s*:\s*true/);
  expect(html).toContain("validatorUrl: ''");
});

test("security, status codes, team limits, and historical nullability are explicit", async () => {
  expect(document.security).toEqual([]);
  expect(operation("/fight", "post").security).toBeUndefined();
  expect(operation("/pokedex", "get").security).toEqual([{ trainerSession: [] }]);
  expect(operation("/me", "get").security).toEqual([{ trainerSession: [] }]);
  expect(operation("/api/auth/sign-in/email", "post").security).toEqual([]);
  expect(operation("/api/auth/get-session", "get").security).toContainEqual({});
  const add = operation("/pokedex", "post");
  expect(add.responses?.["409"]).toBeDefined();
  expect(add.responses?.["403"]).toBeDefined();
  expect(operation("/api/auth/sign-up/email", "post").responses?.["422"]).toBeDefined();
  const cookie = document.components!.securitySchemes!.trainerSession;
  expect(cookie).toMatchObject({ type: "apiKey", in: "cookie", name: "better-auth.session_token" });
  const secureAuth = createAuth(db, {
    baseURL: "https://pokemon.example",
    secret: crypto.randomUUID() + crypto.randomUUID(),
  });
  const secureDocument = await createOpenApiDocument(secureAuth);
  expect(secureDocument.components!.securitySchemes!.trainerSession).toMatchObject({
    name: "__Secure-better-auth.session_token",
  });
  const validate = ajv.compile({
    $ref: "#/components/schemas/FightRequest",
    components: document.components,
  });
  expect(validate({ team1: ["pikachu"], team2: ["squirtle", "charmander", "bulbasaur"] })).toBe(
    true,
  );
  expect(validate({ team1: [], team2: ["pikachu"] })).toBe(false);
  expect(validate({ team1: Array(5).fill("pikachu"), team2: ["squirtle"] })).toBe(false);
  const historical = ajv.compile({
    $ref: "#/components/schemas/HistoryMember",
    components: document.components,
  });
  expect(
    historical({
      position: 1,
      id: 25,
      name: "pikachu",
      battleScore: 320,
      totalStats: null,
      speed: null,
      typeMultiplier: null,
    }),
  ).toBe(true);
});

test("documented auth and ownership responses match real handlers", async () => {
  /**
   * Send an auth or ownership request with explicit cookies and origin.
   *
   * @param path - API path.
   * @param method - HTTP method, defaulting to GET.
   * @param body - Optional JSON body.
   * @param cookie - Session cookie header value.
   * @param origin - Origin header, omitted when empty.
   * @returns The application response.
   */
  const request = (
    path: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    body?: unknown,
    cookie = "",
    origin = baseURL,
  ) =>
    app.request(`${baseURL}${path}`, {
      method,
      headers: {
        Cookie: cookie,
        ...(origin ? { Origin: origin } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  await checkResponse(await request("/me"), "/me", "get");
  await checkResponse(await request("/api/auth/get-session"), "/api/auth/get-session", "get");
  const credentials = { name: "Docs", email: "docs@example.com", password: "Pikachu-Test-123!" };
  const signup = await request("/api/auth/sign-up/email", "POST", credentials);
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  await checkResponse(signup, "/api/auth/sign-up/email", "post");
  await checkResponse(
    await request("/api/auth/sign-up/email", "POST", credentials),
    "/api/auth/sign-up/email",
    "post",
  );
  await checkResponse(await request("/me", "GET", undefined, cookie), "/me", "get");
  await checkResponse(
    await request("/api/auth/get-session", "GET", undefined, cookie),
    "/api/auth/get-session",
    "get",
  );
  await checkResponse(
    await request("/pokedex", "POST", { pokemon: "pikachu" }, cookie),
    "/pokedex",
    "post",
  );
  await checkResponse(
    await request("/pokedex", "POST", { pokemon: "pikachu" }, cookie),
    "/pokedex",
    "post",
  );
  await checkResponse(
    await request("/pokedex", "POST", { pokemon: "pikachu", userId: "spoofed" }, cookie),
    "/pokedex",
    "post",
  );
  await checkResponse(
    await request("/pokedex", "POST", { pokemon: "pikachu" }, cookie, ""),
    "/pokedex",
    "post",
  );
  await checkResponse(await request("/pokedex", "GET", undefined, cookie), "/pokedex", "get");
  await checkResponse(
    await request("/pokedex/25", "DELETE", undefined, cookie),
    "/pokedex/{pokemonId}",
    "delete",
  );
  await checkResponse(
    await request("/pokedex/25", "DELETE", undefined, cookie),
    "/pokedex/{pokemonId}",
    "delete",
  );
  await checkResponse(
    await request("/api/auth/sign-out", "POST", {}, cookie),
    "/api/auth/sign-out",
    "post",
  );
  await checkResponse(
    await request("/api/auth/sign-out", "POST", {}),
    "/api/auth/sign-out",
    "post",
  );
  await checkResponse(
    await request("/api/auth/sign-in/email", "POST", {
      email: credentials.email,
      password: credentials.password,
    }),
    "/api/auth/sign-in/email",
    "post",
  );
}, 30000);
