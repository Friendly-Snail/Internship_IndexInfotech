import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { errorMessage } from "#/lib/api-errors";
import { client } from "#/orpc/client";

export const Route = createFileRoute("/search")({ component: SearchPage });

type SearchKind = "type" | "region";

const unreachable = "Could not reach the API. Check your connection and try again.";

/** Each panel keeps its own options, request, result, and error state. */
function SearchPanel({ kind }: { kind: SearchKind }) {
  // the option of the last search; null until the user selects Search
  const [submitted, setSubmitted] = useState<string | null>(null);
  const label = kind === "type" ? "Type" : "Region";

  // both kinds share one panel, so each query normalizes its oRPC response
  const optionsQuery = useQuery({
    queryKey: ["search-options", kind],
    queryFn: async ({ signal }) =>
      kind === "type"
        ? (await client.types.list(undefined, { signal })).types
        : (await client.regions.list(undefined, { signal })).regions,
  });
  const resultQuery = useQuery({
    queryKey: ["search", kind, submitted],
    queryFn: async ({ signal }) => {
      const value = submitted ?? "";
      if (kind === "type") {
        const { type, ...body } = await client.types.search({ type: value }, { signal });
        return { ...body, value: type };
      }
      const { region, ...body } = await client.regions.search({ region: value }, { signal });
      return { ...body, value: region };
    },
    enabled: submitted !== null,
  });

  const options = optionsQuery.data ?? [];
  const optionsLoading = optionsQuery.isFetching;
  const optionsError =
    optionsQuery.isError && !optionsLoading ? errorMessage(optionsQuery.error, unreachable) : "";
  const loading = resultQuery.isFetching;
  const error = resultQuery.isError && !loading ? errorMessage(resultQuery.error, unreachable) : "";
  const result = loading ? undefined : resultQuery.data;

  const form = useForm({
    defaultValues: { choice: "" },
    onSubmit: ({ value }) => {
      const selected = value.choice || options[0] || "";
      if (!selected || optionsLoading || optionsError) return;
      // searching the same option again asks the API again, like a new search
      if (selected === submitted) void resultQuery.refetch();
      else setSubmitted(selected);
    },
  });

  return (
    <section className="search-panel" aria-labelledby={`${kind}-title`}>
      <h2 id={`${kind}-title`}>Search by {kind}</h2>
      <p className="cache-explanation">
        {kind === "type"
          ? "Shows matching Pokémon already cached in this app. This is not the full PokeAPI roster."
          : "Shows cached Pokémon with recorded wild encounters in this region. A region describes encounter locations, not a Pokémon’s generation."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <label htmlFor={`${kind}-select`}>{label}</label>
        <form.Field name="choice" listeners={{ onChange: () => setSubmitted(null) }}>
          {(field) => {
            // default to the first option until the user picks one
            const selected = field.state.value || options[0] || "";
            return (
              <div className="search-controls">
                <select
                  id={`${kind}-select`}
                  name={field.name}
                  value={selected}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
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
            );
          }}
        </form.Field>
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
      {result && !error && (
        <div className="search-results">
          <p role="status" className="result-count">
            <strong>{result.count}</strong> cached Pokémon found for <strong>{result.value}</strong>
            .
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
