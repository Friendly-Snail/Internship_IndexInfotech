import { z } from "zod";
import { publicProcedure } from "../base";

// GET /api is a simple discovery/help route
// it proves the server is running and reminds a developer which endpoints are available
export const discovery = publicProcedure
  .route({ method: "GET", path: "/", tags: ["Overview"], summary: "List the available endpoints" })
  .output(z.object({ message: z.string(), endpoints: z.record(z.string(), z.string()) }))
  .handler(() => ({
    message: "Pokemon API running with TanStack Start, oRPC, Drizzle, and PostgreSQL",
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
      rpc: "POST /api/rpc/* (oRPC clients)",
      pokedex: "GET /api/pokedex (signed in)",
      addPokemon: 'POST /api/pokedex/create with JSON { "pokemon": "pikachu" } (signed in)',
      removePokemon: "DELETE /api/pokedex/:pokemonId (signed in)",
    },
  }));
