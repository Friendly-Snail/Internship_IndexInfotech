import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { HTTPError, NetworkError, TimeoutError } from "ky";
import type { createAuth } from "./auth/config";
import type { AppDatabase } from "./db/types";
import type { PokemonService } from "./services/pokemon";
import { createAuthRoutes } from "./routes/auth";
import { createDocsRoutes } from "./routes/docs";
import { createPokedexRoutes } from "./routes/pokedex";
import { createDiscoveryRoutes } from "./routes/discovery";
import { createBattleRoutes } from "./routes/battles";
import { createSearchRoutes } from "./routes/search";
import { createPokemonRoutes } from "./routes/pokemon";
import { createResourceRoutes } from "./routes/resources";

/**
 * Assemble the API routes and shared error handlers using one set of dependencies
 *
 * @param auth - Better Auth instance used for session identification
 * @param database - Drizzle database shared by the routes
 * @param service - Shared Pokemon cache and PokeAPI helpers
 * @returns The Hono application ready to receive requests
 */
export function createApp(
  auth: ReturnType<typeof createAuth>,
  database: AppDatabase,
  service: PokemonService,
) {
  const app = new Hono();
  app.route("/", createAuthRoutes(auth));
  app.route("/", createDocsRoutes(auth));
  app.route("/pokedex", createPokedexRoutes(auth, database, service.findOrCachePokemon));
  app.route("/", createDiscoveryRoutes());
  app.route("/", createBattleRoutes(database, service));
  app.route("/", createSearchRoutes(database));
  app.route("/pokemon", createPokemonRoutes(database, service));
  app.route("/", createResourceRoutes(service));
  // if no route above matches the requested path, return a normal HTTP 404 json response instead of an html error page
  app.notFound((c) => c.json({ error: "Not Found" }, 404));
  // route errors arrive here once; failed cache operations never look successful
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    if (error instanceof HTTPError) {
      if (error.response.status === 404) {
        return c.json({ error: "Requested resource not found in PokeAPI." }, 404);
      }
      console.error(error);
      return c.json({ error: "PokeAPI could not complete the request. Try again later." }, 502);
    }
    if (error instanceof NetworkError) {
      console.error(error);
      return c.json({ error: "Could not reach PokeAPI. Try again later." }, 502);
    }
    if (error instanceof TimeoutError) {
      console.error(error);
      return c.json({ error: "PokeAPI took too long to respond. Try again later." }, 504);
    }
    console.error(error);
    return c.json(
      { error: "Request failed. Check the PostgreSQL connection and PokeAPI availability." },
      500,
    );
  });

  return app;
}
