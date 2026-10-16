import { useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { errorMessage, hasStatus } from "#/lib/api-errors";
import { authClient } from "#/lib/auth-client";
import { client, orpc } from "#/orpc/client";
import type { z } from "zod";
import { visibleFormError } from "#/lib/form-errors";
import { accountForm, pokedexAddForm } from "#/validation/forms";

export const Route = createFileRoute("/pokedex")({ component: PokedexPage });

// an anonymous visitor is a normal state here, so the 401 from auth.me becomes null
const trainerOptions = queryOptions({
  queryKey: ["trainer"],
  queryFn: async ({ signal }) => {
    try {
      return (await client.auth.me(undefined, { signal })).user;
    } catch (failure) {
      if (hasStatus(failure, 401)) return null;
      throw failure;
    }
  },
});

/**
 * Better Auth's client reports failures as values; turn them into thrown errors.
 *
 * @param result - The client response.
 * @throws The API's message when the request failed.
 */
function unwrap(result: { error: { message?: string; status: number } | null }) {
  if (result.error) {
    throw new Error(
      result.error.message || "The request could not be completed. Please try again.",
    );
  }
}

type AccountValues = z.input<typeof accountForm>;

function PokedexPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const trainerQuery = useQuery(trainerOptions);
  const trainer = trainerQuery.data ?? null;
  const pokedexOptions = queryOptions({
    ...orpc.pokedex.list.queryOptions(),
    queryFn: async ({ signal }) => {
      try {
        return await client.pokedex.list(undefined, { signal });
      } catch (failure) {
        // the session ended elsewhere; show the sign-in form again
        if (hasStatus(failure, 401)) queryClient.setQueryData(trainerOptions.queryKey, null);
        throw failure;
      }
    },
  });
  const pokedexQuery = useQuery({ ...pokedexOptions, enabled: trainer !== null });

  // one account or collection change runs at a time, then the session and collection are read again
  const operation = useMutation({
    mutationFn: async (action: () => Promise<string>) => action(),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: (success) => setMessage(success),
    onError: (failure) => {
      if (hasStatus(failure, 401)) forgetTrainer();
      // a TypeError means fetch never received a response, so the change may have completed
      setError(
        failure instanceof Error && !(failure instanceof TypeError)
          ? failure.message
          : "The response was interrupted. Refresh your session or Pokedex before trying again; the change may have completed.",
      );
    },
  });
  const busy = operation.isPending;

  // both forms validate on mount and on change so canSubmit always reflects the inputs
  const authForm = useForm({
    defaultValues: { mode: "login", name: "", email: "", password: "" } as AccountValues,
    validators: { onMount: accountForm, onChange: accountForm },
    onSubmit: ({ value }) =>
      run(async () => {
        const { mode, name, email, password } = accountForm.parse(value);
        try {
          if (mode === "signup") unwrap(await authClient.signUp.email({ name, email, password }));
          else unwrap(await authClient.signIn.email({ email, password }));
        } finally {
          authForm.setFieldValue("password", "");
        }
        // start fresh for the next sign-in after a logout, keeping the email and mode
        authForm.reset({ ...value, password: "" }, { keepDefaultValues: true });
        void authForm.validate("mount");
        await syncSession();
        return "You’re signed in. Welcome to your Pokedex.";
      }),
  });
  const mode = useSelector(authForm.store, (state) => state.values.mode);
  const canAuthenticate = useSelector(authForm.store, (state) => state.canSubmit);
  const authError = useSelector(authForm.store, visibleFormError);

  const addForm = useForm({
    defaultValues: { pokemon: "" },
    validators: { onMount: pokedexAddForm, onChange: pokedexAddForm },
    onSubmit: ({ value }) =>
      run(async () => {
        await client.pokedex.add(pokedexAddForm.parse(value));
        addForm.reset();
        void addForm.validate("mount");
        await syncSession();
        return "Pokémon added to your Pokedex.";
      }),
  });
  const canAdd = useSelector(addForm.store, (state) => state.canSubmit);
  const addError = useSelector(addForm.store, visibleFormError);

  const loading = !busy && (trainerQuery.isFetching || pokedexQuery.isFetching);
  const collection = pokedexQuery.isFetching ? undefined : pokedexQuery.data;
  const readFailure = trainerQuery.error ?? pokedexQuery.error;
  const shownError =
    error || authError || addError || (!busy && !loading && readFailure
      ? errorMessage(readFailure, "Could not reach the API. Please try again.")
      : "");

  function forgetTrainer() {
    queryClient.setQueryData(trainerOptions.queryKey, null);
    queryClient.removeQueries({ queryKey: orpc.pokedex.key() });
  }

  // read the trainer first; the collection stays hidden while it is fetched again
  async function syncSession() {
    const current = await queryClient.fetchQuery({ ...trainerOptions, staleTime: 0 });
    if (current) await queryClient.fetchQuery({ ...pokedexOptions, staleTime: 0 });
  }

  function run(action: () => Promise<string>) {
    if (!busy) operation.mutate(action);
  }

  function switchMode(next: AccountValues["mode"]) {
    authForm.setFieldValue("mode", next);
    // clearing the password also checks the form again under the new mode
    authForm.setFieldValue("password", "");
    setError("");
  }

  function refresh() {
    if (busy) return;
    setError("");
    void syncSession().catch(() => {
      // the failed query shows its own error
    });
  }

  return (
    <section className="feature-page" aria-labelledby="page-title">
      <p className="eyebrow">YOUR POKEDEX</p>
      <h1 id="page-title">Make it your own</h1>
      <p className="page-description">Sign in to keep your personal Pokémon collection.</p>
      {shownError && (
        <div className="search-error" role="alert">
          {shownError}
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
              <button className="button-secondary" disabled={busy} onClick={refresh}>
                Refresh collection
              </button>
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    unwrap(await authClient.signOut());
                    forgetTrainer();
                    return "You’re signed out.";
                  })
                }
              >
                Log out
              </button>
            </div>
          </div>
          <form
            className="pokemon-search"
            onSubmit={(event) => {
              event.preventDefault();
              void addForm.handleSubmit();
            }}
            noValidate
          >
            <label htmlFor="owned-pokemon">Add a Pokémon by name or ID</label>
            <div className="search-controls">
              <addForm.Field name="pokemon">
                {(field) => (
                  <input
                    id="owned-pokemon"
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="e.g. pikachu or 25"
                    disabled={busy}
                    maxLength={255}
                  />
                )}
              </addForm.Field>
              <button className="button-primary" disabled={busy || !canAdd} type="submit">
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
                          <td>{format(entry.addedAt, "yyyy-MM-dd")}</td>
                          <td>
                            <button
                              className="button-secondary"
                              disabled={busy}
                              aria-label={`Remove ${entry.pokemon.name} from your Pokedex`}
                              onClick={() =>
                                run(async () => {
                                  await client.pokedex.remove({
                                    pokemonId: String(entry.pokemon.id),
                                  });
                                  await syncSession();
                                  return `${entry.pokemon.name} removed from your Pokedex.`;
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
              onClick={() => switchMode("login")}
            >
              Log in
            </button>
            <button
              className="button-secondary"
              aria-pressed={mode === "signup"}
              disabled={busy}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
          </div>
          <h2>{mode === "login" ? "Welcome back" : "Meet your new Pokedex"}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void authForm.handleSubmit();
            }}
            className="auth-form"
            noValidate
          >
            {mode === "signup" && (
              <authForm.Field name="name">
                {(field) => (
                  <label>
                    Trainer name
                    <input
                      name={field.name}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      required
                      autoComplete="name"
                      disabled={busy}
                    />
                  </label>
                )}
              </authForm.Field>
            )}
            <authForm.Field name="email">
              {(field) => (
                <label>
                  Email
                  <input
                    type="email"
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    required
                    autoComplete="email"
                    disabled={busy}
                  />
                </label>
              )}
            </authForm.Field>
            <authForm.Field name="password">
              {(field) => (
                <label>
                  Password
                  <input
                    type="password"
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    maxLength={128}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    disabled={busy}
                  />
                </label>
              )}
            </authForm.Field>
            {mode === "signup" && (
              <p className="search-hint">Use a password with at least 8 characters.</p>
            )}
            <button
              className="button-primary"
              disabled={busy || !canAuthenticate}
              type="submit"
            >
              {mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
          <button className="session-refresh" disabled={busy} onClick={refresh}>
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
