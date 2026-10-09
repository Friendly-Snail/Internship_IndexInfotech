import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/types";
import { pokemon, pokemonType, pokemonEncounter, encounterArea } from "../db/schema/pokemon";

// query parameters come from user input, so they may be missing, capitalized, or padded with spaces
// normalizing them gives the rest of the program one predictable lowercase identifier to work with
/**
 * Trim and lowercase a query value, treating a missing value as empty.
 *
 * @param value - The untrusted query parameter.
 * @returns A normalized identifier or an empty string.
 */
function normalizeIdentifier(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/** Register the type search relative to /api/types. */
export function createTypeSearchRoutes(database: AppDatabase) {
  const routes = new Hono();
  // GET /api/types/type-search?type=water
  // search the cached pokemon by their type rows
  // this list grows as fights cache more pokemon, so it is not the full pokeapi roster
  routes.get("/type-search", async (c) => {
    const type = normalizeIdentifier(c.req.query("type"));
    if (!type) return c.json({ error: "Provide a Pokemon type using ?type=fire" }, 400);
    const rows = await database
      .select({ name: pokemon.name })
      .from(pokemonType)
      .innerJoin(pokemon, eq(pokemonType.pokemonId, pokemon.id))
      .where(eq(pokemonType.typeName, type));
    const names = rows.map((row) => row.name).sort((a, b) => a.localeCompare(b));
    return c.json({ type, count: names.length, pokemon: names, scope: "cached pokemon" });
  });

  return routes;
}

/** Register the encounter-region search relative to /api/regions. */
export function createRegionSearchRoutes(database: AppDatabase) {
  const routes = new Hono();
  // show pokemon with documented wild encounters in the requested region
  // only pokemon whose encounter locations have been checked are included
  routes.get("/region-search", async (c) => {
    const name = normalizeIdentifier(c.req.query("region"));
    if (!name) return c.json({ error: "Provide a region using ?region=kanto" }, 400);
    const rows = await database
      .select({ name: pokemon.name })
      .from(pokemonEncounter)
      .innerJoin(encounterArea, eq(pokemonEncounter.encounterAreaId, encounterArea.id))
      .innerJoin(pokemon, eq(pokemonEncounter.pokemonId, pokemon.id))
      .where(eq(encounterArea.regionName, name));
    // one pokemon can have many areas in the region, so show its name once
    const names = [...new Set(rows.map((row) => row.name))].sort((a, b) => a.localeCompare(b));
    return c.json({
      region: name,
      count: names.length,
      pokemon: names,
      scope: "cached pokemon with PokeAPI wild encounters",
    });
  });

  return routes;
}
