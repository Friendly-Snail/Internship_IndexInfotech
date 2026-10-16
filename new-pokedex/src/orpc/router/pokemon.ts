import { z } from "zod";
import { db } from "#/db";
import { PokemonDetailSchema, PokemonRegionsSchema } from "#/orpc/schema";
import {
  battleBonus,
  incomingMultiplier,
  typeMultiplierAgainstTypes,
} from "#/utils/type-matchups";
import { pokemonIdentifier } from "#/validation/fight";
import { pokemonService, publicProcedure } from "../base";

const identifierInput = z.object({ identifier: pokemonIdentifier });

// visiting one pokemon fills its region cache, including older pokemon saved before this migration
export const regions = publicProcedure
  .route({
    method: "GET",
    path: "/pokemon/{identifier}/regions",
    tags: ["Pokemon"],
    summary: "List a Pokemon's wild encounter regions",
  })
  .input(identifierInput)
  .output(PokemonRegionsSchema)
  .handler(async ({ input }) => {
    const entry = await pokemonService.findOrCachePokemon(input.identifier);
    const links = await db.query.pokemonEncounter.findMany({
      where: (link, { eq }) => eq(link.pokemonId, entry.id),
      with: { area: { columns: { regionName: true } } },
    });
    return {
      pokemon: entry.name,
      regions: [...new Set(links.map((link) => link.area.regionName))].sort(),
    };
  });

// show the stats, type matchups, and known encounter regions for one pokemon
// the attack examples use a single defending type, while real battles may use two
export const get = publicProcedure
  .route({
    method: "GET",
    path: "/pokemon/{identifier}",
    tags: ["Pokemon"],
    summary: "Show a Pokemon's stats, types, effectiveness, and regions",
  })
  .input(identifierInput)
  .output(PokemonDetailSchema)
  .handler(async ({ input }) => {
    const { findOrCachePokemon, getResourceNames, getTypeFromPokeApi } = pokemonService;
    const entry = await findOrCachePokemon(input.identifier);

    const typeNames = await getResourceNames("type");
    const defendingCharts = await Promise.all(entry.types.map(getTypeFromPokeApi));
    // Load the cache-completion marker and related encounter areas together.
    const cachedRow = await db.query.pokemon.findFirst({
      where: (row, { eq }) => eq(row.id, entry.id),
      columns: { regionsCachedAt: true },
      with: {
        encounters: { with: { area: { columns: { regionName: true } } } },
      },
    });
    const regionNames = [
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
    return {
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
      regions: regionNames,
      // an empty region list is meaningful only after the encounter lookup finished
      regionsComplete: cachedRow?.regionsCachedAt != null,
      note: "Potential scores use this project's simple base-stat and type-bonus rule against one defending type, not official battle damage",
    };
  });
