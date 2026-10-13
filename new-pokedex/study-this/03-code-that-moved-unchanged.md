# 3. Step two: copy over the code that doesn't care about frameworks

Before rewriting anything, we copied every file that doesn't depend on Hono, Bun or the old
frontend. These files are **byte-for-byte identical** in both projects. You can check this
yourself:

```bash
diff ../pokedex/src/services/pokemon.ts src/services/pokemon.ts   # no output = identical
```

| Folder / file | What it does |
| --- | --- |
| `drizzle/` | All 13 SQL migrations and their snapshots |
| `src/db/schema/*.ts` | Drizzle table definitions and relations (Pokémon, battles, Pokédex, auth tables) |
| `src/services/pokemon.ts` | The Pokémon cache: look in Postgres first, call PokeAPI if needed, then save |
| `src/api/pokeapi.ts` | The `ky` HTTP client configured for PokeAPI |
| `src/utils/type-matchups.ts`, `team-matchups.ts`, `team-results.ts` | Battle scoring rules |
| `src/utils/timestamps.ts` | Unix-seconds helpers built on `date-fns` |
| `src/validation/fight.ts` | Zod schemas: `pokemonIdentifier` and `fightBodySchema` |
| `src/types/pokemon.ts` | TypeScript types for PokeAPI data and cached Pokémon |
| `src/env/database.ts` | T3 Env validation for `DATABASE_URL` |

## Why could these move without changes?

Look at what `src/services/pokemon.ts` imports:

```ts
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { pokeApi } from "../api/pokeapi";
import { encounterArea, pokemon, /* ... */ } from "../db/schema/pokemon";
```

There's no `hono` and no `Request`/`Response`, and nothing about React. It takes plain values
(a Pokémon name) and returns plain values (a cached Pokémon). It doesn't know or care whether
it's called from a Hono route, an oRPC procedure, or a test.

That's the payoff of a **layered design**:

```
  HTTP layer          (Hono routes → oRPC procedures)   ← rewritten
       │
  Service layer       services/pokemon.ts, utils/*       ← copied unchanged
       │
  Data layer          db/schema/*, drizzle/*             ← copied unchanged
```

The old project already kept HTTP handling separate from business logic. Because of that,
switching the HTTP layer only meant rewriting the HTTP layer.

> **Lesson:** when you write a route handler, keep it thin. Parse the input, call a service
> function, shape the output. Put the real logic in functions that take and return plain data.
> Then a framework migration like this one only touches the thin part.

## Two small details worth noticing

1. **The copied files still use relative imports** (`"../db"`), while new files use `#/db`.
   Both work. We left the copied files untouched on purpose so that `diff` proves they're
   identical. Converting them to `#/` is a safe follow-up task.
2. **`src/validation/fight.ts` is now shared by the server and the browser.** The old frontend
   already imported it (`../../validation/fight`). The new pages still do, through
   `#/validation/fight`, to check user input before sending it. The same Zod schema is also the
   procedure's `.input(...)`, so browser and server validate with identical rules.

## What was deleted

These old files have **no counterpart** in the new project, because a library now does their
job:

| Deleted | Replaced by |
| --- | --- |
| `src/server.ts`, `src/http-server.ts` | TanStack Start's own server (`vite dev` / `vite build`) |
| `src/app.ts` | `src/orpc/router/index.ts` (route list) + `src/orpc/base.ts` (error handling) |
| `src/routes/*.ts` (Hono) | `src/orpc/router/*.ts` (chapter 4) |
| `src/docs/openapi.ts` (856 lines) | `OpenAPIReferencePlugin` in `src/orpc/handlers.ts` (chapter 4) |
| `src/frontend/index.html`, `main.tsx` | `src/routes/__root.tsx` + `src/router.tsx` (chapter 6) |
| `src/frontend/App.tsx` | `src/routes/index.tsx` + file-based routing (chapter 6) |
| `src/frontend/api/*.ts` | The typed oRPC client + TanStack Query (chapter 7) |

And these were **moved and adapted**:

| Old | New |
| --- | --- |
| `src/auth.ts` | `src/lib/auth.ts` |
| `src/frontend/components/Layout.tsx` | `src/components/Layout.tsx` |
| `src/frontend/pages/*Page.tsx` | `src/routes/*.tsx` |
| `src/frontend/styles.css` | `src/styles.css` |
| `src/db/index.ts` | same path, new driver (chapter 2) |

## Check yourself

1. What made it possible to copy `services/pokemon.ts` without edits?
2. Why didn't we convert the copied files to `#/` imports straight away?
3. Which old file was the biggest one to be deleted, and what replaced it?

<details>
<summary>Answers</summary>

1. It has no dependency on the HTTP framework or the runtime. It only uses Drizzle, `ky` and
   plain TypeScript values.
2. Keeping them identical makes it easy to show with `diff` that the business logic didn't
   change during the migration. It also keeps the migration commit focused. Cleanup can come later.
3. `src/docs/openapi.ts` (856 lines of hand-written OpenAPI). oRPC now generates the document
   from the procedures' Zod schemas.

</details>
