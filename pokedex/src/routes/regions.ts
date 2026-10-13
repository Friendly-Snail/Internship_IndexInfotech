import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/types";
import type { PokemonService } from "../services/pokemon";
import { pokemon, pokemonEncounter, encounterArea } from "../db/schema/pokemon";

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

/** List regions and search cached Pokemon relative to /api/regions. */
export function createRegionRoutes(database: AppDatabase, service: PokemonService) {
  const routes = new Hono();
  routes.get("/", async (c) => {
    const names = await service.getResourceNames("region");
    return c.json({ count: names.length, regions: names, source: "database" });
  });

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
