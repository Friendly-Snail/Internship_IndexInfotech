export type Trainer = { id: string; name: string; email: string; emailVerified: boolean };
export type OwnedPokemon = { pokemon: { id: number; name: string }; addedAt: string };
export type PokedexList = { count: number; entries: OwnedPokemon[] };

export class TrainerApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Cookies stay in the browser; session tokens and server secrets are never stored in frontend state. */
async function request<T>(
  path: string,
  signal: AbortSignal,
  method = "GET",
  body?: object,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      method === "GET"
        ? "Could not reach the API. Please try again."
        : "The response was interrupted. Refresh your session or Pokedex before trying again; the change may have completed.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : "The request could not be completed. Please try again.";
    throw new TrainerApiError(message, response.status);
  }
  if (!data)
    throw new Error("The API response could not be read. Refresh before retrying a change.");
  return data;
}

export async function getTrainer(signal: AbortSignal): Promise<Trainer | null> {
  try {
    return (await request<{ user: Trainer }>("/api/auth/me", signal)).user;
  } catch (error) {
    if (error instanceof TrainerApiError && error.status === 401) return null;
    throw error;
  }
}
export const signUp = (name: string, email: string, password: string, signal: AbortSignal) =>
  request("/api/auth/sign-up/email", signal, "POST", { name, email, password });
export const signIn = (email: string, password: string, signal: AbortSignal) =>
  request("/api/auth/sign-in/email", signal, "POST", { email, password });
export const signOut = (signal: AbortSignal) => request("/api/auth/sign-out", signal, "POST", {});
export const getPokedex = (signal: AbortSignal) => request<PokedexList>("/api/pokedex", signal);
export const addOwnedPokemon = (pokemon: string, signal: AbortSignal) =>
  request<OwnedPokemon>("/api/pokedex/create", signal, "POST", { pokemon });
export const removeOwnedPokemon = (id: number, signal: AbortSignal) =>
  request<{ removed: boolean; pokemonId: number }>(`/api/pokedex/${id}`, signal, "DELETE");
