import { z } from "zod";
import { eq } from "drizzle-orm";
import { pokemon, pokemonType } from "#/db/schema";
import { publicProcedure } from "../procedures";
import { getResourceNames } from "../utils/pokemon";

export const all = publicProcedure.handler(async () => {
  const types = await getResourceNames("type");
  return { count: types.length, types, source: "database" };
});

export const search = publicProcedure.input(z.object({ type: z.string().trim().toLowerCase().min(1) })).handler(async ({ input, context }) => {
  const rows = await context.db.select({ name: pokemon.name }).from(pokemonType)
    .innerJoin(pokemon, eq(pokemonType.pokemonId, pokemon.id)).where(eq(pokemonType.typeName, input.type));
  const names = [...new Set(rows.map((row) => row.name))].sort();
  return { type: input.type, count: names.length, pokemon: names, scope: "cached pokemon" };
});
