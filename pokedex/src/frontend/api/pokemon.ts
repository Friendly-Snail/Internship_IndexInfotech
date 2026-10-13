import type { PokemonStats } from "../../types/pokemon";

export type PokemonDetail = {
  id: number;
  name: string;
  stats: PokemonStats;
  totalStats: number;
  types: string[];
};

/** Read Pokemon details from our same-origin API, not directly from PokeAPI. */
export async function getPokemon(identifier: string, signal: AbortSignal): Promise<PokemonDetail> {
  let response: Response;
  try {
    response = await fetch(`/api/pokemon/${encodeURIComponent(identifier)}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("The search took too long. Please try again.");
    }
    throw new Error("Could not reach the Pokémon API. Check your connection and try again.");
  }
  if (!response.ok) {
    // prefer the API's helpful error, with a fallback if a proxy returns non-JSON
    const body = await response.json().catch(() => null);
    const fallback =
      response.status === 404
        ? "No Pokémon found. Check the name or ID and try again."
        : "The Pokémon API could not complete the search. Please try again.";
    throw new Error(typeof body?.error === "string" ? body.error : fallback);
  }
  return response.json();
}
