import { db } from "#/db";
import {
  encounterArea,
  pokemon,
  pokemonElementType,
  pokemonEncounter,
  pokemonType,
  region,
  typeMatchup,
} from "#/db/schema/pokemon";
import { eq, inArray } from "drizzle-orm";
import type {
  ApiArea,
  ApiEncounter,
  ApiLocation,
  ApiPokemon,
  ApiType,
  Attacker,
  BattleScore,
  CachedPokemon,
  EncounterAreaRow,
  TeamTotals,
  TypeRelations,
} from "../types";
import ky, { isHTTPError } from "ky";
import { ORPCError } from "@orpc/server";

export const pokeApi = ky.create({
  // the trailing slash preserves /api/v2/ when resolving relative paths
  baseUrl: "https://pokeapi.co/api/v2/",
  headers: {
    Accept: "application/json",
  },
  // these match ky's defaults and give us one place to adjust request behavior
  timeout: 10_000,
  retry: 2,
});

function getEncounterAreaId(url: string): number {
  const pathParts = new URL(url).pathname.split("/").filter(Boolean);
  const encounterAreaId = Number(pathParts.at(-1));
  if (!Number.isSafeInteger(encounterAreaId) || encounterAreaId <= 0) {
    throw new Error("Invalid PokeAPI area ID");
  }
  return encounterAreaId;
}

async function loadEncounterArea(
  areaUrl: string,
  locationRequests: Map<string, Promise<ApiLocation>>,
): Promise<EncounterAreaRow | null> {
  const encounterAreaId = getEncounterAreaId(areaUrl);
  const [cachedArea] = await db
    .select()
    .from(encounterArea)
    .where(eq(encounterArea.id, encounterAreaId))
    .limit(1);
  if (cachedArea) return cachedArea;

  const area = await pokeApi.get(areaUrl).json<ApiArea>();
  const locationUrl = area.location.url;
  let locationRequest = locationRequests.get(locationUrl);
  if (!locationRequest) {
    locationRequest = pokeApi.get(locationUrl).json<ApiLocation>();
    locationRequests.set(locationUrl, locationRequest);
  }
  const location = await locationRequest;
  // locations without a known region cannot appear in region search
  if (!location.region) return null;

  return {
    id: area.id,
    name: area.name,
    locationName: location.name,
    regionName: location.region.name,
  };
}

async function ensureRegionsCached(id: number): Promise<void> {
  const [cachedPokemon] = await db
    .select({ regionsCachedAt: pokemon.regionsCachedAt })
    .from(pokemon)
    .where(eq(pokemon.id, id))
    .limit(1);
  if (!cachedPokemon || cachedPokemon.regionsCachedAt) return;

  const encounters = await pokeApi.get(`pokemon/${id}/encounters`).json<ApiEncounter[]>();
  const uniqueAreaUrls = new Set(encounters.map((encounter) => encounter.location_area.url));
  const areaUrls = [...uniqueAreaUrls];
  const areaRows: EncounterAreaRow[] = [];
  // share location requests across areas, including requests still in flight
  const locationRequests = new Map<string, Promise<ApiLocation>>();
  const batchSize = 6;

  for (let offset = 0; offset < areaUrls.length; offset += batchSize) {
    const batchUrls = areaUrls.slice(offset, offset + batchSize);
    const batchRequests = batchUrls.map((url) => loadEncounterArea(url, locationRequests));
    const batchAreas = await Promise.all(batchRequests);
    for (const area of batchAreas) {
      if (area !== null) areaRows.push(area);
    }
  }

  const regionNames = new Set(areaRows.map((area) => area.regionName));
  const regionRows = [...regionNames].map((name) => ({ name }));
  const encounterLinks = areaRows.map((area) => ({ pokemonId: id, encounterAreaId: area.id }));

  // keep foreign-key writes and the completion marker atomic. a failed check
  // leaves regionsCachedAt null so a later request can try again
  await db.transaction(async (tx) => {
    if (regionRows.length > 0) {
      await tx.insert(region).values(regionRows).onConflictDoNothing();
    }
    if (areaRows.length > 0) {
      await tx.insert(encounterArea).values(areaRows).onConflictDoNothing();
      await tx.insert(pokemonEncounter).values(encounterLinks).onConflictDoNothing();
    }
    // an empty encounter list is still a completed check
    await tx.update(pokemon).set({ regionsCachedAt: new Date() }).where(eq(pokemon.id, id));
  });
}

async function loadCachedPokemon(id: number): Promise<CachedPokemon> {
  const [row] = await db.select().from(pokemon).where(eq(pokemon.id, id)).limit(1);
  if (!row) throw new Error("Pokemon could not be loaded from the db.");

  const memberships = await db
    .select()
    .from(pokemonType)
    .where(eq(pokemonType.pokemonId, id))
    .orderBy(pokemonType.slot);

  if (memberships.length === 0) {
    throw new Error(`Missing normalized data for ${row.name}; check the backfill migrations.`);
  }
  const types = memberships.map((entry) => entry.typeName);
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
    stats: {
      hp: row.hp,
      attack: row.attack,
      defense: row.defense,
      "special-attack": row.specialAttack,
      "special-defense": row.specialDefense,
      speed: row.speed,
    },
    types,
    matchups,
  };
}

export async function findOrCachePokemon(identifier: string): Promise<CachedPokemon> {
  // the route already validates identifiers, so a positive whole number is an id
  const numericId = Number(identifier);
  const isId = Number.isSafeInteger(numericId) && numericId > 0;
  const [existing] = await db
    .select({ id: pokemon.id })
    .from(pokemon)
    .where(isId ? eq(pokemon.id, numericId) : eq(pokemon.name, identifier))
    .limit(1);
  if (existing) {
    await ensureRegionsCached(existing.id);
    return loadCachedPokemon(existing.id);
  }

  async function getPokemonFromPokeApi(identifier: string): Promise<ApiPokemon> {
    try {
      return await pokeApi.get(`pokemon/${encodeURIComponent(identifier)}`).json<ApiPokemon>();
    } catch (error) {
      // surface unknown names and ids as a readable 404 instead of a generic server error
      if (isHTTPError(error) && error.response.status === 404) {
        throw new ORPCError("NOT_FOUND", { message: `No Pokemon found for "${identifier}".` });
      }
      throw error;
    }
  }

  async function getTypeFromPokeApi(identifier: string): Promise<ApiType> {
    return pokeApi.get(`type/${encodeURIComponent(identifier)}`).json<ApiType>();
  }

  const apiPokemon = await getPokemonFromPokeApi(identifier);
  const types = [...apiPokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => entry.type.name);
  const typeData = await Promise.all(types.map(getTypeFromPokeApi));
  // build one lookup object, pairing each type with the response at the same index
  const typeRelations = types.reduce<Record<string, TypeRelations>>((result, type, index) => {
    const relations = typeData[index].damage_relations;
    result[type] = {
      doubleDamageTo: relations.double_damage_to.map((entry) => entry.name),
      halfDamageTo: relations.half_damage_to.map((entry) => entry.name),
      noDamageTo: relations.no_damage_to.map((entry) => entry.name),
    };
    return result;
  }, {});

  // PokeAPI supplies integer base stats; only check that the requested stat exists.
  /**
   * Read one required base stat from the fetched Pokemon.
   *
   * @param name - PokeAPI stat name, such as special-attack.
   * @returns The base stat supplied by PokeAPI.
   * @throws If the required stat is missing from the response.
   */
  function baseStat(name: string): number {
    const value = apiPokemon.stats.find((entry) => entry.stat.name === name)?.base_stat;
    if (value === undefined) {
      throw new Error(`Missing ${name} stat for ${apiPokemon.name}.`);
    }
    return value;
  }
  const statColumns = {
    hp: baseStat("hp"),
    attack: baseStat("attack"),
    defense: baseStat("defense"),
    specialAttack: baseStat("special-attack"),
    specialDefense: baseStat("special-defense"),
    speed: baseStat("speed"),
  };

  // a transaction keeps the pokemon, its stats, and its types together
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(pokemon)
      .values({
        id: apiPokemon.id,
        name: apiPokemon.name,
        ...statColumns,
      })
      .onConflictDoNothing()
      .returning({ id: pokemon.id });
    // another request may have inserted the same pokemon first
    // its related data belongs to that request, so skip inserting it twice
    if (!inserted[0]) return;
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
  await ensureRegionsCached(apiPokemon.id);
  return loadCachedPokemon(apiPokemon.id);
}

export function typeMultiplierAgainstTypes(attacker: Attacker, defendingTypes: string[]): number {
  let best = 0;

  for (const attackingType of attacker.types) {
    // start at normal effectiveness for this attacking type
    let multiplier = 1;

    for (const defendingType of defendingTypes) {
      // multiply against each defending type, so a dual type can change the result twice
      // a missing matchup is neutral and contributes 1
      multiplier *= attacker.matchups[attackingType]?.[defendingType] ?? 1;
    }

    // keep the strongest result found across the attacker's types
    best = Math.max(best, multiplier);
  }

  // a pokemon without a recorded type falls back to neutral effectiveness
  return attacker.types.length === 0 ? 1 : best;
}

export function battleBonus(multiplier: number): number {
  if (multiplier >= 4) return 100;
  if (multiplier > 1) return 50;
  if (multiplier === 0) return -100;
  if (multiplier < 1) return -50;
  return 0;
}

export function scoreTeams(
  team1: CachedPokemon[],
  team2: CachedPokemon[],
): {
  team1: BattleScore[];
  team2: BattleScore[];
} {
  if (team1.length === 0 || team2.length === 0) {
    throw new Error("Both teams must contain at least one Pokemon.");
  }

  /**
   * Add the rounded average opponent bonus to one Pokemon's total base stats.
   *
   * @param attacker - The Pokemon being scored.
   * @param opponents - The nonempty opposing team.
   * @returns Base-stat total, integer battle score, and average multiplier rounded to two decimals.
   */
  function scoreMember(attacker: CachedPokemon, opponents: CachedPokemon[]): BattleScore {
    const totalStats = Object.values(attacker.stats).reduce((sum, value) => sum + value, 0);
    let bonusTotal = 0;
    let multiplierTotal = 0;
    for (const defender of opponents) {
      const multiplier = typeMultiplierAgainstTypes(attacker, defender.types);
      bonusTotal += battleBonus(multiplier);
      multiplierTotal += multiplier;
    }
    return {
      totalStats,
      score: totalStats + Math.round(bonusTotal / opponents.length),
      typeMultiplier: Math.round((multiplierTotal / opponents.length) * 100) / 100,
    };
  }

  return {
    team1: team1.map((member) => scoreMember(member, team2)),
    team2: team2.map((member) => scoreMember(member, team1)),
  };
}

export function summarizeTeam(team: CachedPokemon[], scores: BattleScore[]): TeamTotals {
  return {
    score: scores.reduce((sum, battle) => sum + battle.score, 0),
    totalStats: scores.reduce((sum, battle) => sum + battle.totalStats, 0),
    speed: team.reduce((sum, entry) => sum + entry.stats.speed, 0),
  };
}

export function decideTeamResult(
  team1: TeamTotals,
  team2: TeamTotals,
): {
  result: "TEAM1_WIN" | "TEAM2_WIN" | "TIE";
  decidedBy: string;
} {
  // subtract team2 from team1 so a positive difference favors team1
  // the order matters because later values only break ties in earlier values
  const comparisons = [
    { difference: team1.score - team2.score, reason: "team battle score" },
    { difference: team1.totalStats - team2.totalStats, reason: "total base stats" },
    { difference: team1.speed - team2.speed, reason: "speed" },
  ];

  for (const comparison of comparisons) {
    // return as soon as this comparison identifies a winner
    if (comparison.difference > 0) {
      return { result: "TEAM1_WIN", decidedBy: comparison.reason };
    }
    if (comparison.difference < 0) {
      return { result: "TEAM2_WIN", decidedBy: comparison.reason };
    }

    // a difference of zero moves us to the next tie breaker
  }

  // every comparison was equal, so neither team wins
  return {
    result: "TIE",
    decidedBy: "tie: equal battle score, total base stats, and speed",
  };
}

export function displayPokemon(
  entry: CachedPokemon,
  battle: BattleScore,
  result: "WIN" | "LOSE" | "TIE",
) {
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
