# 2. Step one: scaffolding the new project and its configuration

We did **not** convert the old project in place. We generated a fresh TanStack Start project next
to it and then moved code in piece by piece. This is usually the safer way to change frameworks:
the old app keeps working the whole time, and you can compare the two at any point.

## 2.1 Generating the project

The project was created with TanStack's project generator. It records the choices it was given in
`.cta.json`:

```json
{
  "projectName": "new-pokedex",
  "mode": "file-router",
  "packageManager": "bun",
  "tailwind": true,
  "chosenAddOns": [
    "drizzle", "form", "oRPC", "shadcn", "t3env",
    "table", "better-auth", "tanstack-query"
  ]
}
```

Each add-on brought starter files with it. For example:

| Add-on | Files it created (which we then edited) |
| --- | --- |
| `oRPC` | `src/orpc/client.ts`, `src/polyfill.ts`, the `/api` and `/api/rpc` server routes |
| `tanstack-query` | `src/integrations/tanstack-query/root-provider.tsx` and `devtools.tsx` |
| `better-auth` | `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/routes/api/auth/$.ts` |
| `shadcn` | `components.json`, `src/lib/utils.ts` (the `cn` helper) |
| `drizzle` | `drizzle.config.ts`, `src/db/index.ts` |

> **Lesson:** a generator gives you working "glue" code. Your job is to replace the generator's
> demo code with your real code, and to read what it generated so you understand it.
> Files like `src/polyfill.ts` come straight from the oRPC template. Its own comment says you can
> delete it when you're on Node 20+ and not using `oz.file()`.

## 2.2 `package.json`: scripts

| Old script | New script | Why |
| --- | --- | --- |
| `dev: bun --hot src/server.ts` | `dev: vite dev --port 3000` | Vite + the TanStack Start plugin now run the app |
| `start: bun src/server.ts` | `build: vite build` and `preview: vite preview` | Start compiles the app into a production server bundle |
| — | `generate-routes: tsr generate` | Regenerates `src/routeTree.gen.ts` (the dev server also does this automatically) |
| `db:check: bun scripts/check-db.ts` | `db:check: tsx scripts/check-db.ts` | The script now uses the `pg` driver and `dotenv`, so it runs under Node with `tsx` |
| `auth:generate ... ./src/auth.ts` | `auth:generate ... ./src/lib/auth.ts` | The auth config moved into `src/lib/` |
| — | `db:push`, `db:pull`, `db:studio` | Extra Drizzle commands from the template |
| `test`, `lint`, `format`, `format:check` | (removed) | Not carried over (see the exercises in chapter 9) |

## 2.3 `package.json`: dependencies

**Removed**, because the new stack replaces them:

- `hono`, `@hono/zod-validator`, `@hono/swagger-ui`: replaced by oRPC
- `@types/bun`: the app no longer runs on the Bun runtime
- `postgres`: replaced by `pg` (see 2.6)
- `openapi3-ts`, `@apidevtools/swagger-parser`, `ajv`, `ajv-formats`: only needed for the
  hand-written OpenAPI document and its checks
- `oxlint`, `oxfmt`, `@electric-sql/pglite`: tooling that wasn't carried over

**Added:**

- `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query` (+ devtools)
- `@orpc/server`, `@orpc/client`, `@orpc/openapi`, `@orpc/zod`, `@orpc/json-schema`,
  `@orpc/tanstack-query`
- `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`
- `pg`, `dotenv`, `tsx`
- shadcn/ui helpers: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`

**Kept:** `better-auth`, `@better-auth/drizzle-adapter`, `drizzle-orm`, `drizzle-kit`, `zod`,
`ky`, `date-fns`, `@t3-oss/env-core`, `react`, `react-dom`.

> Package manager note: we still use **bun** to *install packages and run scripts*
> (`bun install`, `bun run dev`). The *runtime* that executes the server is now Node, through Vite.
> "Using Bun as a package manager" and "running on Bun" are different things.

## 2.4 `vite.config.ts` (new file)

```ts
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
})
```

- `tanstackStart()` does most of the work: it finds the routes in `src/routes/`, generates
  `src/routeTree.gen.ts`, renders pages on the server, and bundles separate code for the server and
  the browser.
- `tailwindcss()` compiles Tailwind classes.
- `devtools()` adds the floating TanStack devtools panel in development.
- `resolve.tsconfigPaths: true` lets Vite understand the `#/` import alias.

## 2.5 Import aliases: `../../db` becomes `#/db`

Old imports were relative paths:

```ts
// old: src/routes/pokedex.ts
import { pokedex, pokemon } from "../db/schema/pokemon";
import { pokemonIdentifier } from "../validation/fight";
```

New imports use an alias that always starts from `src/`:

```ts
// new: src/orpc/router/pokedex.ts
import { pokedex, pokemon } from "#/db/schema/pokemon";
import { pokemonIdentifier } from "#/validation/fight";
```

The alias is declared in two places, which must agree:

```jsonc
// package.json: used by Node at runtime
"imports": { "#/*": "./src/*" }

// tsconfig.json: used by TypeScript (and by Vite through tsconfigPaths)
"paths": { "#/*": ["./src/*"], "@/*": ["./src/*"] }
```

Why `#/` and not `@/`? Names starting with `#` are Node's official "subpath imports" feature, so
they work outside the bundler too (for example in `scripts/check-db.ts` under `tsx`).

`tsconfig.json` also changed in other ways: `"types": ["bun", "node"]` became
`"types": ["vite/client"]`, and the template added stricter checks such as `noUnusedLocals`.

## 2.6 The database driver: `bun-sql` becomes `node-postgres`

```ts
// old: src/db/index.ts
import { drizzle } from "drizzle-orm/bun-sql";
export const db = drizzle({ connection: { url: databaseEnv.DATABASE_URL }, schema });
```

```ts
// new: src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
export const db = drizzle({ connection: { connectionString: databaseEnv.DATABASE_URL }, schema });
```

**Why this change was required:** `bun-sql` uses Bun's built-in `Bun.sql` API, which only
exists inside the Bun runtime. The Vite dev server and the production build run on Node, so we
switched to the `pg` package, which works everywhere. Drizzle's query API is the same for both
drivers, so **no queries had to change**. Only this one file did. Note the option name changed
from `url` to `connectionString`.

The same reasoning applies to `scripts/check-db.ts`: it used `import { SQL } from "bun"` before
and now uses `new pg.Client(...)`.

## 2.7 Environment variables

| | Old | New |
| --- | --- | --- |
| File | `.env` | `.env.local` (git-ignored by the `*.local` rule) |
| Who loads it | Bun, automatically, for every command | TanStack Start/Vite for the app; `dotenv` for standalone tools |
| `PORT` | Validated in `src/env.ts` | Removed; the port is a CLI flag: `vite dev --port 3000` |

`src/env.ts` is otherwise the same T3 Env setup, validating `BETTER_AUTH_URL` and
`BETTER_AUTH_SECRET` and extending `src/env/database.ts` for `DATABASE_URL`.

Tools that run **outside** Vite no longer get `.env` loaded for them, so they load it themselves:

```ts
// new: drizzle.config.ts
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

export default defineConfig({
  // ...
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

```ts
// new: scripts/check-db.ts
config({ path: [".env.local", ".env"], quiet: true });
// import after loading .env so the validated URL is available
const { databaseEnv } = await import("../src/env/database");
```

Look at that second example closely. `databaseEnv` validates `process.env` **as soon as its
module is imported**. A normal `import` at the top of the file would run *before* `config(...)`,
so the variable would still be empty. A dynamic `await import(...)` after `config()` fixes the
order.

## 2.8 Docker Compose

`compose.yaml` is the same Postgres service, with one change:

```yaml
# a separate project name keeps this stack and its volume apart from the original pokedex stack
name: new-pokedex
```

Compose names volumes after the project. Renaming the project gives the new app its own empty
database volume, so experimenting with it can't damage the old app's data. Both stacks still
publish port `5433`, so stop one (`bun run db:down`) before starting the other.

## Check yourself

1. Why couldn't we keep `drizzle-orm/bun-sql`?
2. Why does `drizzle.config.ts` call `dotenv`'s `config()` when the old one didn't?
3. In `check-db.ts`, what would go wrong if `databaseEnv` were imported with a normal top-level
   `import` statement?
4. Where is the `#/` alias defined, and why in two places?

<details>
<summary>Answers</summary>

1. It relies on Bun-only APIs, and the new app's server runs on Node (through Vite).
2. Bun used to load `.env` automatically for every command. `drizzle-kit` runs on its own under
   Node, which doesn't do that, so the config file has to load the variables itself.
3. Static imports run before the rest of the file's code. The env module would validate
   `process.env` before `dotenv` had filled it, and throw "Invalid DATABASE_URL".
4. In `package.json` → `imports` (for Node at runtime) and `tsconfig.json` → `paths` (for
   TypeScript, and Vite through `tsconfigPaths`). Each tool reads its own config.

</details>
