import { Hono } from "hono";
import type { AppDatabase } from "../db/types";
import type { PokemonService } from "../services/pokemon";
import { pokemonIdentifier } from "../validation/fight";
import {
  battleBonus,
  incomingMultiplier,
  typeMultiplierAgainstTypes,
} from "../utils/type-matchups";

/**
 * Register Pokemon detail and encounter-region handlers under /pokemon.
 *
 * @param database - Database used to read encounter relationships and completion markers.
 * @param service - Shared Pokemon, type-chart, and resource-list helpers.
 * @returns Relative /:identifier and /:identifier/regions routes.
 */
export function createPokemonRoutes(database: AppDatabase, service: PokemonService) {
  const routes = new Hono();
  const { findOrCachePokemon, getResourceNames, getTypeFromPokeApi } = service;
  // visiting one pokemon fills its region cache, including older pokemon saved before this migration
  routes.get("/:identifier/regions", async (c) => {
    const identifier = pokemonIdentifier.safeParse(c.req.param("identifier"));
    if (!identifier.success)
      return c.json({ error: "Provide a valid pokemon name or positive ID" }, 400);
    const entry = await findOrCachePokemon(identifier.data);
    const links = await database.query.pokemonEncounter.findMany({
      where: (link, { eq }) => eq(link.pokemonId, entry.id),
      with: { area: { columns: { regionName: true } } },
    });
    return c.json({
      pokemon: entry.name,
      regions: [...new Set(links.map((link) => link.area.regionName))].sort(),
    });
  });

  // show the stats, type matchups, and known encounter regions for one pokemon
  // the attack examples use a single defending type, while real battles may use two
  routes.get("/:identifier", async (c) => {
    const identifier = pokemonIdentifier.safeParse(c.req.param("identifier"));
    if (!identifier.success)
      return c.json({ error: "Provide a valid pokemon name or positive ID" }, 400);
    const entry = await findOrCachePokemon(identifier.data);

    const typeNames = await getResourceNames("type");
    const defendingCharts = await Promise.all(entry.types.map(getTypeFromPokeApi));
    // Load the cache-completion marker and related encounter areas together.
    const cachedRow = await database.query.pokemon.findFirst({
      where: (row, { eq }) => eq(row.id, entry.id),
      columns: { regionsCachedAt: true },
      with: {
        encounters: { with: { area: { columns: { regionName: true } } } },
      },
    });
    const regions = [
      ...new Set((cachedRow?.encounters ?? []).map((link) => link.area.regionName)),
    ].sort();
    const totalStats = Object.values(entry.stats).reduce((sum, value) => sum + value, 0);

    // incoming effectiveness asks how each attacking type affects this pokemon
    const defense = typeNames.map((name) => ({
      type: name,
      multiplier: incomingMultiplier(name, defendingCharts),
    }));
    // outgoing examples apply the scoring rule to one defending type at a time
    const attackAgainstSingleType = typeNames.map((name) => {
      const multiplier = typeMultiplierAgainstTypes(entry, [name]);
      const bonus = battleBonus(multiplier);
      return { type: name, multiplier, bonus, potentialScore: totalStats + bonus };
    });
    return c.json({
      id: entry.id,
      name: entry.name,
      stats: entry.stats,
      totalStats,
      types: entry.types,
      defense: {
        weakTo: defense.filter((item) => item.multiplier > 1),
        resists: defense.filter((item) => item.multiplier > 0 && item.multiplier < 1),
        immuneTo: defense.filter((item) => item.multiplier === 0),
      },
      attackAgainstSingleType,
      regions,
      // an empty region list is meaningful only after the encounter lookup finished
      regionsComplete: cachedRow?.regionsCachedAt != null,
      note: "Potential scores use this project's simple base-stat and type-bonus rule against one defending type, not official battle damage",
    });
  });

  return routes;
}
