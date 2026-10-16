# 7. Step six: data fetching with the typed client and TanStack Query

This chapter is where the frontend got much shorter. Take your time with it.

## 7.1 The old way: everything by hand

Every page in the old app managed its requests itself. Here's the core of the old Pokémon page:

```tsx
// old: src/frontend/pages/PokemonPage.tsx
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
  // ...validate...
  const controller = new AbortController();
  request.current = controller;
  setLoading(true);
  try {
    const result = await getPokemon(parsed.data, controller.signal);
    if (!controller.signal.aborted) setPokemon(result);
  } catch (failure) {
    if (!controller.signal.aborted) setError(/* ... */);
  } finally {
    if (!controller.signal.aborted) setLoading(false);
  }
}
```

…plus a `getPokemon` function in `src/frontend/api/pokemon.ts` that called `fetch`, added a
timeout, checked `response.ok`, read the `error` field and returned `response.json()` with a
hand-written type.

That code is careful and correct. But **every page repeated the same pattern**: three or four
`useState`s, an `AbortController` in a `useRef`, and `if (!controller.signal.aborted)` checks
everywhere.

## 7.2 The new way: describe the data, let the library manage it

```tsx
// new: src/routes/pokemon.tsx
const [identifier, setIdentifier] = useState("");
// the normalized identifier of the last valid search; null before the first search
const [submitted, setSubmitted] = useState<string | null>(null);
const [inputError, setInputError] = useState("");

const lookup = useQuery({
  ...orpc.pokemon.get.queryOptions({ input: { identifier: submitted ?? "" } }),
  enabled: submitted !== null,
});

function search(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setInputError("");
  const parsed = pokemonIdentifier.safeParse(identifier);
  if (!parsed.success) {
    setSubmitted(null);
    setInputError("Enter a Pokémon name such as pikachu or mr-mime, or a positive ID such as 25.");
    return;
  }
  // searching the same Pokémon again asks the API again, like a new search
  if (parsed.data === submitted) void lookup.refetch();
  else setSubmitted(parsed.data);
}

const loading = lookup.isFetching;
const pokemon = loading ? undefined : lookup.data;
```

Let's take it apart.

### `orpc.pokemon.get.queryOptions({ input })`

This helper (from `@orpc/tanstack-query`) builds the options object that `useQuery` needs:

- a **`queryKey`** based on the procedure and its input, so `pikachu` and `bulbasaur` are
  cached separately;
- a **`queryFn`** that calls `client.pokemon.get(input)` and passes TanStack Query's abort
  `signal` along for you.

And the result is **typed from the server's `.output(PokemonDetailSchema)`**. Write
`lookup.data.` in your editor and look at the autocomplete. Those fields come straight from
`src/orpc/schema.ts`.

### `enabled: submitted !== null`

A query normally runs as soon as the component renders. We don't want to look anything up until
the user presses Search, so `enabled` is `false` until `submitted` has a value.

### What the page doesn't do any more

- **Store the result in state.** TanStack Query stores it (`lookup.data`).
- **Track loading.** `lookup.isFetching` is true while a request is running.
- **Track errors.** `lookup.isError` / `lookup.error`.
- **Abort old requests.** When `submitted` changes, the query key changes. TanStack Query ignores
  the result of the old key, and cancels it if nothing uses it any more. Leaving the page works the
  same way.

> **The mental shift:** in the old code you wrote *instructions* ("set loading, start a fetch,
> when it finishes set the data…"). In the new code you write a *description* ("this component
> needs `pokemon.get` for whatever `submitted` is"). TanStack Query does the instructions for you.

The only state the page still owns is **what the user typed** and **what they asked for**, which
TanStack Query can't know.

## 7.3 Two ways to call the client

The pages use the client in two styles. Both are type-safe.

**With the Query helpers**, when the call fits a standard query:

```ts
useQuery(orpc.battles.list.queryOptions())
```

**Calling the client directly** inside a custom `queryFn`, when you need to reshape the result:

```ts
// src/routes/search.tsx: one panel handles both "type" and "region"
const optionsQuery = useQuery({
  queryKey: ["search-options", kind],
  queryFn: async ({ signal }) =>
    kind === "type"
      ? (await client.types.list(undefined, { signal })).types
      : (await client.regions.list(undefined, { signal })).regions,
});
```

Here the panel calls a *different procedure* depending on `kind` and only keeps one field, so a
hand-written `queryKey` and `queryFn` are clearer. Notice how `{ signal }` is passed as the second
argument, so cancellation still works.

## 7.4 Changing data: `useMutation` and invalidation (Battles page)

Reading data uses **queries**. Changing data (starting a fight) uses **mutations**:

```tsx
// new: src/routes/battles.tsx
const queryClient = useQueryClient();
const historyQuery = useQuery(orpc.battles.list.queryOptions());
const fightMutation = useMutation(
  orpc.battles.fight.mutationOptions({
    // a saved battle changes the history, so read it again
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.battles.list.key() }),
  }),
);

// later, in the submit handler:
fightMutation.mutate(teams);
```

- `fightMutation.isPending`, `.data` and `.error` replace the old `fighting`, `result` and
  `error` state.
- **Invalidation** is the important idea. A new battle makes the cached history out of date.
  `invalidateQueries` marks the history as stale, and because it's on screen it re-fetches
  automatically. The old page had to call `getBattleHistory` again by hand.
- `orpc.battles.list.key()` builds the right query key for you, so you never type it by hand and
  can't get it wrong.

The old hand-written types (`FightResult`, `BattleHistory`, ...) were deleted. The page keeps
just a small local `BattleTeam` type for its `TeamSummary` component's props.

## 7.5 The hardest page: the Pokédex

The Pokédex page has the most going on: a session that may or may not exist, a collection that
only exists when you're signed in, and actions (sign in, add, remove, sign out) that must refresh
both.

### "Not signed in" is a normal state, not an error

```ts
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
```

`auth.me` answers 401 for anonymous visitors. For this page that just means "show the sign-in
form", so the query function turns that one error into `null`. Any other error is still thrown.

### Dependent queries

```ts
const trainerQuery = useQuery(trainerOptions);
const trainer = trainerQuery.data ?? null;
const pokedexQuery = useQuery({ ...pokedexOptions, enabled: trainer !== null });
```

The collection query only runs once we know there's a trainer. This is the same `enabled` trick
as on the Pokémon page.

### Writing to the cache directly

```ts
function forgetTrainer() {
  queryClient.setQueryData(trainerOptions.queryKey, null);       // "nobody is signed in"
  queryClient.removeQueries({ queryKey: orpc.pokedex.key() });   // drop the old collection
}
```

After sign-out, or when a request returns 401, we already **know** the answer, so we write it into
the cache instead of asking the server. Removing the Pokédex query makes sure one trainer's
collection is never shown to the next person who signs in.

### Re-reading on demand

```ts
// read the trainer first; the collection stays hidden while it is fetched again
async function syncSession() {
  const current = await queryClient.fetchQuery({ ...trainerOptions, staleTime: 0 });
  if (current) await queryClient.fetchQuery({ ...pokedexOptions, staleTime: 0 });
}
```

`fetchQuery` with `staleTime: 0` means "fetch now, even if you have a cached value". It's
`await`able, so sign-in can wait until the new trainer *and* their collection are loaded before
showing "You're signed in".

### One mutation for every action

```ts
const operation = useMutation({
  mutationFn: async (action: () => Promise<string>) => action(),
  onMutate: () => { setError(""); setMessage(""); },
  onSuccess: (success) => setMessage(success),
  onError: (failure) => { /* 401 → forgetTrainer(); show a message */ },
  onSettled: () => setPassword(""),
});
```

This is an unusual but useful pattern. The mutation's "variable" is **a function**. Sign-in, add,
remove and sign-out each pass their own `async () => { ...; return "success message"; }`. They all
share one `isPending` flag (`busy`), which disables every button, so only one change can run at a
time. That's the same rule the old page enforced with its `operation` ref.

`onSettled` clears the password field whether the action worked or not, so a password never
stays in memory longer than needed.

## 7.6 Global query defaults

```ts
// src/integrations/tanstack-query/root-provider.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    // pages show API errors immediately and refresh only when the user asks
    queries: { retry: false, refetchOnWindowFocus: false },
  },
})
```

TanStack Query's defaults are to **retry failed queries 3 times** and to **refetch when you
switch back to the browser tab**. Those are good defaults for many apps, but the old app showed
errors immediately and only refreshed when the user clicked "Refresh". We turned both off so the
new app behaves the same.

## 7.7 Error messages: `src/lib/api-errors.ts`

```ts
export function errorMessage(error: unknown, fallback: string): string {
  // the server translates every failure into an ORPCError with a readable message
  return error instanceof ORPCError ? error.message : fallback;
}

export function hasStatus(error: unknown, status: number): boolean {
  return error instanceof ORPCError && error.status === status;
}
```

These two helpers replaced the `typeof data?.error === "string" ? data.error : fallback` checks
that were repeated in every old `api/*.ts` file. If the server answered, show its message. If the
request never reached the server, show the page's fallback.

## 7.8 Something that was lost: request timeouts

The old fetch wrappers added timeouts: `AbortSignal.timeout(30000)` for reads and up to 90 seconds
for fights. The new pages pass TanStack Query's `signal`, which cancels on unmount or key change,
but **there's no timeout any more**. A request that hangs will show "Searching…" until it finishes
or the user leaves. Adding one back is one of the exercises in chapter 9.

> **Lesson:** a migration that "looks the same" can still lose small behaviors. Make a list
> of what the old code did, and tick each item off in the new code.

## Check yourself

1. In the new Pokémon page, which line stops the query from running before the user searches?
2. Where does the TypeScript type of `lookup.data` come from?
3. After a fight, how does the history list update?
4. Why does `trainerOptions` turn a 401 into `null` instead of letting it be an error?
5. Why are `retry` and `refetchOnWindowFocus` turned off?
6. What does `operation.isPending` protect against on the Pokédex page?

<details>
<summary>Answers</summary>

1. `enabled: submitted !== null`.
2. From `.output(PokemonDetailSchema)` on the `pokemon.get` procedure, carried through
   `RouterClient<typeof router>` and `orpc.pokemon.get.queryOptions`.
3. The mutation's `onSuccess` calls `invalidateQueries` for `orpc.battles.list.key()`. The history
   query is on screen, so it re-fetches automatically.
4. Being signed out is a normal state on that page (it shows the sign-in form). Only real failures
   should show an error message.
5. To match the old app: show errors right away, and only refresh when the user asks.
6. Running two account or collection changes at once, e.g. clicking "Remove" twice, or signing out
   while an add is still saving.

</details>
