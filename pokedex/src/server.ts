// hono is the web framework that receives incoming http requests and lets us define routes like /fight
// the other imports give us error handling, database query helpers, http requests to pokeapi, and our database tables
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import ky, { HTTPError } from "ky";
import { db } from "./db";
import { battleHistory, pokemon, type TypeRelations } from "./db/schema";

// this is the common starting url for every request we make to pokeapi
// keeping it in one constant means the helper functions below only need to add paths like /pokemon/squirtle or /type/water
const POKEAPI_BASE_URL = "https://pokeapi.co/api/v2";
// drizzle can infer the typescript shape of a row from the pokemon table in schema.ts
// this keeps our types in sync with the database schema instead of manually defining the same row type again
type CachedPokemon = typeof pokemon.$inferSelect;

// these types describe only the parts of pokeapi responses that this program actually uses
type NamedResource = { name: string; url: string };
type ApiPokemon = {
    id: number;
    name: string;
    stats: { base_stat: number; stat: NamedResource }[];
    types: { slot: number; type: NamedResource }[];
};
type ApiType = {
    damage_relations: {
        double_damage_to: NamedResource[];
        half_damage_to: NamedResource[];
        no_damage_to: NamedResource[];
    };
    pokemon: { pokemon: NamedResource }[];
    name: string;
};
// this is the calculated information we keep for one pokemon during a fight
// totalStats is the sum of its base stats, typeMultiplier describes the matchup, and score combines those into our learning-project battle rule
type BattleScore = { totalStats: number; typeMultiplier: number; score: number };

// query parameters come from user input, so they may be missing, capitalized, or padded with spaces
// normalizing them gives the rest of the program one predictable lowercase identifier to work with
function normalizeIdentifier(value: string | undefined): string {
    return value?.trim().toLowerCase() ?? "";
}

// this helper performs the actual api communication for a pokemon
// ky sends an http GET request across the network, await pauses this function until the response arrives,
// and .json<ApiPokemon>() parses the response body from json into a javascript object we can use
// encodeURIComponent makes the identifier safe to place inside a url
async function getPokemonFromPokeApi(identifier: string): Promise<ApiPokemon> {
    return ky.get(`${POKEAPI_BASE_URL}/pokemon/${encodeURIComponent(identifier)}`).json<ApiPokemon>();
}

// this works the same way as getPokemonFromPokeApi, but it talks to pokeapi's /type endpoint
// we use this for type effectiveness data and for the search-by-type endpoint
async function getTypeFromPokeApi(identifier: string): Promise<ApiType> {
    return ky.get(`${POKEAPI_BASE_URL}/type/${encodeURIComponent(identifier)}`).json<ApiType>();
}

// this function is the bridge between the external pokeapi and our local postgresql database
// the main idea is "database first, api second": reuse data we already have and only call pokeapi when the pokemon is missing
// that is what makes the pokemon table a cache and avoids unnecessary repeated network requests
async function findOrCachePokemon(identifier: string): Promise<CachedPokemon> {
    // A name or numeric PokeAPI ID can identify the same Pokemon in our cache.
    const numericId = /^[1-9]\d*$/.test(identifier) ? Number(identifier) : null;
    // db.select() builds a SQL SELECT through drizzle instead of us writing raw SQL
    // the where condition supports either a pokemon name or a numeric pokeapi id
    // limit(1) is enough because both the id and name identify a unique pokemon
    const existing = await db.select().from(pokemon).where(
        numericId === null ? eq(pokemon.name, identifier) : or(eq(pokemon.id, numericId), eq(pokemon.name, identifier))
    ).limit(1);
    // drizzle returns matching rows as an array, so index 0 is the first match
    // if it exists we can return immediately without contacting pokeapi at all
    if (existing[0]) return existing[0];

    // Only cache missing Pokemon. Save the type chart with each Pokemon so
    // repeated fights can run entirely against our database.
    // reaching this point means the pokemon was not cached, so now we fetch it from the external api
    const apiPokemon = await getPokemonFromPokeApi(identifier);
    // pokeapi gives types as objects with slot numbers, so sort preserves primary/secondary type order
    // map then reduces those larger objects to a simple array such as ["water"] or ["grass", "poison"]
    const types = apiPokemon.types.sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name);
    // a pokemon can have more than one type, so this starts all needed type requests together
    // Promise.all waits until every request has completed and gives us the responses in matching order
    const typeData = await Promise.all(types.map(getTypeFromPokeApi));
    const typeRelations: Record<string, TypeRelations> = {};
    for (let i = 0; i < types.length; i++) {
        const relations = typeData[i].damage_relations;
        typeRelations[types[i]] = {
            doubleDamageTo: relations.double_damage_to.map((entry) => entry.name),
            halfDamageTo: relations.half_damage_to.map((entry) => entry.name),
            noDamageTo: relations.no_damage_to.map((entry) => entry.name)
        };
    }
    // pokeapi returns stats as an array, but our database stores them as a json object because named properties are easier to use later
    // for example this turns entries into something like { hp: 44, attack: 48, defense: 65, ... }
    const stats = Object.fromEntries(apiPokemon.stats.map((entry) => [entry.stat.name, entry.base_stat]));
    // Concurrent requests for the same Pokemon can race; the unique ID lets
    // one insert win and the other request read the already inserted row.
    // now we INSERT the fetched pokemon into postgresql so future fights can reuse it
    // returning() asks postgres to send the inserted row back to us immediately
    const inserted = await db.insert(pokemon).values({
        id: apiPokemon.id, name: apiPokemon.name, stats, types, typeRelations
    }).onConflictDoNothing().returning();
    // normally the insert succeeds and we return that new database row
    if (inserted[0]) return inserted[0];
    const cached = await db.select().from(pokemon).where(eq(pokemon.id, apiPokemon.id)).limit(1);
    if (!cached[0]) throw new Error("Pokemon could not be loaded from the database.");
    return cached[0];
}

// this compares the attacker's cached type chart against the defender's types
// examples: super effective = 2, resisted = 0.5, immune = 0, and dual-type interactions can combine to values such as 4 or 0.25
// if the attacker has multiple types, this simplified battle system uses whichever attacking type gives the best matchup
function typeMultiplier(attacker: CachedPokemon, defender: CachedPokemon): number {
    // best keeps track of the strongest multiplier found across all of the attacker's types
    let best = 0;
    for (const attackingType of attacker.types) {
        const relations = attacker.typeRelations[attackingType];
        if (!relations) throw new Error(`Missing cached type data for ${attackingType}.`);
        // every type matchup starts neutral at 1 and is adjusted for each defending type
        let multiplier = 1;
        for (const defendingType of defender.types) {
            if (relations.doubleDamageTo.includes(defendingType)) multiplier *= 2;
            if (relations.halfDamageTo.includes(defendingType)) multiplier *= 0.5;
            if (relations.noDamageTo.includes(defendingType)) multiplier = 0;
        }
        best = Math.max(best, multiplier);
    }
    // Zero is a real immunity; keep it instead of converting it to neutral.
    return attacker.types.length === 0 ? 1 : best;
}

// this is our custom learning-project scoring system, not the official pokemon battle formula
// it starts with the pokemon's total base stats and then adds or subtracts a simple bonus based on type effectiveness
// keeping this calculation in its own function makes the /fight route easier to read and gives both pokemon the exact same rules
function calculateBattleScore(attacker: CachedPokemon, defender: CachedPokemon): BattleScore {
    const totalStats = Object.values(attacker.stats).reduce((sum, value) => sum + value, 0);
    const multiplier = typeMultiplier(attacker, defender);
    // neutral effectiveness keeps a bonus of 0
    // 4x or better gets +100, ordinary super effectiveness gets +50, immunity gets -100, and resistance gets -50
    let bonus = 0;
    if (multiplier >= 4) bonus = 100;
    else if (multiplier > 1) bonus = 50;
    else if (multiplier === 0) bonus = -100;
    else if (multiplier < 1) bonus = -50;
    return { totalStats, typeMultiplier: multiplier, score: totalStats + bonus };
}

// database rows contain extra cached information that an api caller does not necessarily need
// this helper creates the smaller, cleaner pokemon object that we want to expose in a fight response
function displayPokemon(entry: CachedPokemon, battle: BattleScore, result: "WIN" | "LOSE" | "TIE") {
    return { name: entry.name, result, types: entry.types,
        totalStats: battle.totalStats, typeMultiplier: battle.typeMultiplier,
        battleScore: battle.score };
}

// this creates the hono application that will match incoming requests to the routes defined below
const app = new Hono();

// GET / is a simple discovery/help route
// it proves the server is running and reminds a developer which endpoints are available
// c.json serializes the javascript object into json and sends it as the http response
app.get("/", (c) => c.json({
    message: "Pokemon API running with Hono, Bun, Drizzle, and PostgreSQL",
    endpoints: {
        fight: "/fight?pokemon1=squirtle&pokemon2=charmander",
        searchByType: "/search-by-type?type=water",
        battles: "/battles"
    }
}));

// GET /fight?pokemon1=squirtle&pokemon2=charmander
// this route demonstrates the full flow of the project:
// client request -> hono -> postgresql cache -> pokeapi if needed -> battle calculation -> database insert -> json response
app.get("/fight", async (c) => {
    // c.req.query reads values from the url query string after the ?
    const first = normalizeIdentifier(c.req.query("pokemon1"));
    const second = normalizeIdentifier(c.req.query("pokemon2"));
    // reject the request with HTTP 400 when either required parameter is missing
    // 400 means the client sent a request that does not meet the endpoint's requirements
    if (!first || !second) {
        return c.json({ error: "Provide ?pokemon1=squirtle&pokemon2=charmander" }, 400);
    }
    if (first === second) return c.json({ error: "Please choose two different Pokemon." }, 400);

    // load both pokemon at the same time
    // each call checks postgres first and only reaches out to pokeapi if that pokemon is not cached yet
    const [pokemon1, pokemon2] = await Promise.all([
        findOrCachePokemon(first), findOrCachePokemon(second)
    ]);
    // Different identifiers (name and ID) can refer to the same row.
    if (pokemon1.id === pokemon2.id) {
        return c.json({ error: "Please choose two different Pokemon." }, 400);
    }

    // calculate the matchup in both directions because type effectiveness depends on who is attacking whom
    const battle1 = calculateBattleScore(pokemon1, pokemon2);
    const battle2 = calculateBattleScore(pokemon2, pokemon1);
    // start with TIE as the default and only change it when one pokemon wins a comparison
    // the comparisons intentionally go from our main battle score to progressively narrower tiebreakers
    let result: "POKEMON1_WIN" | "POKEMON2_WIN" | "TIE" = "TIE";
    let decidedBy = "tie: equal battle score, total base stats, and speed";

    // first compare the custom battle scores, then raw total stats, then speed
    // if every comparison is equal, nothing below changes the default result and the fight stays a real tie
    if (battle1.score > battle2.score) {
        result = "POKEMON1_WIN";
        decidedBy = "battle score";
    } else if (battle2.score > battle1.score) {
        result = "POKEMON2_WIN";
        decidedBy = "battle score";
    } else if (battle1.totalStats > battle2.totalStats) {
        result = "POKEMON1_WIN";
        decidedBy = "total base stats";
    } else if (battle2.totalStats > battle1.totalStats) {
        result = "POKEMON2_WIN";
        decidedBy = "total base stats";
    } else if ((pokemon1.stats.speed ?? 0) > (pokemon2.stats.speed ?? 0)) {
        result = "POKEMON1_WIN";
        decidedBy = "speed";
    } else if ((pokemon2.stats.speed ?? 0) > (pokemon1.stats.speed ?? 0)) {
        result = "POKEMON2_WIN";
        decidedBy = "speed";
    }

    // Record every completed fight, including ties, before returning a result.
    // this INSERT makes battle history persistent, meaning the result still exists after the server restarts
    // the two pokemon ids are foreign keys that connect this battle row back to rows in the pokemon table
    const [record] = await db.insert(battleHistory).values({
        pokemon1Id: pokemon1.id, pokemon2Id: pokemon2.id, result, decidedBy,
        pokemon1Score: battle1.score, pokemon2Score: battle2.score,
        // multipliers are stored as scaled integers in the database, so 2 becomes 200 and 0.5 becomes 50
        // this avoids storing these particular values as floating-point numbers and /battles converts them back for display
        pokemon1Multiplier: Math.round(battle1.typeMultiplier * 100),
        pokemon2Multiplier: Math.round(battle2.typeMultiplier * 100)
    }).returning({ id: battleHistory.id });

    // the response makes it clear that this is our own simplified scoring rule
    const note = "This is a simple learning rule based on base stats and type effectiveness, not the official Pokemon battle system.";
    if (result === "TIE") {
        return c.json({ battleId: record.id,
            pokemon1: displayPokemon(pokemon1, battle1, "TIE"),
            pokemon2: displayPokemon(pokemon2, battle2, "TIE"), decidedBy, note });
    }
    if (result === "POKEMON1_WIN") {
        return c.json({ battleId: record.id,
            winner: displayPokemon(pokemon1, battle1, "WIN"),
            loser: displayPokemon(pokemon2, battle2, "LOSE"), decidedBy, note });
    }
    return c.json({ battleId: record.id,
        winner: displayPokemon(pokemon2, battle2, "WIN"),
        loser: displayPokemon(pokemon1, battle1, "LOSE"), decidedBy, note });
});

// GET /battles reads previously saved fights from postgresql rather than calling pokeapi
// battle_history stores pokemon ids, so this query joins those ids to pokemon rows to also return readable pokemon names
app.get("/battles", async (c) => {
    // the same pokemon table must be joined twice because a battle has pokemon1 and pokemon2
    // aliases give each use of the table a separate SQL name so postgres can tell them apart
    const firstPokemon = alias(pokemon, "first_pokemon");
    const secondPokemon = alias(pokemon, "second_pokemon");
    // drizzle builds the SELECT, JOIN, and ORDER BY query while still giving us typescript type checking
    const rows = await db.select({
        id: battleHistory.id, foughtAt: battleHistory.foughtAt,
        result: battleHistory.result, decidedBy: battleHistory.decidedBy,
        pokemon1Id: battleHistory.pokemon1Id, pokemon1Name: firstPokemon.name,
        pokemon2Id: battleHistory.pokemon2Id, pokemon2Name: secondPokemon.name,
        pokemon1Score: battleHistory.pokemon1Score, pokemon2Score: battleHistory.pokemon2Score,
        pokemon1Multiplier: battleHistory.pokemon1Multiplier,
        pokemon2Multiplier: battleHistory.pokemon2Multiplier
    }).from(battleHistory)
        .innerJoin(firstPokemon, eq(battleHistory.pokemon1Id, firstPokemon.id))
        .innerJoin(secondPokemon, eq(battleHistory.pokemon2Id, secondPokemon.id))
        // newest battles come first, and id gives us a consistent order if timestamps happen to match
        .orderBy(desc(battleHistory.foughtAt), desc(battleHistory.id));
    // database multipliers were stored times 100, so divide by 100 before exposing them through the api
    // map also turns the database-oriented row into a friendlier nested json response
    return c.json({ count: rows.length, battles: rows.map((row) => ({
        // the database keeps the full timestamp so battles can still be sorted accurately
        // for the api response we only want the date bc it looks annoying lmao, so convert it to an iso string
        // and take everything before the T
        id: row.id, foughtAt: row.foughtAt.toISOString().split("T")[0],
        pokemon1: { id: row.pokemon1Id, name: row.pokemon1Name,
            battleScore: row.pokemon1Score, typeMultiplier: row.pokemon1Multiplier / 100,
            result: row.result === "TIE" ? "TIE" : row.result === "POKEMON1_WIN" ? "WIN" : "LOSE" },
        pokemon2: { id: row.pokemon2Id, name: row.pokemon2Name,
            battleScore: row.pokemon2Score, typeMultiplier: row.pokemon2Multiplier / 100,
            result: row.result === "TIE" ? "TIE" : row.result === "POKEMON2_WIN" ? "WIN" : "LOSE" },
        decidedBy: row.decidedBy
    })) });
});

// GET /search-by-type?type=water
// unlike /fight, this endpoint does not use our pokemon cache
// it asks pokeapi's type endpoint for the current list, extracts just the pokemon names, sorts them, and returns json
app.get("/search-by-type", async (c) => {
    const type = normalizeIdentifier(c.req.query("type"));
    if (!type) return c.json({ error: "Provide a Pokemon type using ?type=fire" }, 400);
    const data = await getTypeFromPokeApi(type);
    const names = data.pokemon.map((entry) => entry.pokemon.name).sort((a, b) => a.localeCompare(b));
    return c.json({ type: data.name, count: names.length, pokemon: names });
});

// if no route above matches the requested path, return a normal HTTP 404 json response instead of an html error page
app.notFound((c) => c.json({ error: "Not Found" }, 404));
// this is the centralized error handler for errors that escape a route
// known "not found" errors from pokeapi become a useful 404 for our own api
// unexpected failures are logged in the server console and become a generic 500 response so internal details are not exposed to clients
app.onError((error, c) => {
    if (error instanceof HTTPError && error.response.status === 404) {
        return c.json({ error: "Pokemon or type not found in PokeAPI." }, 404);
    }
    if (error instanceof HTTPException) return error.getResponse();
    console.error(error);
    return c.json({ error: "Request failed. Check the PostgreSQL connection and PokeAPI availability." }, 500);
});

// Bun.env reads environment variables, including PORT from our .env file
// ?? 3000 provides a fallback so the server still has a port when PORT is not configured
const port = Number(Bun.env.PORT ?? 3000);
const serverUrl = `http://localhost:${port}/`;

// these messages are just a developer cheat sheet printed when the program starts
// they do not create the routes themselves, they only show examples of routes that were defined above
console.log(`Pokemon API running with Bun at ${serverUrl}`);
console.log(`Fight example: ${serverUrl}fight?pokemon1=squirtle&pokemon2=charmander`);
console.log(`Type example: ${serverUrl}search-by-type?type=water`);
console.log(`Battle history: ${serverUrl}battles`);

// bun recognizes this default export as the server configuration
// port tells bun where to listen and app.fetch hands each incoming request over to hono for routing
export default {
    port,
    fetch: app.fetch
};
