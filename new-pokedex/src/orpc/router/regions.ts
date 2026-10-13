import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import { encounterArea, pokemon, pokemonEncounter } from "#/db/schema/pokemon";
import { RegionListSchema, RegionSearchSchema } from "#/orpc/schema";
import { pokemonService, publicProcedure } from "../base";

export const list = publicProcedure
  .route({ method: "GET", path: "/regions", tags: ["Resources"], summary: "List every region" })
  .output(RegionListSchema)
  .handler(async () => {
    const names = await pokemonService.getResourceNames("region");
    return { count: names.length, regions: names, source: "database" as const };
  });

// show pokemon with documented wild encounters in the requested region
// only pokemon whose encounter locations have been checked are included
export const search = publicProcedure
  .route({
    method: "GET",
    path: "/regions/region-search",
    tags: ["Resources"],
    summary: "Search cached Pokemon by wild encounter region",
  })
  // query parameters come from user input, so they may be capitalized or padded with spaces
  .input(
    z.object({
      region: z.string().trim().toLowerCase().min(1, "Provide a region using ?region=kanto"),
    }),
  )
  .output(RegionSearchSchema)
  .handler(async ({ input: { region: name } }) => {
    const rows = await db
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
