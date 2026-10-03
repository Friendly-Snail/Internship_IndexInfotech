import { auth } from "./auth";
import { db } from "./db";
import { createApp } from "./app";
import { createPokemonService } from "./services/pokemon";

const service = createPokemonService(db);
const app = createApp(auth, db, service);

// Bun.env reads environment variables, including PORT fromthe.env file
// ?? 3000 provides a fallback so the server still has a port when PORT is not configured
const port = Number(Bun.env.PORT ?? 3000);
const serverUrl = `http://localhost:${port}/`;

// these messages are just a developer cheat sheet printed when the program starts
// they do not create the routes themselves, they only show examples of routes that were defined above
console.log(`Pokemon API running with Bun at ${serverUrl}`);
console.log(
  `Fight example: Invoke-RestMethod -Uri "${serverUrl}fight" -Method Post -ContentType "application/json" -Body '{"team1":["pikachu","bulbasaur","squirtle","charmander"],"team2":["geodude","pidgey","rattata","caterpie"]}'`,
);
console.log(`Type example: ${serverUrl}search-by-type?type=water`);
console.log(`Region example: ${serverUrl}search-by-region?region=kanto`);
console.log(`Pokemon Region example: ${serverUrl}pokemon/pikachu/regions`);
console.log(`Pokemon detail: ${serverUrl}pokemon/pikachu`);
console.log(`All types: ${serverUrl}types`);
console.log(`All regions: ${serverUrl}regions`);
console.log(`Battle history: ${serverUrl}battles`);

// bun recognizes this default export as the server configuration
// port tells bun where to listen and app.fetch hands each incoming request over to hono for routing
export default {
  port,
  fetch: app.fetch,
};
