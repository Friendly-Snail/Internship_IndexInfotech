import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import { pokemon, pokemonType } from "#/db/schema/pokemon";
import { TypeListSchema, TypeSearchSchema } from "#/orpc/schema";
import { pokemonService, publicProcedure } from "../base";

export const list = publicProcedure
  .route({ method: "GET", path: "/types", tags: ["Resources"], summary: "List every type" })
  .output(TypeListSchema)
  .handler(async () => {
    const names = await pokemonService.getResourceNames("type");
    return { count: names.length, types: names, source: "database" as const };
  });

// GET /api/types/type-search?type=water
// search the cached pokemon by their type rows
// this list grows as fights cache more pokemon, so it is not the full pokeapi roster
export const search = publicProcedure
  .route({
    method: "GET",
    path: "/types/type-search",
    tags: ["Resources"],
    summary: "Search cached Pokemon by type",
  })
  // query parameters come from user input, so they may be capitalized or padded with spaces
  .input(
    z.object({
      type: z.string().trim().toLowerCase().min(1, "Provide a Pokemon type using ?type=fire"),
    }),
  )
  .output(TypeSearchSchema)
  .handler(async ({ input: { type } }) => {
    const rows = await db
      .select({ name: pokemon.name })
      .from(pokemonType)
      .innerJoin(pokemon, eq(pokemonType.pokemonId, pokemon.id))
      .where(eq(pokemonType.typeName, type));
    const names = rows.map((row) => row.name).sort((a, b) => a.localeCompare(b));
    return { type, count: names.length, pokemon: names, scope: "cached pokemon" };
  });
