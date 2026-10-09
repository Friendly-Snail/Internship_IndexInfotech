import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Auth } from "../auth";
import * as schema from "../db/schema/pokemon";
import { pokedex, pokemon } from "../db/schema/pokemon";
import { pokemonIdentifier } from "../validation/fight";

type OwnershipDatabase = Pick<
  PgDatabase<PgQueryResultHKT, typeof schema>,
  "select" | "insert" | "delete"
>;
type PokemonLoader = (identifier: string) => Promise<{ id: number; name: string }>;

export const addPokemonBody = z.strictObject({ pokemon: pokemonIdentifier });
export const removePokemonParams = z.object({
  pokemonId: pokemonIdentifier
    .refine((value) => /^[1-9][0-9]*$/.test(value), "use the Pokemon ID from your Pokedex")
    .refine((value) => Number(value) <= 2147483647, "Pokemon ID is too large")
    .transform(Number),
});

/**
 * Register private ownership operations scoped to the authenticated trainer.
 *
 * @param auth - Better Auth instance used to identify the trainer and trusted origin.
 * @param database - Database used to read, add, and remove ownership entries.
 * @param findOrCachePokemon - Validated Pokemon lookup used before adding an ownership entry.
 * @returns Pokédex routes with session checks and origin checks for mutations.
 */
export function createPokedexRoutes(
  auth: Auth,
  database: OwnershipDatabase,
  findOrCachePokemon: PokemonLoader,
) {
  const routes = new Hono<{ Variables: { trainerId: string } }>();

  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const current = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!current) return c.json({ error: "Sign in to access your Pokedex." }, 401);
    c.set("trainerId", current.user.id);

    // Better Auth protects its own routes. cookie-authenticated mutations
    // also require the configured app origin, including DELETE requests
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      if (c.req.header("Origin") !== auth.options.baseURL) {
        return c.json({ error: "Use the app's Origin header for Pokedex changes." }, 403);
      }
    }
    await next();
  });

  routes.get("/", async (c) => {
    const entries = await database
      .select({ pokemon: { id: pokemon.id, name: pokemon.name }, addedAt: pokedex.addedAt })
      .from(pokedex)
      .innerJoin(pokemon, eq(pokedex.pokemonId, pokemon.id))
      .where(eq(pokedex.userId, c.get("trainerId")))
      .orderBy(asc(pokemon.id));
    return c.json({ count: entries.length, entries });
  });

  routes.post("/create", zValidator("json", addPokemonBody), async (c) => {
    const cached = await findOrCachePokemon(c.req.valid("json").pokemon);
    // the composite key handles simultaneous adds as well as repeated requests
    const [entry] = await database
      .insert(pokedex)
      .values({ userId: c.get("trainerId"), pokemonId: cached.id })
      .onConflictDoNothing({ target: [pokedex.userId, pokedex.pokemonId] })
      .returning({ addedAt: pokedex.addedAt });
    if (!entry) return c.json({ error: "This Pokemon is already in your Pokedex." }, 409);
    return c.json({ pokemon: { id: cached.id, name: cached.name }, addedAt: entry.addedAt }, 201);
  });

  routes.delete("/:pokemonId", zValidator("param", removePokemonParams), async (c) => {
    const [removed] = await database
      .delete(pokedex)
      .where(
        and(
          eq(pokedex.userId, c.get("trainerId")),
          eq(pokedex.pokemonId, c.req.valid("param").pokemonId),
        ),
      )
      .returning({ pokemonId: pokedex.pokemonId });
    if (!removed) return c.json({ error: "This Pokemon is not in your Pokedex." }, 404);
    return c.json({ removed: true, pokemonId: removed.pokemonId });
  });

  return routes;
}
