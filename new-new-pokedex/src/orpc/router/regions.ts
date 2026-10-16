import z from "zod";
import { publicProcedure } from "../procedures";
import { getResourceNames } from "../utils/pokemon";
import { encounterArea, pokemon, pokemonEncounter } from "#/db/schema";
import { eq } from "drizzle-orm";

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase() ?? "";
}

export const all = publicProcedure.handler(async () => {
  const names = await getResourceNames("region");
  return { count: names.length, regions: names, source: "database" };
});

export const search = publicProcedure
  .input(z.object({ region: z.string() }))
  .handler(async ({ input, context }) => {
    const name = normalizeIdentifier(input.region);

    const rows = await context.db
      .select({ name: pokemon.name })
      .from(pokemonEncounter)
      .innerJoin(encounterArea, eq(pokemonEncounter.encounterAreaId, encounterArea.id))
      .innerJoin(pokemon, eq(pokemonEncounter.pokemonId, pokemon.id))
      .where(eq(encounterArea.regionName, name));
    // one pokemon can have many areas in the region, so show its name once
    const names = [...new Set(rows.map((row) => row.name))].sort((a, b) => a.localeCompare(b));
    return {
      region: name,
      count: names.length,
      pokemon: names,
      scope: "cached pokemon with PokeAPI wild encounters",
    };
  });
