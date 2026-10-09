import { Hono } from "hono";

/**
 * Register the root endpoint that lists the available API URLs.
 *
 * @returns The public GET / discovery route.
 */
export function createDiscoveryRoutes() {
  const routes = new Hono();
  // GET / is a simple discovery/help route
  // it proves the server is running and reminds a developer which endpoints are available
  // c.json serializes the javascript object into json and sends it as the http response
  routes.get("/", (c) =>
    c.json({
      message: "Pokemon API running with Hono, Bun, Drizzle, and PostgreSQL",
      endpoints: {
        fight: 'POST /api/battles/fight with JSON { team1: ["squirtle"], team2: ["charmander"] }',
        searchByType: "/api/types/type-search?type=water",
        searchByRegion: "/api/regions/region-search?region=kanto",
        pokemonRegions: "/api/pokemon/pikachu/regions",
        pokemonDetail: "/api/pokemon/pikachu",
        types: "/api/types",
        regions: "/api/regions",
        battles: "/api/battles",
        signUp: "POST /api/auth/sign-up/email",
        signIn: "POST /api/auth/sign-in/email",
        signOut: "POST /api/auth/sign-out",
        currentTrainer: "/api/auth/me",
        documentation: "/api/docs",
        openapi: "/api/docs/openapi.json",
        pokedex: "GET /api/pokedex (signed in)",
        addPokemon: 'POST /api/pokedex/create with JSON { pokemon: "pikachu" } (signed in)',
        removePokemon: "DELETE /api/pokedex/:pokemonId (signed in)",
      },
    }),
  );

  return routes;
}
