import z from "zod";
import { publicProcedure } from "../procedures";
import { battleBonus, findOrCachePokemon, typeMultiplierAgainstTypes } from "../utils/battles";
import { getResourceNames, getTypeFromPokeApi, incomingMultiplier } from "../utils/pokemon";
import { pokemonIdentifier } from "../schema";

export const regions = publicProcedure
  .input(z.object({ pokemonId: pokemonIdentifier }))
  .handler(async ({ input, context }) => {
    const entry = await findOrCachePokemon(input.pokemonId);
    const links = await context.db.query.pokemonEncounter.findMany({
      where: {
        pokemonId: entry.id,
      },
      with: { area: { columns: { regionName: true } } },
    });
    return {
      pokemon: entry.name,
      regions: [...new Set(links.map((link) => link.area.regionName))].sort(),
    };
  });

export const byId = publicProcedure
  .input(z.object({ pokemonId: pokemonIdentifier }))
  .handler(async ({ input, context }) => {
    const entry = await findOrCachePokemon(input.pokemonId);

    const typeNames = await getResourceNames("type");
    const defendingCharts = await Promise.all(entry.types.map(getTypeFromPokeApi));
    // Load the cache-completion marker and related encounter areas together.
    const cachedRow = await context.db.query.pokemon.findFirst({
      where: {
        id: entry.id,
      },
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
      regions,
      // an empty region list is meaningful only after the encounter lookup finished
      regionsComplete: cachedRow?.regionsCachedAt != null,
      note: "Potential scores use this project's simple base-stat and type-bonus rule against one defending type, not official battle damage",
    };
  });
