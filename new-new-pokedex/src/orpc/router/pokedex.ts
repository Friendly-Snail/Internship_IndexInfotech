import { pokedex as pokedexTable, pokemon } from "#/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { protectedProcedure } from "../procedures";
import z from "zod";
import { findOrCachePokemon } from "../utils/battles";
import { ORPCError } from "@orpc/server";

export const pokedex = protectedProcedure.handler(async ({ context }) => {
  const entries = await context.db
    .select({ pokemon: { id: pokemon.id, name: pokemon.name }, addedAt: pokedexTable.addedAt })
    .from(pokedexTable)
    .innerJoin(pokemon, eq(pokedexTable.pokemonId, pokemon.id))
    .where(eq(pokedexTable.userId, context.session.user.id))
    .orderBy(asc(pokemon.id));
  return { count: entries.length, entries };
});

const pokemonIdentifier = z
  .string()
  .trim()
  .toLowerCase()
  // reject empty identifiers and unusually long values before checking their shape
  .min(1, "provide a pokemon name or id")
  .max(255, "pokemon identifier is too long")
  // ^ and $ require the entire value to match, not just part of it
  // the | allows either a pokemon name on the left or a numeric id on the right
  // a name starts with a letter, then allows letters and digits
  // each optional hyphen must be followed by at least one letter or digit
  // a numeric id starts from 1 to 9, so 0 and leading zeroes are rejected
  .regex(
    /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[1-9][0-9]*)$/,
    "use a pokemon name or positive numeric id",
  )
  // names do not need a number check
  // numeric ids must fit safely in a javascript number before we use them for a database lookup
  .refine(
    (value) => !/^[0-9]+$/.test(value) || Number.isSafeInteger(Number(value)),
    "pokemon id is too large",
  );

export const catchPokemon = protectedProcedure
  .input(z.object({ pokemon: pokemonIdentifier }))
  .handler(async ({ input, context }) => {
    const cached = await findOrCachePokemon(input.pokemon);
    // the composite key handles simultaneous adds as well as repeated requests
    const [entry] = await context.db
      .insert(pokedexTable)
      .values({ userId: context.session.user.id, pokemonId: cached.id })
      .onConflictDoNothing({ target: [pokedexTable.userId, pokedexTable.pokemonId] })
      .returning({ addedAt: pokedexTable.addedAt });
    if (!entry)
      throw new ORPCError("CONFLICT", { message: "This Pokemon is already in your Pokedex." });
    return { pokemon: { id: cached.id, name: cached.name }, addedAt: entry.addedAt };
  });

export const killPokemon = protectedProcedure
  .input(z.object({ pokemonId: z.number().int().positive() }))
  .handler(async ({ input, context }) => {
    const [removed] = await context.db
      .delete(pokedexTable)
      .where(
        and(
          eq(pokedexTable.userId, context.session.user.id),
          eq(pokedexTable.pokemonId, input.pokemonId),
        ),
      )
      .returning({ pokemonId: pokedexTable.pokemonId });
    if (!removed)
      throw new ORPCError("NOT_FOUND", { message: "This Pokemon is not in your Pokedex." });
    return { removed: true, pokemonId: removed.pokemonId };
  });
