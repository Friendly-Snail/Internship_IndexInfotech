import type {
  TypeRelations,
  CachedPokemon,
  ApiPokemon,
  ApiType,
  NamedResourceList,
  ApiEncounter,
  ApiArea,
  ApiLocation,
} from "../types/pokemon";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { pokeApi } from "../api/pokeapi";
import {
  encounterArea,
  pokemon,
  pokemonElementType,
  pokemonEncounter,
  pokemonType,
  region,
  resourceListCache,
  typeMatchup,
} from "../db/schema/pokemon";

/**
 * Create shared Pokemon lookup and cache helpers.
 *
 * @returns Helpers for cached Pokemon, resource lists, and type charts.
 */
export function createPokemonService() {
  // this helper performs the actual api communication for a pokemon
  // ky sends an http GET request across the network, await pauses this function until the response arrives,
  // and .json<ApiPokemon>() parses the response body from json into a javascript object we can use
  // encodeURIComponent makes the identifier safe to place inside a url
  /**
   * Fetch a Pokemon directly from PokeAPI without saving it.
   *
   * @param identifier - Validated Pokemon name or string ID.
   * @returns The upstream Pokemon data.
   * @throws If the upstream request or JSON parsing fails.
   */
  async function getPokemonFromPokeApi(identifier: string): Promise<ApiPokemon> {
    return pokeApi.get(`pokemon/${encodeURIComponent(identifier)}`).json<ApiPokemon>();
  }

  // this works the same way as getPokemonFromPokeApi, but it talks to pokeapi's /type endpoint
  // we use this for type effectiveness data when caching a pokemon
  /**
   * Fetch the effectiveness chart for one Pokemon type.
   *
   * @param identifier - Type name or string ID accepted by PokeAPI.
   * @returns The upstream type data.
   * @throws If the upstream request or JSON parsing fails.
   */
  async function getTypeFromPokeApi(identifier: string): Promise<ApiType> {
    return pokeApi.get(`type/${encodeURIComponent(identifier)}`).json<ApiType>();
  }

  type ResourceListName = "type" | "region";

  /**
   * Fetch every page of a type or region list before considering it complete.
   *
   * @param resource - The PokeAPI resource list to fetch.
   * @returns Unique resource names in the order first encountered.
   * @throws If any page cannot be fetched or parsed.
   */
  async function fetchResourceNames(resource: ResourceListName): Promise<string[]> {
    const names = new Set<string>();
    let next: string | null = `${resource}?limit=100`;
    while (next) {
      const page: NamedResourceList = await pokeApi.get(next).json<NamedResourceList>();
      for (const entry of page.results) names.add(entry.name);
      next = page.next;
    }
    return [...names];
  }

  /**
   * Fill an incomplete resource list transactionally, then read its names from the db.
   *
   * @param resource - The type or region list to read.
   * @returns Resource names sorted by the db.
   * @throws If an upstream request or database operation fails.
   */
  async function getResourceNames(resource: ResourceListName): Promise<string[]> {
    const resourceTable = resource === "type" ? pokemonElementType : region;
    const [completedList] = await db
      .select({ cachedAt: resourceListCache.cachedAt })
      .from(resourceListCache)
      .where(eq(resourceListCache.resource, resource))
      .limit(1);

    if (!completedList) {
      // existing names can come from individual Pokemon lookups; they do not
      // prove that the whole list is cached. Fetch all pages before writing.
      const names = await fetchResourceNames(resource);
      const nameRows = names.map((name) => ({ name }));
      await db.transaction(async (tx) => {
        if (nameRows.length > 0) {
          await tx.insert(resourceTable).values(nameRows).onConflictDoNothing();
        }
        // this also records a successfully fetched empty list. any fetch or
        // transaction failure leaves the list incomplete and eligible for retry
        await tx
          .insert(resourceListCache)
          .values({ resource, cachedAt: new Date() })
          .onConflictDoNothing();
      });
    }

    const rows = await db
      .select({ name: resourceTable.name })
      .from(resourceTable)
      .orderBy(resourceTable.name);
    return rows.map((row) => row.name);
  }

  // load battle data from the normalized tables rather than from the old json columns
  /**
   * Load a Pokemon with its fixed stats, ordered types, and attacking matchups.
   *
   * @param id - The cached Pokemon ID.
   * @returns The data needed for battle scoring.
   * @throws If the Pokemon or its type memberships are missing, or a database query fails.
   */
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

  type EncounterAreaRow = typeof encounterArea.$inferInsert;

  /**
   * Read a positive integer encounter-area ID from a PokeAPI URL.
   *
   * @param url - The encounter-area resource URL.
   * @returns The numeric ID at the end of the URL.
   * @throws If the URL or its ID is invalid.
   */
  function getEncounterAreaId(url: string): number {
    const pathParts = new URL(url).pathname.split("/").filter(Boolean);
    const encounterAreaId = Number(pathParts.at(-1));
    if (!Number.isSafeInteger(encounterAreaId) || encounterAreaId <= 0) {
      throw new Error("Invalid PokeAPI area ID");
    }
    return encounterAreaId;
  }

  /**
   * Reuse a cached encounter area or fetch its location and region.
   *
   * @param areaUrl - PokeAPI encounter-area URL.
   * @param locationRequests - Shared map that reuses in-flight location requests across areas.
   * @returns An area row to cache, or null when its location has no known region.
   * @throws If the area ID, upstream response, or database lookup fails.
   */
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

  /**
   * Cache encounter regions and mark a completed check, including an empty result.
   *
   * @param id - The cached Pokemon ID whose encounters should be checked.
   * @returns A promise that resolves after the check; missing or already checked Pokemon are skipped.
   * @throws If an upstream request or transactional write fails; the completion marker remains unset.
   */
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

  // first try the local cache, then fetch any pokemon we have not stored yet
  /**
   * Reuse a Pokemon from the database or fetch and cache its normalized data.
   *
   * @param identifier - A Pokemon name or positive string ID already normalized by validation.
   * @returns Cached battle data after the encounter-region check completes.
   * @throws If upstream data is invalid or a request or database operation fails.
   */
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
      await ensureRegionsCached(existing.id);
      return loadCachedPokemon(existing.id);
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

    // Reject incomplete upstream stats instead of inventing defaults.
    /**
     * Read one required base stat from the fetched Pokemon.
     *
     * @param name - PokeAPI stat name, such as special-attack.
     * @returns A nonnegative integer base stat.
     * @throws If the stat is missing or is not a nonnegative integer.
     */
    function baseStat(name: string): number {
      ///TODO this is kiiind of overkill here because we already know PokeAPI is reliable; this kind of contaminates the code base a bit
      const value = apiPokemon.stats.find((entry) => entry.stat.name === name)?.base_stat;
      if (value === undefined || !Number.isInteger(value) || value < 0) {
        throw new Error(`Missing or invalid ${name} stat for ${apiPokemon.name}.`);
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

  return { findOrCachePokemon, getResourceNames, getTypeFromPokeApi };
}

export type PokemonService = ReturnType<typeof createPokemonService>;
