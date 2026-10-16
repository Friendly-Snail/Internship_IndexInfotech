import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import { pokedex, pokemon } from "#/db/schema/pokemon";
import { OwnedPokemonSchema, PokedexListSchema, RemovedPokemonSchema } from "#/orpc/schema";
import { pokemonIdentifier } from "#/validation/fight";
import { pokemonService, protectedProcedure, requireAppOrigin } from "../base";

export const addPokemonBody = z.strictObject({ pokemon: pokemonIdentifier });
export const removePokemonParams = z.object({
  pokemonId: pokemonIdentifier
    .refine((value) => /^[1-9][0-9]*$/.test(value), "use the Pokemon ID from your Pokedex")
    .refine((value) => Number(value) <= 2147483647, "Pokemon ID is too large")
    .transform(Number),
});

// private ownership operations are always scoped to the authenticated trainer
const trainerProcedure = protectedProcedure("Sign in to access your Pokedex.");

export const list = trainerProcedure
  .route({ method: "GET", path: "/pokedex", tags: ["Pokedex"], summary: "List your Pokedex" })
  .output(PokedexListSchema)
  .handler(async ({ context }) => {
    const entries = await db
      .select({ pokemon: { id: pokemon.id, name: pokemon.name }, addedAt: pokedex.addedAt })
      .from(pokedex)
      .innerJoin(pokemon, eq(pokedex.pokemonId, pokemon.id))
      .where(eq(pokedex.userId, context.session.user.id))
      .orderBy(asc(pokemon.id));
    return { count: entries.length, entries };
  });

export const add = trainerProcedure
  .use(requireAppOrigin)
  .route({
    method: "POST",
    path: "/pokedex/create",
    successStatus: 201,
    tags: ["Pokedex"],
    summary: "Add a Pokemon to your Pokedex",
  })
  .input(addPokemonBody)
  .output(OwnedPokemonSchema)
  .handler(async ({ context, input }) => {
    const cached = await pokemonService.findOrCachePokemon(input.pokemon);
    // the composite key handles simultaneous adds as well as repeated requests
    const [entry] = await db
      .insert(pokedex)
      .values({ userId: context.session.user.id, pokemonId: cached.id })
      .onConflictDoNothing({ target: [pokedex.userId, pokedex.pokemonId] })
      .returning({ addedAt: pokedex.addedAt });
    if (!entry) {
      throw new ORPCError("CONFLICT", { message: "This Pokemon is already in your Pokedex." });
    }
    return { pokemon: { id: cached.id, name: cached.name }, addedAt: entry.addedAt };
  });

export const remove = trainerProcedure
  .use(requireAppOrigin)
  .route({
    method: "DELETE",
    path: "/pokedex/{pokemonId}",
    tags: ["Pokedex"],
    summary: "Remove a Pokemon from your Pokedex",
  })
  .input(removePokemonParams)
  .output(RemovedPokemonSchema)
  .handler(async ({ context, input }) => {
    const [removed] = await db
      .delete(pokedex)
      .where(and(eq(pokedex.userId, context.session.user.id), eq(pokedex.pokemonId, input.pokemonId)))
      .returning({ pokemonId: pokedex.pokemonId });
    if (!removed) {
      throw new ORPCError("NOT_FOUND", { message: "This Pokemon is not in your Pokedex." });
    }
    return { removed: true as const, pokemonId: removed.pokemonId };
  });
