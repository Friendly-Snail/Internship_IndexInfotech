import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { format, parseISO } from "date-fns";
import { pokemonIdentifier } from "../../validation/fight";
import {
  addOwnedPokemon,
  getPokedex,
  getTrainer,
  removeOwnedPokemon,
  signIn,
  signOut,
  signUp,
  TrainerApiError,
} from "../api/trainer";
import type { PokedexList, Trainer } from "../api/trainer";

export function PokedexPage() {
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [collection, setCollection] = useState<PokedexList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pokemon, setPokemon] = useState("");
  const readRequest = useRef<AbortController | null>(null);
  const operation = useRef<AbortController | null>(null);

  async function syncSession(signal: AbortSignal) {
    // Hide previously loaded ownership data while verifying the current trainer.
    setCollection(null);
    const current = await getTrainer(signal);
    if (signal.aborted) return;
    setTrainer(current);
    if (current) {
      const entries = await getPokedex(signal);
      if (!signal.aborted) setCollection(entries);
    }
  }

  async function refresh() {
    if (operation.current) return;
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      await syncSession(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted) handleError(failure);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function handleError(failure: unknown) {
    if (failure instanceof TrainerApiError && failure.status === 401) {
      setTrainer(null);
      setCollection(null);
    }
    setError(failure instanceof Error ? failure.message : "The request failed. Please try again.");
  }

  useEffect(() => {
    void refresh();
    return () => {
      readRequest.current?.abort();
      operation.current?.abort();
    };
  }, []);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    readRequest.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setLoading(false);
    setError("");
    setMessage("");
    try {
      await action(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted) handleError(failure);
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setPassword("");
      }
      if (operation.current === controller) operation.current = null;
    }
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async (signal) => {
      if (mode === "signup") await signUp(name.trim(), email.trim(), password, signal);
      else await signIn(email.trim(), password, signal);
      if (signal.aborted) return;
      setPassword("");
      await syncSession(signal);
      if (!signal.aborted) setMessage("You’re signed in. Welcome to your Pokedex.");
    });
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = pokemonIdentifier.safeParse(pokemon);
    if (!parsed.success) {
      setError("Enter a Pokémon name or positive ID.");
      return;
    }
    void run(async (signal) => {
      await addOwnedPokemon(parsed.data, signal);
      if (signal.aborted) return;
      setPokemon("");
      await syncSession(signal);
      if (!signal.aborted) setMessage("Pokémon added to your Pokedex.");
    });
  }

  return (
    <section className="feature-page" aria-labelledby="page-title">
      <p className="eyebrow">YOUR POKEDEX</p>
      <h1 id="page-title">Make it your own</h1>
      <p className="page-description">Sign in to keep your personal Pokémon collection.</p>
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
                  void run(async (signal) => {
                    await signOut(signal);
                    if (!signal.aborted) {
                      setTrainer(null);
                      setCollection(null);
                      setMessage("You’re signed out.");
                    }
                  })
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
                          <td>{format(parseISO(entry.addedAt), "yyyy-MM-dd")}</td>
                          <td>
                            <button
                              className="button-secondary"
                              disabled={busy}
                              aria-label={`Remove ${entry.pokemon.name} from your Pokedex`}
                              onClick={() =>
                                void run(async (signal) => {
                                  await removeOwnedPokemon(entry.pokemon.id, signal);
                                  if (signal.aborted) return;
                                  await syncSession(signal);
                                  if (!signal.aborted)
                                    setMessage(`${entry.pokemon.name} removed from your Pokedex.`);
                                })
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
