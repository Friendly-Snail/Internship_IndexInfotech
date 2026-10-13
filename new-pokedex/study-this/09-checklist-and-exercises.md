# 9. The whole migration as a checklist, plus exercises

## 9.1 The steps, in order

You can reuse this order for other framework migrations.

**Prepare**

- [ ] Generate a new project next to the old one (TanStack Start with the oRPC, TanStack Query,
      Better Auth, Drizzle, T3 Env, Tailwind and shadcn add-ons). Don't edit the old app.
- [ ] Read every generated file, so you know what the template gives you.

**Configuration (chapter 2)**

- [ ] Add the `#/` import alias in `package.json` (`imports`) and `tsconfig.json` (`paths`).
- [ ] Switch the database driver from `drizzle-orm/bun-sql` to `drizzle-orm/node-postgres`.
- [ ] Move `.env` to `.env.local`. Remove `PORT` from `src/env.ts` and set it in the `dev` script.
- [ ] Load `.env.local` with `dotenv` in tools that run outside Vite (`drizzle.config.ts`,
      `scripts/check-db.ts`). Rewrite `check-db.ts` for `pg`.
- [ ] Rename the Compose project so the new app gets its own database volume.
- [ ] Update the `package.json` scripts and dependencies.

**Business logic (chapter 3)**

- [ ] Copy `drizzle/`, `src/db/schema/`, `src/services/`, `src/utils/`, `src/validation/`,
      `src/types/`, `src/api/` and `src/env/` unchanged. Check with `diff`.
- [ ] Run `bun run db:up && bun run db:migrate` to prove the schema still applies.

**API (chapters 4 and 5)**

- [ ] Write `src/orpc/base.ts`: the context type, the `errorMapper` middleware (from
      `app.onError`), `publicProcedure`, `protectedProcedure`, `requireAppOrigin`, and the shared
      `pokemonService`.
- [ ] Write the output schemas in `src/orpc/schema.ts`.
- [ ] Convert each Hono route file into procedures in `src/orpc/router/`, keeping every REST
      `method` + `path` the same as before.
- [ ] List all procedures in `src/orpc/router/index.ts`.
- [ ] Create the `RPCHandler` and `OpenAPIHandler` in `src/orpc/handlers.ts`, including the
      generated docs and Better Auth's endpoints in the spec.
- [ ] Mount them with server routes: `api.$.ts`, `api.rpc.$.ts`, and `api/auth/me.ts` so that
      `/api/auth/me` isn't swallowed by Better Auth.
- [ ] Move `src/auth.ts` to `src/lib/auth.ts` and add `tanstackStartCookies()`.
- [ ] Move discovery from `GET /` to `GET /api`.
- [ ] Test every endpoint with the PowerShell examples in the project `README.md`, and compare the
      status codes with the old app.

**Frontend (chapters 6 to 8)**

- [ ] Write `__root.tsx` from `index.html` + `main.tsx`.
- [ ] Turn the overview in `App.tsx` into `src/routes/index.tsx`.
- [ ] Move each page into `src/routes/<page>.tsx` with `createFileRoute`.
- [ ] Change `Layout` to use `<Link>` and `useLocation`, and keep the focus-on-navigate behavior.
- [ ] Replace each `fetch` wrapper with `client.*` / `orpc.*` calls and TanStack Query.
- [ ] Replace hand-written auth calls with `authClient`.
- [ ] Set the `QueryClient` defaults to match the old behavior (`retry: false`,
      `refetchOnWindowFocus: false`).
- [ ] Copy the CSS, import Tailwind without preflight, and update the selectors for `<a>` links.
- [ ] Delete `src/frontend/api/*`, and check that every old hand-written type is now inferred.

**Verify**

- [ ] `bun run typecheck`
- [ ] Click through every page, and sign up, sign in, add, remove and sign out.
- [ ] Open `/api/docs` and try a request from Swagger.
- [ ] Use the browser's back button and refresh on every page.

## 9.2 Things that changed on purpose (and that API users will notice)

| Change | Before | After |
| --- | --- | --- |
| Error body | `{ "error": "..." }` | `{ "defined": false, "code": "...", "status": 409, "message": "..." }` |
| Discovery URL | `GET /` | `GET /api` |
| UI URL | `/ui` (one URL for everything) | `/`, `/pokemon`, `/search`, `/battles`, `/pokedex` |
| Env file | `.env` | `.env.local` |
| Dev command | `bun run dev` → Bun | `bun run dev` → Vite on port 3000 |

## 9.3 Things that were lost (good follow-up tasks)

| Lost | Where it was |
| --- | --- |
| Request timeouts in the browser | `AbortSignal.timeout(...)` in `src/frontend/api/*.ts` |
| `lint` / `format` scripts (oxlint, oxfmt) | old `package.json` |
| `test` script | old `package.json` |
| Dependency injection into route modules | `createXRoutes(database, service)` |
| Startup cheat sheet in the terminal | the `console.log` lines in `src/server.ts` |

## 9.4 Exercises

Do these in order; they get harder. Make a branch for each one.

### Warm-up

1. **Trace a request.** Open DevTools → Network, go to `/pokemon`, and search for `pikachu`. Write
   down the URL that was called, its method, and the file that handled it. Then call the same
   procedure as REST from your browser's address bar. Which URL did you use?

2. **Break the output schema.** In `src/orpc/schema.ts`, change `totalStats: z.number().int()` to
   `totalStats: z.string()`. What does `bun run typecheck` say, and where? Undo it afterwards.
   Why is this better than what would have happened in the old app?

3. **Find the route that wins.** Without running anything, say which file handles each of these:
   `GET /api`, `GET /api/auth/get-session`, `GET /api/auth/me`, `POST /api/rpc/types/list`.
   Then check with the TanStack Router devtools (bottom-right corner in dev).

### Practice

4. **Convert the copied files to `#/` imports.** Update `src/services/pokemon.ts` and the other
   copied files to use `#/` instead of `../`. Run `typecheck`. (Why did we wait until after the
   migration to do this?)

5. **Add a new read-only procedure.** Add `pokemon.count` at `GET /api/pokemon-count`, returning
   `{ count: number }` for the number of cached Pokémon. You'll need to touch `schema.ts`, a
   router file, `router/index.ts`, and nothing else. Then check that it shows up in `/api/docs`.

6. **Use it on the overview page.** Show "N Pokémon cached so far" on `/` using
   `useQuery(orpc.pokemon.count.queryOptions())`. Then make it refresh after a battle. (Hint:
   which query does the Battles page invalidate, and which one should it also invalidate?)

### Challenge

7. **Bring timeouts back.** Make the oRPC client cancel any request that takes longer than 30
   seconds, without editing every page. (Hint: look at where `RPCLink` is created in
   `src/orpc/client.ts`, and at `AbortSignal.any` / `AbortSignal.timeout` in the old code.)

8. **Use a shadcn component.** Replace the Pokémon page's `<input>` and submit `<button>` with
   `#/components/ui/input` and `#/components/ui/button`. Make sure it still looks right, given
   that Tailwind's preflight is *not* loaded. What did you have to adjust?

9. **Load data in the route.** TanStack Router routes can have a `loader`. Give `/battles` a
   loader that calls `context.queryClient.ensureQueryData(orpc.battles.list.queryOptions())`.
   Then view the page source (not DevTools, the actual source) and see whether the battle
   history is in the server-rendered HTML now. Why might that be better?

10. **Discuss with your mentor.** The old route modules received `database` and `service` as
    parameters. The new procedures import `db` and `pokemonService` directly. Write down one
    advantage and one disadvantage of each approach. How would you write a test for
    `pokedex.add` in each version?
