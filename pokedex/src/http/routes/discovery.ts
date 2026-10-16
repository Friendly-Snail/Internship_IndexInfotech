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
        typeSearch: "GET /api/types/type-search?type=water",
        regionSearch: "GET /api/regions/region-search?region=kanto",
        pokemonRegions: "GET /api/pokemon/pikachu/regions",
        pokemonDetail: "GET /api/pokemon/pikachu",
        types: "GET /api/types",
        regions: "GET /api/regions",
        battles: "GET /api/battles",
        signUp: "POST /api/auth/sign-up/email",
        signIn: "POST /api/auth/sign-in/email",
        signOut: "POST /api/auth/sign-out",
        session: "GET /api/auth/get-session",
        currentTrainer: "GET /api/auth/me",
        documentation: "GET /api/docs",
        openapi: "GET /api/docs/openapi.json",
        pokedex: "GET /api/pokedex (signed in)",
        addPokemon: 'POST /api/pokedex/create with JSON { "pokemon": "pikachu" } (signed in)',
        removePokemon: "DELETE /api/pokedex/:pokemonId (signed in)",
      },
    }),
  );

  return routes;
}
