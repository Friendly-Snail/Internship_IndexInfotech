import { useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "#/orpc/client";
import { authClient } from "#/lib/auth-client";
import { pokemonIdentifier } from "#/orpc/utils/pokemon";
export const Route = createFileRoute("/pokedex")({ component: PokedexPage });
function PokedexPage() {
  const session = authClient.useSession();
  const trainer = session.data?.user;
  const queryClient = useQueryClient();
  // User-specific keys prevent one trainer's data from appearing in another session.
  const collectionKey = [...orpc.pokedex.pokedex.key(), trainer?.id];
  const query = useQuery({ ...orpc.pokedex.pokedex.queryOptions({ enabled: Boolean(trainer), retry: false, queryKey: collectionKey }) });
  const collection = trainer && !query.error ? query.data : undefined;
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pokemon, setPokemon] = useState("");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.pokedex.key() });
  const fail = (failure: Error) => { setMessage(""); setError(failure.message); };
  const caught = useMutation(orpc.pokedex.catchPokemon.mutationOptions({
    onSuccess: async () => { setPokemon(""); setError(""); setMessage("Pokémon added to your Pokedex."); await invalidate(); }, onError: fail, retry: false,
  }));
  const remove = useMutation(orpc.pokedex.killPokemon.mutationOptions({
    onSuccess: async () => { setError(""); setMessage("Pokémon removed from your Pokedex."); await invalidate(); }, onError: fail, retry: false,
  }));
  async function clearPrivateData() {
    await queryClient.cancelQueries({ queryKey: orpc.pokedex.key() });
    queryClient.removeQueries({ queryKey: orpc.pokedex.key() });
    await queryClient.cancelQueries({ queryKey: orpc.battles.key() });
    queryClient.removeQueries({ queryKey: orpc.battles.key() });
  }
  const account = useMutation({
    mutationFn: async () => {
      const result = mode === "signup"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message || "Sign-in failed.");
    },
    onSuccess: async () => { await clearPrivateData(); await session.refetch(); setError(""); setMessage("You’re signed in."); },
    onError: fail, onSettled: () => setPassword(""), retry: false,
  });
  const logout = useMutation({
    mutationFn: async () => { const result = await authClient.signOut(); if (result.error) throw new Error(result.error.message || "Sign-out failed."); },
    onSuccess: async () => { await clearPrivateData(); await session.refetch(); setError(""); setMessage("You’re signed out."); }, onError: fail, retry: false,
  });
  const busy = account.isPending || logout.isPending || caught.isPending || remove.isPending;
  const loading = session.isPending || (Boolean(trainer) && query.isPending);
  async function refresh() { setError(""); await session.refetch(); if (trainer) await query.refetch(); }
  function authenticate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!busy) { setError(""); setMessage(""); account.mutate(); } }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = pokemonIdentifier.safeParse(pokemon);
    if (!parsed.success) { setError("Enter a Pokémon name or positive ID."); return; }
    setError(""); setMessage(""); caught.mutate({ pokemon: parsed.data });
  }
  return (
    <section className="feature-page" aria-labelledby="page-title">
      <p className="eyebrow">YOUR POKEDEX</p>
      <h1 id="page-title">Make it your own</h1>
      <p className="page-description">Sign in to keep your personal Pokémon collection.</p>
      {(query.error || session.error) && <p role="alert" className="search-error">{query.error?.message || session.error?.message}</p>}
      {error && (
        <div className="search-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <p role="status" className="loading-message">
          Checking your session and collection…
        </p>
      ) : trainer ? (
        <>
          <div className="trainer-card">
            <div>
              <p className="eyebrow">SIGNED IN AS</p>
              <h2>{trainer.name}</h2>
              <p>{trainer.email}</p>
            </div>
            <div className="trainer-actions">
              <button className="button-secondary" disabled={busy} onClick={() => void refresh()}>
                Refresh collection
              </button>
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() =>
                  logout.mutate()
                }
              >
                Log out
              </button>
            </div>
          </div>
          <form className="pokemon-search" onSubmit={add} noValidate>
            <label htmlFor="owned-pokemon">Add a Pokémon by name or ID</label>
            <div className="search-controls">
              <input
                id="owned-pokemon"
                value={pokemon}
                onChange={(event) => setPokemon(event.target.value)}
                placeholder="e.g. pikachu or 25"
                disabled={busy}
                maxLength={255}
              />
              <button className="button-primary" disabled={busy} type="submit">
                Add Pokémon
              </button>
            </div>
          </form>
          {collection && (
            <section className="owned-section" aria-labelledby="owned-title">
              <h2 id="owned-title">Your collection · {collection.count}</h2>
              {collection.entries.length ? (
                <div className="battle-table-wrap">
                  <table className="stats-table">
                    <caption>Owned Pokémon</caption>
                    <thead>
                      <tr>
                        <th scope="col">Pokémon</th>
                        <th scope="col">ID</th>
                        <th scope="col">Added</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collection.entries.map((entry) => (
                        <tr key={entry.pokemon.id}>
                          <th scope="row" className="pokemon-name-cell">
                            {entry.pokemon.name.replaceAll("-", " ")}
                          </th>
                          <td>{entry.pokemon.id}</td>
                          <td>{new Date(entry.addedAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="button-secondary"
                              disabled={busy}
                              aria-label={`Remove ${entry.pokemon.name} from your Pokedex`}
                              onClick={() =>
                                remove.mutate({ pokemonId: entry.pokemon.id })
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="search-empty">
                  <h3>Your collection starts here</h3>
                  <p>Add a Pokémon above to make your first entry.</p>
                </div>
              )}
              <p className="search-hint">
                Dates use your local timezone. Removing an entry keeps the shared Pokémon cache and
                battle history.
              </p>
            </section>
          )}
        </>
      ) : (
        <div className="auth-card">
          <div className="auth-modes" aria-label="Account options">
            <button
              className="button-secondary"
              aria-pressed={mode === "login"}
              disabled={busy}
              onClick={() => {
                setMode("login");
                setPassword("");
                setError("");
              }}
            >
              Log in
            </button>
            <button
              className="button-secondary"
              aria-pressed={mode === "signup"}
              disabled={busy}
              onClick={() => {
                setMode("signup");
                setPassword("");
                setError("");
              }}
            >
              Create account
            </button>
          </div>
          <h2>{mode === "login" ? "Welcome back" : "Meet your new Pokedex"}</h2>
          <form onSubmit={authenticate} className="auth-form">
            {mode === "signup" && (
              <label>
                Trainer name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  autoComplete="name"
                  disabled={busy}
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                disabled={busy}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "signup" ? 8 : undefined}
                maxLength={128}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                disabled={busy}
              />
            </label>
            {mode === "signup" && (
              <p className="search-hint">Use a password with at least 8 characters.</p>
            )}
            <button className="button-primary" disabled={busy} type="submit">
              {mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
          <button className="session-refresh" disabled={busy} onClick={() => void refresh()}>
            Refresh session
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className="loading-message">
          Updating your account or collection…
        </p>
      )}
    </section>
  );
}
