import { useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "#/orpc/client";
export const Route = createFileRoute("/search")({ component: SearchPage });
function SearchPanel({ kind }: { kind: "type" | "region" }) {
  const [selectedValue, setSelected] = useState("");
  const [submitted, setSubmitted] = useState("");
  const types = useQuery(orpc.types.all.queryOptions({ enabled: kind === "type", retry: false }));
  const regions = useQuery(orpc.regions.all.queryOptions({ enabled: kind === "region", retry: false }));
  const optionsQuery = kind === "type" ? types : regions;
  const options = (kind === "type" ? types.data?.types : regions.data?.regions) ?? [];
  const selected = selectedValue || options[0] || "";
  const typeResult = useQuery(orpc.types.search.queryOptions({ input: { type: submitted }, enabled: kind === "type" && Boolean(submitted), retry: false }));
  const regionResult = useQuery(orpc.regions.search.queryOptions({ input: { region: submitted }, enabled: kind === "region" && Boolean(submitted), retry: false }));
  const query = kind === "type" ? typeResult : regionResult;
  const optionsLoading = optionsQuery.isPending;
  const optionsError = optionsQuery.error?.message || "";
  const loading = query.isFetching;
  const error = query.error?.message || "";
  const result = query.data;
  const label = kind === "type" ? "Type" : "Region";
  function changeSelection(value: string) { setSelected(value); setSubmitted(""); }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (submitted === selected) void query.refetch();
    else setSubmitted(selected);
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
            onClick={() => void optionsQuery.refetch()}
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
            <strong>{submitted}</strong>.
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

function SearchPage() {
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
