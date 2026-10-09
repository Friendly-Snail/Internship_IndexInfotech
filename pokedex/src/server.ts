import { auth } from "./auth";
import { db } from "./db";
import { createApp } from "./app";
import { createPokemonService } from "./services/pokemon";

const service = createPokemonService();
const app = createApp(auth, db, service);

// Bun.env reads environment variables, including PORT from the .env file
// ?? 3000 provides a fallback so the server still has a port when PORT is not configured
const port = Number(Bun.env.PORT ?? 3000);
const serverUrl = `http://localhost:${port}/`;

// these messages are just a developer cheat sheet printed when the program starts
// they do not create the routes themselves, they only show examples of routes that were defined above
console.log(`Pokemon API running with Bun at ${serverUrl}`);
console.log(
  `Fight example: Invoke-RestMethod -Uri "${serverUrl}api/battles/fight" -Method Post -ContentType "application/json" -Body '{"team1":["pikachu","bulbasaur","squirtle","charmander"],"team2":["geodude","pidgey","rattata","caterpie"]}'`,
);
console.log(`Type example: ${serverUrl}api/types/type-search?type=water`);
console.log(`Region example: ${serverUrl}api/regions/region-search?region=kanto`);
console.log(`Pokemon Region example: ${serverUrl}api/pokemon/pikachu/regions`);
console.log(`Pokemon detail: ${serverUrl}api/pokemon/pikachu`);
console.log(`All types: ${serverUrl}api/types`);
console.log(`All regions: ${serverUrl}api/regions`);
console.log(`Battle history: ${serverUrl}api/battles`);

console.log(`Swagger UI: ${serverUrl}api/docs`);
console.log(`OpenAPI: ${serverUrl}api/docs/openapi.json`);
console.log("Postman: import postman/pokemon-api.postman_collection.json");
console.log(`Trainer: GET ${serverUrl}api/auth/me (session cookie required)`);
console.log(
  `Pokedex: GET ${serverUrl}api/pokedex; POST ${serverUrl}api/pokedex/create with JSON {"pokemon":"pikachu"} (session cookie and configured Origin required for POST)`,
);
console.log(
  "Battle history foughtAt uses Unix seconds; ownership/auth dates use ISO date-time strings.",
);

// bun recognizes this default export as the server configuration
// port tells bun where to listen and app.fetch hands each incoming request over to hono for routing
export default {
  port,
  fetch: app.fetch,
};
