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
        fight: 'POST /fight with JSON { team1: ["squirtle"], team2: ["charmander"] }',
        searchByType: "/search-by-type?type=water",
        searchByRegion: "/search-by-region?region=kanto",
        pokemonRegions: "/pokemon/pikachu/regions",
        pokemonDetail: "/pokemon/pikachu",
        types: "/types",
        regions: "/regions",
        battles: "/battles",
        signUp: "POST /api/auth/sign-up/email",
        signIn: "POST /api/auth/sign-in/email",
        signOut: "POST /api/auth/sign-out",
        currentTrainer: "/me",
        documentation: "/docs",
        openapi: "/openapi.json",
        pokedex: "GET /pokedex (signed in)",
        addPokemon: 'POST /pokedex with JSON { pokemon: "pikachu" } (signed in)',
        removePokemon: "DELETE /pokedex/:pokemonId (signed in)",
      },
    }),
  );

  return routes;
}
