import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { HTTPException } from "hono/http-exception";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth/config";
import { createPokemonService } from "../src/services/pokemon";
import { pokeApi } from "../src/api/pokeapi";
import * as schema from "../src/db/schema/pokemon";

const client = new PGlite();
const database = drizzle(client, { schema });
const baseURL = "http://localhost:3000";
const auth = createAuth(database, { baseURL, secret: crypto.randomUUID() + crypto.randomUUID() });
// unexpected upstream calls fail locally rather than contacting the real PokeAPI
const upstream = pokeApi.extend({
  fetch: async () => {
    throw new Error("Unexpected upstream request");
  },
});
const service = createPokemonService(database, upstream);
const app = createApp(auth, database, service);
/**
 * Send a JSON fight request to the isolated test application.
 *
 * @param body - The request body, including invalid cases under test.
 * @returns The response from POST /fight.
 */
const post = (body: unknown) =>
  app.request("/fight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  const journal = JSON.parse(
    readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  for (const entry of journal.entries) {
    await client.exec(
      readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"),
    );
  }
  await database.insert(schema.pokemonElementType).values({ name: "normal" });
  for (const [index, name] of ["pikachu", "bulbasaur", "squirtle", "charmander"].entries()) {
    await database.insert(schema.pokemon).values({
      id: index + 1,
      name,
      hp: 50,
      attack: 50,
      defense: 50,
      specialAttack: 50,
      specialDefense: 50,
      speed: 50,
      regionsCachedAt: new Date(),
    });
    await database
      .insert(schema.pokemonType)
      .values({ pokemonId: index + 1, typeName: "normal", slot: 1 });
  }
  await database.insert(schema.region).values({ name: "kanto" });
  await database.insert(schema.resourceListCache).values([
    { resource: "type", cachedAt: new Date() },
    { resource: "region", cachedAt: new Date() },
  ]);
}, 30000);
afterAll(() => client.close());

test("assembled battle routes retain validation, unequal teams, ties, and saved history", async () => {
  expect((await post({ team1: [], team2: ["pikachu"] })).status).toBe(400);
  expect((await post({ team1: ["pikachu"], team2: ["1"] })).status).toBe(400);
  const tieResponse = await post({ team1: ["pikachu"], team2: ["bulbasaur"] });
  expect(tieResponse.status).toBe(200);
  expect((await tieResponse.json()).result).toBe("TIE");
  const unequal = await post({
    team1: ["pikachu"],
    team2: ["bulbasaur", "squirtle", "charmander"],
  });
  expect(unequal.status).toBe(200);
  const battle = await unequal.json();
  expect(battle.result).toBe("TEAM2_WIN");
  expect(battle.team2.pokemon).toHaveLength(3);
  const history = await (await app.request("/battles")).json();
  expect(history.count).toBe(2);
  expect(history.battles[0].id).toBe(battle.battleId);
  expect(history.battles[0].team2.pokemon.map((p: { position: number }) => p.position)).toEqual([
    1, 2, 3,
  ]);
});

test("search and resource routes keep original URLs and database responses", async () => {
  expect((await app.request("/search-by-type")).status).toBe(400);
  expect((await app.request("/search-by-region")).status).toBe(400);
  expect((await (await app.request("/search-by-type?type=%20NORMAL%20")).json()).count).toBe(4);
  expect((await (await app.request("/search-by-region?region=kanto")).json()).pokemon).toEqual([]);
  expect(await (await app.request("/types")).json()).toEqual({
    count: 1,
    types: ["normal"],
    source: "database",
  });
  expect(await (await app.request("/regions")).json()).toEqual({
    count: 1,
    regions: ["kanto"],
    source: "database",
  });
});

test("Pokemon prefix preserves parameter validation and nested regions route", async () => {
  expect((await app.request("/pokemon/0")).status).toBe(400);
  expect((await app.request("/pokemon/0/regions")).status).toBe(400);
  expect(await (await app.request("/pokemon/pikachu/regions")).json()).toEqual({
    pokemon: "pikachu",
    regions: [],
  });
  const chartClient = pokeApi.extend({
    fetch: async () =>
      Response.json({
        damage_relations: {
          double_damage_from: [],
          half_damage_from: [],
          no_damage_from: [],
        },
      }),
  });
  const detailApp = createApp(auth, database, createPokemonService(database, chartClient));
  const response = await detailApp.request("/pokemon/pikachu");
  expect(response.status).toBe(200);
  const detail = await response.json();
  expect(detail.totalStats).toBe(300);
  expect(detail.regionsComplete).toBe(true);
  expect(detail.stats["special-attack"]).toBe(50);
});

test("private middleware stays scoped and shared error handling reaches mounted routes", async () => {
  expect((await app.request("/")).status).toBe(200);
  for (const path of ["/me", "/pokedex", "/pokedex/1"]) {
    const response = await app.request(
      path,
      path === "/pokedex/1" ? { method: "DELETE" } : undefined,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  expect(await (await app.request("/missing")).json()).toEqual({ error: "Not Found" });
  const failing = createApp(auth, database, {
    ...service,
    findOrCachePokemon: async () => {
      throw new HTTPException(418, { message: "test exception" });
    },
  });
  expect((await failing.request("/pokemon/pikachu/regions")).status).toBe(418);
  const notFoundClient = pokeApi.extend({
    fetch: async () => new Response("missing", { status: 404 }),
  });
  const missing = createApp(auth, database, createPokemonService(database, notFoundClient));
  const errorResponse = await missing.request("/pokemon/unknown/regions");
  expect(errorResponse.status).toBe(404);
  expect(await errorResponse.json()).toEqual({ error: "Requested resource not found in PokeAPI." });
});
