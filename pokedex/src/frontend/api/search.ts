export type SearchKind = "type" | "region";
export type SearchResult = {
  count: number;
  pokemon: string[];
  scope: string;
  type?: string;
  region?: string;
};

/** Shared read-only requests for resource selectors and cached search results. */
async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("The request took too long. Please try again.");
    }
    throw new Error("Could not reach the API. Check your connection and try again.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "The API could not complete the request. Please try again.",
    );
  }
  return response.json();
}

export async function getSearchOptions(kind: SearchKind, signal: AbortSignal): Promise<string[]> {
  const body = await readJson<{ types?: string[]; regions?: string[] }>(
    `/api/${kind === "type" ? "types" : "regions"}`,
    signal,
  );
  return (kind === "type" ? body.types : body.regions) ?? [];
}

export function searchCachedPokemon(
  kind: SearchKind,
  value: string,
  signal: AbortSignal,
): Promise<SearchResult> {
  const resource = kind === "type" ? "types" : "regions";
  const params = new URLSearchParams({ [kind]: value });
  return readJson(`/api/${resource}/${kind}-search?${params}`, signal);
}
