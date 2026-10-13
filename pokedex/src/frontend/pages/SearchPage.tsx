import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getSearchOptions, searchCachedPokemon } from "../api/search";
import type { SearchKind, SearchResult } from "../api/search";

/** Each panel keeps its own options, request, result, and error state. */
function SearchPanel({ kind }: { kind: SearchKind }) {
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const request = useRef<AbortController | null>(null);
  const label = kind === "type" ? "Type" : "Region";

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError("");
    getSearchOptions(kind, controller.signal)
      .then((names) => {
        if (controller.signal.aborted) return;
        setOptions(names);
        setSelected(names[0] ?? "");
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setOptionsError(failure instanceof Error ? failure.message : "Could not load options.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setOptionsLoading(false);
      });
    return () => controller.abort();
  }, [kind, retry]);
  useEffect(() => () => request.current?.abort(), []);

  function changeSelection(value: string) {
    request.current?.abort();
    setSelected(value);
    setResult(null);
    setError("");
    setLoading(false);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || optionsLoading || optionsError) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await searchCachedPokemon(kind, selected, controller.signal);
      if (!controller.signal.aborted) setResult(data);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Search failed. Please try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className="search-panel" aria-labelledby={`${kind}-title`}>
      <h2 id={`${kind}-title`}>Search by {kind}</h2>
      <p className="cache-explanation">
        {kind === "type"
          ? "Shows matching Pokémon already cached in this app. This is not the full PokeAPI roster."
          : "Shows cached Pokémon with recorded wild encounters in this region. A region describes encounter locations, not a Pokémon’s generation."}
      </p>
      <form onSubmit={search}>
        <label htmlFor={`${kind}-select`}>{label}</label>
        <div className="search-controls">
          <select
            id={`${kind}-select`}
            value={selected}
            onChange={(event) => changeSelection(event.target.value)}
            disabled={optionsLoading || Boolean(optionsError) || !options.length}
          >
            {!options.length && (
              <option value="">
                {optionsLoading ? "Loading options…" : "No options available"}
              </option>
            )}
            {options.map((name) => (
              <option value={name} key={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="button-primary"
            disabled={optionsLoading || Boolean(optionsError) || !selected || loading}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>
      {optionsLoading && (
        <p role="status" className="search-hint">
          Loading {kind} options…
        </p>
      )}
      {optionsError && (
        <div className="search-error" role="alert">
          <p>{optionsError}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry options
          </button>
        </div>
      )}
      {!optionsLoading && !optionsError && !options.length && (
        <p className="search-hint">The API returned no {kind} options.</p>
      )}
      {error && (
        <div className="search-error" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <p role="status" className="loading-message">
          Searching cached Pokémon…
        </p>
      )}
      {result && (
        <div className="search-results">
          <p role="status" className="result-count">
            <strong>{result.count}</strong> cached Pokémon found for{" "}
            <strong>{kind === "type" ? result.type : result.region}</strong>.
          </p>
          <p className="search-hint">Scope: {result.scope}</p>
          {result.pokemon.length ? (
            <table className="stats-table">
              <caption>{label} search results</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Pokémon</th>
                </tr>
              </thead>
              <tbody>
                {result.pokemon.map((name, index) => (
                  <tr key={name}>
                    <td>{index + 1}</td>
                    <th scope="row" className="pokemon-name-cell">
                      {name.replaceAll("-", " ")}
                    </th>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="search-empty">
              <h3>No cached matches yet</h3>
              <p>
                Look up Pokémon on the Pokémon page to populate the cache, then search again. Zero
                cached matches does not mean no Pokémon exist for this {kind}.
              </p>
            </div>
          )}
        </div>
      )}
      {!result && !loading && !error && !optionsLoading && !optionsError && options.length > 0 && (
        <p className="search-hint">Choose a {kind} and select Search to see cached matches.</p>
      )}
    </section>
  );
}

export function SearchPage() {
  return (
    <section className="feature-page" aria-labelledby="page-title">
      <p className="eyebrow">TYPE & REGION</p>
      <h1 id="page-title">Follow your curiosity</h1>
      <p className="page-description">
        Explore your cached Pokémon by type or wild encounter region.
      </p>
      <div className="search-panel-grid">
        <SearchPanel kind="type" />
        <SearchPanel kind="region" />
      </div>
    </section>
  );
}
