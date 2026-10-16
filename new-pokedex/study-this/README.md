# Study guide: migrating the Pokédex from Bun + Hono to TanStack Start

This folder explains how `../pokedex` (the **old** app) became this project (the **new** app).
The app does the same things before and after: look up Pokémon, search by type and region,
run team battles, and keep a personal Pokédex behind a login. What changed is the frameworks
underneath and the way the pieces talk to each other.

Read the files in order. Each one covers a single part of the migration, shows the old code next
to the new code, and ends with questions to check your understanding.

| # | File | What you'll learn |
| --- | --- | --- |
| 1 | [01-big-picture.md](01-big-picture.md) | Old vs new architecture, and why we migrated |
| 2 | [02-scaffolding-and-config.md](02-scaffolding-and-config.md) | Creating the new project, Vite, `package.json`, `tsconfig`, env files, database driver |
| 3 | [03-code-that-moved-unchanged.md](03-code-that-moved-unchanged.md) | Which files were copied as-is, and why that was possible |
| 4 | [04-hono-routes-to-orpc-procedures.md](04-hono-routes-to-orpc-procedures.md) | Rewriting the API: Hono routes become oRPC procedures |
| 5 | [05-server-routes-and-auth.md](05-server-routes-and-auth.md) | How requests reach oRPC and Better Auth inside TanStack Start |
| 6 | [06-frontend-routing.md](06-frontend-routing.md) | `useState` page switching becomes real URLs with TanStack Router |
| 7 | [07-data-fetching-with-tanstack-query.md](07-data-fetching-with-tanstack-query.md) | `fetch` + `useEffect` becomes `useQuery` / `useMutation` with a typed client |
| 8 | [08-styling.md](08-styling.md) | Keeping the old CSS while adding Tailwind and shadcn/ui |
| 9 | [09-checklist-and-exercises.md](09-checklist-and-exercises.md) | The whole migration as a checklist, plus practice exercises |

## How to study this

1. Open both projects side by side in your editor: `../pokedex` and `.` (this folder's parent).
2. For every file in this guide, open the "old" and "new" files it mentions and compare them
   yourself. The guide shows only the important lines.
3. Try answering the questions at the end of each chapter before you look at the answers
   (they're hidden in `<details>` blocks).
4. Run the new app (see the project `README.md`) and try the things the chapter talks about:
   open `/api/docs`, look at the Network tab, sign in and out.

## Glossary

You'll see these words a lot. Come back here if one is unfamiliar.

| Term | Meaning |
| --- | --- |
| **Bun** | A JavaScript runtime (like Node.js) with a built-in bundler, test runner and HTTP server. The old app ran on it directly. |
| **Hono** | A small web framework for writing HTTP routes: `app.get("/path", handler)`. The old API used it. |
| **TanStack Start** | A full-stack React framework. It renders pages on the server (SSR), runs server-only API routes, and bundles everything with Vite. |
| **TanStack Router** | The routing library inside Start. Each file in `src/routes/` becomes a URL. |
| **TanStack Query** | A library for loading server data in React. It handles loading/error state, caching, retries and refetching. |
| **Vite** | The dev server and build tool. It replaces Bun's built-in bundler in the new app. |
| **oRPC** | A library for writing type-safe API functions called *procedures*. One procedure can be called as a typed function from the frontend *and* as a normal REST endpoint. |
| **Procedure** | One oRPC API function, with an input schema, output schema and handler. Equivalent to one Hono route. |
| **Middleware** | Code that runs before a handler, e.g. "check that the user is signed in". |
| **Zod** | A library for describing data shapes and validating them at runtime. Used in both apps. |
| **Drizzle** | The ORM (database toolkit) used in both apps. |
| **Better Auth** | The authentication library (sign-up, sign-in, sessions) used in both apps. |
| **SSR** | Server-side rendering: the server builds the page's HTML before sending it to the browser. |
| **Isomorphic** | Code that runs on both the server and the browser, often doing something different in each. |
| **OpenAPI / Swagger** | A standard JSON description of a REST API (OpenAPI) and a web page that displays it (Swagger UI). |
