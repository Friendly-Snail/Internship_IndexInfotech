// hono is the web framework that receives incoming http requests and lets us define routes like /fight
// the other imports give us error handling, database query helpers, http requests to pokeapi, and the database tables
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { desc, eq, inArray } from "drizzle-orm";
import ky, { HTTPError } from "ky";
import { db } from "./db";
import {
  battleHistory,
  battleParticipant,
  encounterArea,
  pokemon,
  pokemonElementType,
  pokemonEncounter,
  pokemonStat,
  pokemonType,
  region,
  typeMatchup,
  type TypeRelations,
  type PokemonStats,
} from "./db/schema";
import { fightBodySchema, pokemonIdentifier } from "./validation/fight";
import { battleBonus, incomingMultiplier, typeMultiplierAgainstTypes } from "./type-matchups";
import { decideTeamResult, type TeamTotals } from "./team-result";
import { formatUtcDate } from "./utc";

// this is the common starting url for every request we make to pokeapi
// keeping it in one constant means the helper functions below only need to add paths like /pokemon/squirtle or /type/water
const POKEAPI_BASE_URL = "https://pokeapi.co/api/v2";
// assemble the battle data from stat, pokemon type, and matchup rows
type CachedPokemon = {
  id: number;
  name: string;
  stats: PokemonStats;
  types: string[];
  matchups: Record<string, Record<string, number>>;
};

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
    double_damage_from: NamedResource[];
    half_damage_from: NamedResource[];
    no_damage_from: NamedResource[];
  };
  name: string;
};
type NamedResourceList = { results: NamedResource[]; next: string | null };
// this is the calculated information we keep for one pokemon during a fight
// totalStats is the sum of its base stats, typeMultiplier describes the matchup, and score combines those intothelearning-project battle rule
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
// we use this for type effectiveness data when caching a pokemon
async function getTypeFromPokeApi(identifier: string): Promise<ApiType> {
  return ky.get(`${POKEAPI_BASE_URL}/type/${encodeURIComponent(identifier)}`).json<ApiType>();
}

// resource lists are paginated, so follow next until we have every name
async function getResourceNames(resource: "type" | "region"): Promise<string[]> {
  const names: string[] = [];
  let next: string | null = `${POKEAPI_BASE_URL}/${resource}?limit=100`;
  while (next) {
    const page: NamedResourceList = await ky.get(next).json<NamedResourceList>();
    names.push(...page.results.map((entry) => entry.name));
    next = page.next;
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

// load battle data from the normalized tables rather than from the old json columns
async function loadCachedPokemon(id: number): Promise<CachedPokemon> {
  const [row] = await db
    .select({ id: pokemon.id, name: pokemon.name })
    .from(pokemon)
    .where(eq(pokemon.id, id))
    .limit(1);
  if (!row) throw new Error("Pokemon could not be loaded from the database.");
  // these independent queries can run together and both results are needed
  // promise.all preserves their order and rejects if either query fails
  const [stats, memberships] = await Promise.all([
    db.select().from(pokemonStat).where(eq(pokemonStat.pokemonId, id)),
    db.select().from(pokemonType).where(eq(pokemonType.pokemonId, id)),
  ]);
  if (stats.length === 0 || memberships.length === 0) {
    throw new Error(`Missing normalized data for ${row.name}; check the backfill migrations.`);
  }
  const types = memberships.sort((a, b) => a.slot - b.slot).map((entry) => entry.typeName);
  // build a lookup from each of this pokemon's attacking types to defending types
  const matchupRows = await db
    .select()
    .from(typeMatchup)
    .where(inArray(typeMatchup.attackingType, types));
  const matchups: CachedPokemon["matchups"] = {};
  for (const entry of matchupRows) {
    (matchups[entry.attackingType] ??= {})[entry.defendingType] = entry.multiplier;
  }
  return {
    id: row.id,
    name: row.name,
    stats: Object.fromEntries(stats.map((entry) => [entry.statName, entry.baseStat])),
    types,
    matchups,
  };
}

type ApiEncounter = { location_area: NamedResource };
type ApiArea = { id: number; name: string; location: NamedResource };
type ApiLocation = { name: string; region: NamedResource | null };

// follow encounter area -> location -> region to record where this pokemon appears
// a completed check is marked even when pokeapi has no wild encounters for it
async function ensureRegionsCached(id: number): Promise<void> {
  const [entry] = await db
    .select({ regionsCachedAt: pokemon.regionsCachedAt })
    .from(pokemon)
    .where(eq(pokemon.id, id))
    .limit(1);
  if (!entry || entry.regionsCachedAt) return;

  const encounters = await ky
    .get(`${POKEAPI_BASE_URL}/pokemon/${id}/encounters`)
    .json<ApiEncounter[]>();
  // an encounter can mention the same area more than once, so keep one per url
  const uniqueAreas = [
    ...new Map(encounters.map((item) => [item.location_area.url, item.location_area])).values(),
  ];
  const areaRows: (typeof encounterArea.$inferInsert)[] = [];
  // areas in the same location can share one request while it is in flight
  const locationRequests = new Map<string, Promise<ApiLocation>>();

  // keep a small number of requests in flight when a pokemon has many encounter areas
  for (let offset = 0; offset < uniqueAreas.length; offset += 6) {
    const batch = uniqueAreas.slice(offset, offset + 6);
    const found = await Promise.all(
      batch.map(async (item) => {
        // the url ends in an area id that we can check in the database first
        const pathParts = new URL(item.url).pathname.split("/").filter(Boolean);
        const areaId = Number(pathParts.at(-1));
        if (!Number.isSafeInteger(areaId) || areaId <= 0)
          throw new Error("Invalid PokeAPI area ID");
        const [cachedArea] = await db
          .select()
          .from(encounterArea)
          .where(eq(encounterArea.id, areaId))
          .limit(1);
        // a cached area already includes its location and region
        if (cachedArea) return cachedArea;
        const area = await ky.get(item.url).json<ApiArea>();
        let locationRequest = locationRequests.get(area.location.url);
        if (!locationRequest) {
          locationRequest = ky.get(area.location.url).json<ApiLocation>();
          locationRequests.set(area.location.url, locationRequest);
        }
        const location = await locationRequest;
        // areas without a known region cannot appear in region search
        if (!location.region) return null;
        return {
          id: area.id,
          name: area.name,
          locationName: location.name,
          regionName: location.region.name,
        };
      }),
    );
    // the type predicate tells typescript that null areas were removed
    areaRows.push(...found.filter((row): row is NonNullable<typeof row> => row !== null));
  }

  // save all region relationships and the completed flag in one transaction
  await db.transaction(async (tx) => {
    // insert regions before areas and areas before pokemon links for the foreign keys
    const regions = [...new Set(areaRows.map((area) => area.regionName))];
    if (regions.length)
      await tx
        .insert(region)
        .values(regions.map((name) => ({ name })))
        .onConflictDoNothing();
    if (areaRows.length) {
      await tx.insert(encounterArea).values(areaRows).onConflictDoNothing();
      await tx
        .insert(pokemonEncounter)
        .values(areaRows.map((area) => ({ pokemonId: id, areaId: area.id })))
        .onConflictDoNothing();
    }
    await tx.update(pokemon).set({ regionsCachedAt: new Date() }).where(eq(pokemon.id, id));
  });
}

// first try the local cache, then fetch any pokemon we have not stored yet
async function findOrCachePokemon(identifier: string): Promise<CachedPokemon> {
  // the route already validates identifiers, so a positive whole number is an id
  const numericId = Number(identifier);
  const isId = Number.isSafeInteger(numericId) && numericId > 0;
  const [existing] = await db
    .select({ id: pokemon.id })
    .from(pokemon)
    .where(isId ? eq(pokemon.id, numericId) : eq(pokemon.name, identifier))
    .limit(1);
  if (existing) {
    // a region lookup can fail independently of an otherwise valid fight
    try {
      await ensureRegionsCached(existing.id);
    } catch (error) {
      console.error(`Could not cache encounter regions for pokemon ${existing.id}`, error);
    }
    return loadCachedPokemon(existing.id);
  }

  const apiPokemon = await getPokemonFromPokeApi(identifier);
  const types = [...apiPokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => entry.type.name);
  const typeData = await Promise.all(types.map(getTypeFromPokeApi));
  const typeRelations: Record<string, TypeRelations> = {};
  for (let i = 0; i < types.length; i++) {
    const relations = typeData[i].damage_relations;
    typeRelations[types[i]] = {
      doubleDamageTo: relations.double_damage_to.map((entry) => entry.name),
      halfDamageTo: relations.half_damage_to.map((entry) => entry.name),
      noDamageTo: relations.no_damage_to.map((entry) => entry.name),
    };
  }

  // a transaction keeps the pokemon, its stats, and its types together
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(pokemon)
      .values({
        id: apiPokemon.id,
        name: apiPokemon.name,
      })
      .onConflictDoNothing()
      .returning({ id: pokemon.id });
    // another request may have inserted the same pokemon first
    // its related data belongs to that request, so skip inserting it twice
    if (!inserted[0]) return;
    await tx.insert(pokemonStat).values(
      apiPokemon.stats.map((entry) => ({
        pokemonId: apiPokemon.id,
        statName: entry.stat.name,
        baseStat: entry.base_stat,
      })),
    );
    // matchups mention defending types that this pokemon may not have
    // insert those type names before inserting rows that reference them
    const knownTypes = new Set(types);
    for (const relation of Object.values(typeRelations)) {
      for (const name of [
        ...relation.doubleDamageTo,
        ...relation.halfDamageTo,
        ...relation.noDamageTo,
      ]) {
        knownTypes.add(name);
      }
    }
    await tx
      .insert(pokemonElementType)
      .values([...knownTypes].map((name) => ({ name })))
      .onConflictDoNothing();
    await tx.insert(pokemonType).values(
      apiPokemon.types.map((entry) => ({
        pokemonId: apiPokemon.id,
        typeName: entry.type.name,
        slot: entry.slot,
      })),
    );
    // pokeapi lists non-neutral matchups, so missing pairs mean 1x
    // multipliers are stored as decimals without scaling them by 100
    const matchups = types.flatMap((name) => {
      const relation = typeRelations[name];
      return [
        ...relation.doubleDamageTo.map((defendingType) => ({
          attackingType: name,
          defendingType,
          multiplier: 2,
        })),
        ...relation.halfDamageTo.map((defendingType) => ({
          attackingType: name,
          defendingType,
          multiplier: 0.5,
        })),
        ...relation.noDamageTo.map((defendingType) => ({
          attackingType: name,
          defendingType,
          multiplier: 0,
        })),
      ];
    });
    if (matchups.length) await tx.insert(typeMatchup).values(matchups).onConflictDoNothing();
  });
  try {
    await ensureRegionsCached(apiPokemon.id);
  } catch (error) {
    console.error(`Could not cache encounter regions for pokemon ${apiPokemon.id}`, error);
  }
  return loadCachedPokemon(apiPokemon.id);
}

// score a matchup using the same helper as the pokemon detail route
function typeMultiplier(attacker: CachedPokemon, defender: CachedPokemon): number {
  return typeMultiplierAgainstTypes(attacker, defender.types);
}

// this isthecustom learning-project scoring system, not the official pokemon battle formula
// it starts with the pokemon's total base stats and then adds or subtracts a simple bonus based on type effectiveness
// keeping this calculation in its own function makes the /fight route easier to read and gives both pokemon the exact same rules
function calculateBattleScore(attacker: CachedPokemon, defender: CachedPokemon): BattleScore {
  const totalStats = Object.values(attacker.stats).reduce((sum, value) => sum + value, 0);
  const multiplier = typeMultiplier(attacker, defender);
  // neutral effectiveness keeps a bonus of 0
  // 4x or better gets +100, ordinary super effectiveness gets +50, immunity gets -100, and resistance gets -50
  const bonus = battleBonus(multiplier);
  return { totalStats, typeMultiplier: multiplier, score: totalStats + bonus };
}

// database rows contain extra cached information that an api caller does not necessarily need
// this helper creates the smaller, cleaner pokemon object that we want to expose in a fight response
function displayPokemon(entry: CachedPokemon, battle: BattleScore, result: "WIN" | "LOSE" | "TIE") {
  return {
    id: entry.id,
    name: entry.name,
    result,
    types: entry.types,
    totalStats: battle.totalStats,
    typeMultiplier: battle.typeMultiplier,
    battleScore: battle.score,
  };
}

// each pair gets one score in each direction because type effectiveness can differ
function scoreTeams(
  team1: CachedPokemon[],
  team2: CachedPokemon[],
): {
  team1: BattleScore[];
  team2: BattleScore[];
} {
  // score both attack directions for each pair in matching positions
  const pairs = team1.map((entry, position) => ({
    team1: calculateBattleScore(entry, team2[position]),
    team2: calculateBattleScore(team2[position], entry),
  }));
  return {
    team1: pairs.map((pair) => pair.team1),
    team2: pairs.map((pair) => pair.team2),
  };
}

// summarize one team's participants for the winner and the saved battle row
function summarizeTeam(team: CachedPokemon[], scores: BattleScore[]): TeamTotals {
  return {
    score: scores.reduce((sum, battle) => sum + battle.score, 0),
    totalStats: scores.reduce((sum, battle) => sum + battle.totalStats, 0),
    speed: team.reduce((sum, entry) => sum + (entry.stats.speed ?? 0), 0),
  };
}

// this creates the hono application that will match incoming requests to the routes defined below
const app = new Hono();

// GET / is a simple discovery/help route
// it proves the server is running and reminds a developer which endpoints are available
// c.json serializes the javascript object into json and sends it as the http response
app.get("/", (c) =>
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
    },
  }),
);

// POST /fight accepts two equally sized teams with one to four pokemon per team
// client request -> hono -> postgresql cache -> pokeapi if needed -> battle calculation -> database insert -> json response
app.post(
  "/fight",
  zValidator("json", fightBodySchema, (result, c) => {
    // hono checks the json body before the fight handler touches the cache or pokeapi
    if (!result.success) {
      return c.json(
        {
          error: "Invalid fight request",
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    }
  }),
  async (c) => {
    // this value has been checked and normalized by the zod schema above
    const teams = c.req.valid("json");

    // load every pokemon while reusing cached rows where possible
    // all lookups are needed to score the complete fight
    // promise.all keeps their input order and rejects if any lookup fails
    const allPokemon = await Promise.all([...teams.team1, ...teams.team2].map(findOrCachePokemon));
    // names and numeric IDs can point to the same pokemon, so compare their actual IDs
    if (new Set(allPokemon.map((entry) => entry.id)).size !== allPokemon.length) {
      return c.json({ error: "Choose different pokemon for every team position" }, 400);
    }
    // split the ordered results back into the two original teams
    const team1 = allPokemon.slice(0, teams.team1.length);
    const team2 = allPokemon.slice(teams.team1.length);

    // position 1 fights position 1, position 2 fights position 2, and so on
    const { team1: scores1, team2: scores2 } = scoreTeams(team1, team2);
    const totals1 = summarizeTeam(team1, scores1);
    const totals2 = summarizeTeam(team2, scores2);
    // compare score, then base stats, then speed, leaving exact matches as ties
    const { winner, result, decidedBy } = decideTeamResult(totals1, totals2);

    // a transaction saves the parent battle and every participant together
    // if one insert fails, postgres rolls the whole battle back
    const battleId = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(battleHistory)
        .values({
          result,
          decidedBy,
          team1Score: totals1.score,
          team2Score: totals2.score,
        })
        .returning({ id: battleHistory.id });
      // make one row for every pokemon with its team number and position
      const participants = [
        ...team1.map((entry, position) => ({
          entry,
          position,
          teamNumber: 1,
          battle: scores1[position],
        })),
        ...team2.map((entry, position) => ({
          entry,
          position,
          teamNumber: 2,
          battle: scores2[position],
        })),
      ];
      await tx.insert(battleParticipant).values(
        participants.map(({ entry, position, teamNumber, battle }) => ({
          battleId: record.id,
          pokemonId: entry.id,
          teamNumber,
          position: position + 1,
          battleScore: battle.score,
          totalStats: battle.totalStats,
          speed: entry.stats.speed ?? 0,
          typeMultiplier: battle.typeMultiplier,
        })),
      );
      return record.id;
    });

    // include each pokemon's score as well as the team's total
    const outcome1 = winner === 0 ? "TIE" : winner === 1 ? "WIN" : "LOSE";
    const outcome2 = winner === 0 ? "TIE" : winner === 2 ? "WIN" : "LOSE";
    const note =
      "This is a simple learning rule based on base stats and type effectiveness, not the official Pokemon battle system.";
    return c.json({
      battleId,
      result,
      decidedBy,
      team1: {
        score: totals1.score,
        pokemon: team1.map((entry, i) => ({
          position: i + 1,
          ...displayPokemon(entry, scores1[i], outcome1),
        })),
      },
      team2: {
        score: totals2.score,
        pokemon: team2.map((entry, i) => ({
          position: i + 1,
          ...displayPokemon(entry, scores2[i], outcome2),
        })),
      },
      note,
    });
  },
);

// GET /battles reads saved fights from postgresql without calling pokeapi
// older one-on-one rows still use their original columns, while new battles use participants
app.get("/battles", async (c) => {
  const battles = await db
    .select()
    .from(battleHistory)
    .orderBy(desc(battleHistory.foughtAt), desc(battleHistory.id));
  // fetch participants for all battles in one query instead of one per battle
  const ids = battles.map((battle) => battle.id);
  const participantRows =
    ids.length === 0
      ? []
      : await db
          .select({
            battleId: battleParticipant.battleId,
            teamNumber: battleParticipant.teamNumber,
            position: battleParticipant.position,
            pokemonId: pokemon.id,
            name: pokemon.name,
            battleScore: battleParticipant.battleScore,
            totalStats: battleParticipant.totalStats,
            speed: battleParticipant.speed,
            typeMultiplier: battleParticipant.typeMultiplier,
          })
          .from(battleParticipant)
          .innerJoin(pokemon, eq(battleParticipant.pokemonId, pokemon.id))
          .where(inArray(battleParticipant.battleId, ids));
  // fights saved before teams still have two pokemon ids on the battle row
  const legacyPokemonIds = battles
    .flatMap((battle) => [battle.pokemon1Id, battle.pokemon2Id])
    .filter((id): id is number => id !== null);
  const legacyPokemon =
    legacyPokemonIds.length === 0
      ? []
      : await db
          .select({ id: pokemon.id, name: pokemon.name })
          .from(pokemon)
          .where(inArray(pokemon.id, legacyPokemonIds));
  const names = new Map(legacyPokemon.map((entry) => [entry.id, entry.name]));

  // group the saved participants by battle so each history row has two ordered teams
  return c.json({
    count: battles.length,
    battles: battles.map((battle) => {
      const rows = participantRows.filter((row) => row.battleId === battle.id);
      const members = (teamNumber: number) =>
        rows
          .filter((row) => row.teamNumber === teamNumber)
          .sort((a, b) => a.position - b.position)
          .map((row) => ({
            position: row.position,
            id: row.pokemonId,
            name: row.name,
            battleScore: row.battleScore,
            totalStats: row.totalStats,
            speed: row.speed,
            typeMultiplier: row.typeMultiplier,
          }));
      // older one-on-one fights have no participant rows
      const oldRow = rows.length === 0 && battle.pokemon1Id !== null && battle.pokemon2Id !== null;
      // the old columns let us display previous one-on-one fights
      const oldMembers1 = oldRow
        ? [
            {
              position: 1,
              id: battle.pokemon1Id!,
              name: names.get(battle.pokemon1Id!) ?? "unknown",
              battleScore: battle.pokemon1Score!,
              totalStats: null,
              speed: null,
              typeMultiplier: battle.pokemon1Multiplier,
            },
          ]
        : [];
      const oldMembers2 = oldRow
        ? [
            {
              position: 1,
              id: battle.pokemon2Id!,
              name: names.get(battle.pokemon2Id!) ?? "unknown",
              battleScore: battle.pokemon2Score!,
              totalStats: null,
              speed: null,
              typeMultiplier: battle.pokemon2Multiplier,
            },
          ]
        : [];
      // translate old winner names into the current team result names
      const result =
        battle.result === "POKEMON1_WIN"
          ? "TEAM1_WIN"
          : battle.result === "POKEMON2_WIN"
            ? "TEAM2_WIN"
            : battle.result;
      return {
        id: battle.id,
        // format the saved timestamp as the same utc calendar date for every client
        foughtAt: formatUtcDate(battle.foughtAt),
        result,
        decidedBy: battle.decidedBy,
        team1: {
          score: battle.team1Score ?? battle.pokemon1Score,
          pokemon: oldRow ? oldMembers1 : members(1),
        },
        team2: {
          score: battle.team2Score ?? battle.pokemon2Score,
          pokemon: oldRow ? oldMembers2 : members(2),
        },
      };
    }),
  });
});

// GET /search-by-type?type=water
// searchthecached pokemon by their type rows
// this list grows as fights cache more pokemon, so it is not the full pokeapi roster
app.get("/search-by-type", async (c) => {
  const type = normalizeIdentifier(c.req.query("type"));
  if (!type) return c.json({ error: "Provide a Pokemon type using ?type=fire" }, 400);
  const rows = await db
    .select({ name: pokemon.name })
    .from(pokemonType)
    .innerJoin(pokemon, eq(pokemonType.pokemonId, pokemon.id))
    .where(eq(pokemonType.typeName, type));
  const names = rows.map((row) => row.name).sort((a, b) => a.localeCompare(b));
  return c.json({ type, count: names.length, pokemon: names, scope: "cached pokemon" });
});

// show pokemon with documented wild encounters in the requested region
// only pokemon whose encounter locations have been checked are included
app.get("/search-by-region", async (c) => {
  const name = normalizeIdentifier(c.req.query("region"));
  if (!name) return c.json({ error: "Provide a region using ?region=kanto" }, 400);
  const rows = await db
    .select({ name: pokemon.name })
    .from(pokemonEncounter)
    .innerJoin(encounterArea, eq(pokemonEncounter.areaId, encounterArea.id))
    .innerJoin(pokemon, eq(pokemonEncounter.pokemonId, pokemon.id))
    .where(eq(encounterArea.regionName, name));
  // one pokemon can have many areas in the region, so show its name once
  const names = [...new Set(rows.map((row) => row.name))].sort((a, b) => a.localeCompare(b));
  return c.json({
    region: name,
    count: names.length,
    pokemon: names,
    scope: "cached pokemon with PokeAPI wild encounters",
  });
});

// visiting one pokemon fills its region cache, including older pokemon saved before this migration
app.get("/pokemon/:identifier/regions", async (c) => {
  const identifier = pokemonIdentifier.safeParse(c.req.param("identifier"));
  if (!identifier.success)
    return c.json({ error: "Provide a valid pokemon name or positive ID" }, 400);
  const entry = await findOrCachePokemon(identifier.data);
  // retry and surface an error here if the earlier best-effort check failed
  await ensureRegionsCached(entry.id);
  const rows = await db
    .select({ name: encounterArea.regionName })
    .from(pokemonEncounter)
    .innerJoin(encounterArea, eq(pokemonEncounter.areaId, encounterArea.id))
    .where(eq(pokemonEncounter.pokemonId, entry.id));
  return c.json({ pokemon: entry.name, regions: [...new Set(rows.map((row) => row.name))].sort() });
});

// show the stats, type matchups, and known encounter regions for one pokemon
// the attack examples use a single defending type, while real battles may use two
app.get("/pokemon/:identifier", async (c) => {
  const identifier = pokemonIdentifier.safeParse(c.req.param("identifier"));
  if (!identifier.success)
    return c.json({ error: "Provide a valid pokemon name or positive ID" }, 400);
  const entry = await findOrCachePokemon(identifier.data);
  // these reads are independent and the detail response needs all four results
  const [typeNames, defendingCharts, areaRows, cachedRow] = await Promise.all([
    getResourceNames("type"),
    Promise.all(entry.types.map(getTypeFromPokeApi)),
    db
      .select({ name: encounterArea.regionName })
      .from(pokemonEncounter)
      .innerJoin(encounterArea, eq(pokemonEncounter.areaId, encounterArea.id))
      .where(eq(pokemonEncounter.pokemonId, entry.id)),
    db
      .select({ regionsCachedAt: pokemon.regionsCachedAt })
      .from(pokemon)
      .where(eq(pokemon.id, entry.id))
      .limit(1),
  ]);
  const totalStats = Object.values(entry.stats).reduce((sum, value) => sum + value, 0);

  // incoming effectiveness asks how each attacking type affects this pokemon
  const defense = typeNames.map((name) => ({
    type: name,
    multiplier: incomingMultiplier(name, defendingCharts),
  }));
  // outgoing examples apply the scoring rule to one defending type at a time
  const attackAgainstSingleType = typeNames.map((name) => {
    const multiplier = typeMultiplierAgainstTypes(entry, [name]);
    const bonus = battleBonus(multiplier);
    return { type: name, multiplier, bonus, potentialScore: totalStats + bonus };
  });
  return c.json({
    id: entry.id,
    name: entry.name,
    stats: entry.stats,
    totalStats,
    types: entry.types,
    defense: {
      weakTo: defense.filter((item) => item.multiplier > 1),
      resists: defense.filter((item) => item.multiplier > 0 && item.multiplier < 1),
      immuneTo: defense.filter((item) => item.multiplier === 0),
    },
    attackAgainstSingleType,
    regions: [...new Set(areaRows.map((row) => row.name))].sort(),
    // an empty region list is meaningful only after the encounter lookup finished
    regionsComplete: cachedRow[0]?.regionsCachedAt != null,
    note: "Potential scores use this project's simple base-stat and type-bonus rule against one defending type, not official battle damage",
  });
});

// list every type and region published by pokeapi, including ones not inthecache yet
app.get("/types", async (c) => {
  const names = await getResourceNames("type");
  return c.json({ count: names.length, types: names, source: "PokeAPI" });
});

app.get("/regions", async (c) => {
  const names = await getResourceNames("region");
  return c.json({ count: names.length, regions: names, source: "PokeAPI" });
});

// if no route above matches the requested path, return a normal HTTP 404 json response instead of an html error page
app.notFound((c) => c.json({ error: "Not Found" }, 404));
// this is the centralized error handler for errors that escape a route
// known "not found" errors from pokeapi become a useful 404 fortheown api
// unexpected failures are logged in the server console and become a generic 500 response so internal details are not exposed to clients
app.onError((error, c) => {
  if (error instanceof HTTPError && error.response.status === 404) {
    return c.json({ error: "Pokemon or type not found in PokeAPI." }, 404);
  }
  if (error instanceof HTTPException) return error.getResponse();
  console.error(error);
  return c.json(
    { error: "Request failed. Check the PostgreSQL connection and PokeAPI availability." },
    500,
  );
});

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
