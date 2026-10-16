import { useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "#/orpc/client";
import { pokemonIdentifier } from "#/orpc/utils/pokemon";
export const Route = createFileRoute("/pokemon")({ component: PokemonPage });
const stats = [
  ["hp", "HP"],
  ["attack", "Attack"],
  ["defense", "Defense"],
  ["special-attack", "Special attack"],
  ["special-defense", "Special defense"],
  ["speed", "Speed"],
] as const;

/** Keep the original lookup UI; oRPC supplies typed results through TanStack Query. */
function PokemonPage() {
  const [identifier, setIdentifier] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [validationError, setValidationError] = useState("");
  // Fetch only the submitted identifier, not every keystroke.
  const query = useQuery(orpc.pokemon.byId.queryOptions({ input: { pokemonId: submitted }, enabled: Boolean(submitted), retry: false }));
  const pokemon = query.data;
  const loading = query.isFetching;
  const error = validationError || query.error?.message || "";
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = pokemonIdentifier.safeParse(identifier);
    if (!parsed.success) { setSubmitted(""); setValidationError("Enter a Pokémon name or positive ID."); return; }
    setValidationError("");
    if (submitted === parsed.data) void query.refetch();
    else setSubmitted(parsed.data);
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
