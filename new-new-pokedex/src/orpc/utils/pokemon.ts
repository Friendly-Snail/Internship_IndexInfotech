import { db } from "#/db";
import { pokemonElementType, region, resourceListCache } from "#/db/schema";
import { eq } from "drizzle-orm";
import type { ApiType, IncomingChart, NamedResourceList } from "../types";
import { pokeApi } from "./battles";

type ResourceListName = "type" | "region";

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

export async function getResourceNames(resource: ResourceListName): Promise<string[]> {
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

export async function getTypeFromPokeApi(identifier: string): Promise<ApiType> {
  return pokeApi.get(`type/${encodeURIComponent(identifier)}`).json<ApiType>();
}

export function incomingMultiplier(
  attackingType: string,
  defendingCharts: IncomingChart[],
): number {
  let multiplier = 1;

  defendingCharts.forEach((chart) => {
    // return only skips this callback; keep an immunity result at zero for later charts
    if (multiplier === 0) return;

    const relations = chart.damage_relations;

    // immunity makes the entire result zero, even if the other type is weak to the attack
    if (relations.no_damage_from.some((entry) => entry.name === attackingType)) {
      multiplier = 0;
      return;
    }

    // multiply once for each defending type that is weak or resistant
    // for example, 2 times 0.5 becomes 1, while 2 times 2 becomes 4
    if (relations.double_damage_from.some((entry) => entry.name === attackingType)) multiplier *= 2;
    if (relations.half_damage_from.some((entry) => entry.name === attackingType)) multiplier *= 0.5;
  });

  return multiplier;
}
