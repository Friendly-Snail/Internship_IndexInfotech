import ky from "ky";

/**
 * shared HTTP client for PokeAPI requests
 * relative paths resolve under /api/v2/; absolute URLs from PokeAPI are used directly
 * call .json<ResponseType>() to describe the response data to TypeScript
 */
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
