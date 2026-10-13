import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { db } from "../db";
import type { PokemonService } from "../services/pokemon";
import { pokemon, pokemonType } from "../db/schema/pokemon";

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

/** List types and search cached Pokemon relative to /api/types. */
export function createTypeRoutes(database: typeof db, service: PokemonService) {
  const routes = new Hono();
  routes.get("/", async (c) => {
    const names = await service.getResourceNames("type");
    return c.json({ count: names.length, types: names, source: "database" });
  });

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
