import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { pokemonIdentifier } from "../../validation/fight";
import { getPokemon } from "../api/pokemon";
import type { PokemonDetail } from "../api/pokemon";

const stats = [
  ["hp", "HP"],
  ["attack", "Attack"],
  ["defense", "Defense"],
  ["special-attack", "Special attack"],
  ["special-defense", "Special defense"],
  ["speed", "Speed"],
] as const;

/** Search state belongs to this page; the API handles caching and stat calculations. */
export function PokemonPage() {
  const [identifier, setIdentifier] = useState("");
  const [pokemon, setPokemon] = useState<PokemonDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);

  // leaving the page cancels its request so late results cannot update an unmounted page
  useEffect(() => () => request.current?.abort(), []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.current?.abort();
    setPokemon(null);
    setError("");
    const parsed = pokemonIdentifier.safeParse(identifier);
    if (!parsed.success) {
      setError("Enter a Pokémon name such as pikachu or mr-mime, or a positive ID such as 25.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await getPokemon(parsed.data, controller.signal);
      if (!controller.signal.aborted) setPokemon(result);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof Error ? failure.message : "The search failed. Please try again.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className="feature-page" aria-labelledby="page-title">
      <p className="eyebrow">POKÉMON LOOKUP</p>
      <h1 id="page-title">Find your Pokémon</h1>
      <p className="page-description">
        A familiar favorite or a new discovery. Explore its types and base stats.
      </p>
      <form className="pokemon-search" onSubmit={search} noValidate>
        <label htmlFor="pokemon-identifier">Pokémon name or ID</label>
        <div className="search-controls">
          <input
            id="pokemon-identifier"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="e.g. pikachu or 25"
            maxLength={255}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={error ? "search-hint search-error" : "search-hint"}
            aria-invalid={Boolean(error)}
          />
          <button className="button-primary" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search Pokémon"}
          </button>
        </div>
        <p id="search-hint" className="search-hint">
          Names and IDs both work. Use hyphens for names like mr-mime.
        </p>
      </form>
      {error && (
        <div id="search-error" className="search-error" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <p className="loading-message" role="status">
          Looking up your Pokémon…
        </p>
      )}
      {!loading && !error && !pokemon && (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true">
            ✦
          </span>
          <h2>Who will you discover?</h2>
          <p>Enter a name or ID above to see a Pokémon’s types and six base stats.</p>
        </div>
      )}
      {pokemon && (
        <article className="pokemon-result" aria-labelledby="pokemon-name">
          <div className="pokemon-summary">
            <div>
              <p className="eyebrow">POKÉMON #{pokemon.id}</p>
              <h2 id="pokemon-name" className="pokemon-name">
                {pokemon.name.replaceAll("-", " ")}
              </h2>
              <ul className="type-list" aria-label="Pokémon types">
                {pokemon.types.map((type) => (
                  <li className="type-badge" key={type}>
                    {type}
                  </li>
                ))}
              </ul>
            </div>
            <div className="stat-total">
              <span className="small-label">TOTAL BASE STATS</span>
              <strong>{pokemon.totalStats}</strong>
            </div>
          </div>
          <p role="status" className="result-status">
            Found {pokemon.name}.
          </p>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <caption>Base stats</caption>
              <thead>
                <tr>
                  <th scope="col">Stat</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>{pokemon.stats[key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}
