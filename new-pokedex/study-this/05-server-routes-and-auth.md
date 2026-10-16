# 5. Step four: connect the API to TanStack Start, and move authentication

In chapter 4 we built a router and two handlers. Nothing receives HTTP requests yet. In the old app
`src/server.ts` handed every request to Hono. In TanStack Start, **files in `src/routes/` can be
server routes** that answer HTTP requests directly.

## 5.1 Server routes

A file route can export `server.handlers`, one function per HTTP method. Here is the REST entry
point:

```ts
// src/routes/api.$.ts
import { createFileRoute } from "@tanstack/react-router";
import { openAPIHandler, serve } from "#/orpc/handlers";

const handle = serve(openAPIHandler, "/api");

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: { HEAD: handle, GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle },
  },
});
```

And `serve` (in `src/orpc/handlers.ts`) is a small adapter between the two libraries:

```ts
export function serve(handler: RPCHandler<any> | OpenAPIHandler<any>, prefix: `/${string}`) {
  return async ({ request }: { request: Request }) => {
    const { response } = await handler.handle(request, {
      prefix,
      context: { headers: request.headers },   // ← this is where ORPCContext is created
    });
    return response ?? Response.json({ error: "Not Found" }, { status: 404 });
  };
}
```

- `prefix: "/api"` tells oRPC to strip `/api` before matching, so `/api/types/type-search`
  matches the procedure whose path is `/types/type-search`.
- `context: { headers: request.headers }` is how the session cookie reaches
  `protectedProcedure`.
- If no procedure matches, we return a 404 JSON response, like Hono's `app.notFound` did.

## 5.2 File names are URLs

TanStack Router turns file names into URL patterns:

| File | URL pattern | Meaning of the special characters |
| --- | --- | --- |
| `src/routes/index.tsx` | `/` | `index` = the folder's own path |
| `src/routes/pokemon.tsx` | `/pokemon` | |
| `src/routes/api.$.ts` | `/api/*` | `.` = `/`, and `$` = "splat" (matches everything after) |
| `src/routes/api.rpc.$.ts` | `/api/rpc/*` | |
| `src/routes/api/auth/$.ts` | `/api/auth/*` | A folder works the same as dots |
| `src/routes/api/auth/me.ts` | `/api/auth/me` | |

Several patterns can match the same URL. For example, `/api/auth/me` matches `/api/*`,
`/api/auth/*` **and** `/api/auth/me`. The router picks the **most specific** one: a static path
beats a splat, and a longer prefix beats a shorter one. So:

| Request | Handled by | Which goes to |
| --- | --- | --- |
| `GET /api/pokemon/pikachu` | `api.$.ts` | oRPC REST handler |
| `POST /api/rpc/pokemon/get` | `api.rpc.$.ts` | oRPC RPC handler |
| `POST /api/auth/sign-in/email` | `api/auth/$.ts` | Better Auth |
| `GET /api/auth/me` | `api/auth/me.ts` | oRPC REST handler (our `auth.me` procedure) |

The last row needs a moment's thought. `/api/auth/*` belongs to Better Auth, but `/api/auth/me`
is **our** endpoint. Without `me.ts`, Better Auth's splat route would get it and answer 404.
`me.ts` is a tiny static route that sends this one path back to oRPC:

```ts
// src/routes/api/auth/me.ts
// /api/auth/* belongs to Better Auth; this static route sends /api/auth/me to oRPC instead
const handle = serve(openAPIHandler, "/api");

export const Route = createFileRoute("/api/auth/me")({
  server: { handlers: { GET: handle, HEAD: handle } },
});
```

The old app had the **same problem** and solved it with registration order:

```ts
// old: src/routes/auth.ts
routes.get("/me", /* ... */);
// register /me first so Better Auth's wildcard does not consume it
routes.all("/*", (c) => auth.handler(c.req.raw));
```

Hono picks the first matching route **in the order you registered them**. TanStack Router picks
the **most specific** route, **whatever order the files are in**. Same problem, different rule.

## 5.3 `routeTree.gen.ts`

`src/routeTree.gen.ts` is **generated** from the files in `src/routes/` when the dev server runs
(or by `bun run generate-routes`). Never edit it by hand. It's what makes
`<Link to="/pokemon">` type-safe: a typo like `to="/pokemn"` becomes a TypeScript error.

## 5.4 The discovery endpoint moved from `/` to `/api`

In the old app `GET /` returned the JSON list of endpoints, and the UI lived at `/ui`. In the new
app `/` is the **home page**, so discovery moved to `GET /api`:

```ts
// src/orpc/router/discovery.ts
export const discovery = publicProcedure
  .route({ method: "GET", path: "/", tags: ["Overview"], summary: "List the available endpoints" })
```

`path: "/"` plus the `/api` prefix gives `/api`. The "API discovery" link in `Layout.tsx` changed
from `href="/"` to `href="/api"` to match.

## 5.5 Better Auth on the server: `src/lib/auth.ts`

The configuration moved from `src/auth.ts` to `src/lib/auth.ts`, with one addition:

```ts
import { tanstackStartCookies } from "better-auth/tanstack-start";

export const auth = betterAuth({
  basePath: "/api/auth",
  emailAndPassword: { enabled: true },
  // tanstackStartCookies must stay last so it can forward cookies set by other plugins
  plugins: [openAPI({ disableDefaultReference: true }), tanstackStartCookies()],
  // ...everything else unchanged
});
```

`tanstackStartCookies()` matters when Better Auth is called **from server code** (for example
`auth.api.signInEmail(...)` inside a server function) rather than through its HTTP handler. Then
there's no `Response` for Better Auth to attach `Set-Cookie` to, so the plugin hands the cookies to
TanStack Start, which adds them to the outgoing response.

The HTTP side is the generated splat route:

```ts
// src/routes/api/auth/$.ts
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
})
```

This is the same `auth.handler(request)` call as the old `routes.all("/*", (c) => auth.handler(c.req.raw))`.

## 5.6 Better Auth in the browser: `src/lib/auth-client.ts`

```ts
import { createAuthClient } from 'better-auth/react'
export const authClient = createAuthClient()
```

The old frontend had hand-written functions:

```ts
// old: src/frontend/api/trainer.ts
export const signIn = (email: string, password: string, signal: AbortSignal) =>
  request("/api/auth/sign-in/email", signal, "POST", { email, password });
```

The new Pokédex page calls the library's client instead:

```ts
// new: src/routes/pokedex.tsx
unwrap(await authClient.signIn.email({ email: email.trim(), password }));
```

One thing to know about Better Auth's client: it **doesn't throw** when a request fails. It
returns `{ data, error }`. The page's small `unwrap` helper turns an `error` into a thrown
`Error`, so it fits into the same error handling as everything else:

```ts
function unwrap(result: { error: { message?: string; status: number } | null }) {
  if (result.error) {
    throw new Error(result.error.message || "The request could not be completed. Please try again.");
  }
}
```

## 5.7 The isomorphic oRPC client: `src/orpc/client.ts`

This file creates the `client` the pages use. It's **isomorphic**: it does something different
on the server and in the browser.

```ts
const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(router, {
      // server-side calls act for the visitor whose request is being rendered
      context: () => ({ headers: new Headers(getRequestHeaders()) }),
    }),
  )
  .client((): RouterClient<typeof router> => {
    const link = new RPCLink({ url: `${window.location.origin}/api/rpc` });
    return createORPCClient(link);
  });

export const client: RouterClient<typeof router> = getORPCClient();
export const orpc = createTanstackQueryUtils(client);
```

- **In the browser**, calls go over the network to `/api/rpc/...` (handled by `api.rpc.$.ts`).
- **On the server** (during server-side rendering), there's no point making an HTTP request to
  ourselves. `createRouterClient` calls the procedures **directly as functions**, and passes along
  the visitor's request headers so that the session cookie still works.
- `RouterClient<typeof router>` is where the types come from. The client's type is computed from
  the router object in chapter 4, so `client.pokemon.get` knows its input and output types.
- `orpc` wraps the same client with TanStack Query helpers (chapter 7).

## Check yourself

1. Which file handles `POST /api/rpc/battles/fight`? And `POST /api/battles/fight`?
2. Why does `src/routes/api/auth/me.ts` exist?
3. Hono and TanStack Router solve "two routes match" differently. How does each decide?
4. Where does `context.headers` (used by `protectedProcedure`) get its value?
5. During server rendering, does the oRPC client make an HTTP request? Why or why not?

<details>
<summary>Answers</summary>

1. `src/routes/api.rpc.$.ts` (RPC handler) and `src/routes/api.$.ts` (OpenAPI/REST handler).
   Both end up running the same `battles.fight` procedure.
2. Otherwise Better Auth's `/api/auth/$` splat route would receive `/api/auth/me`, and Better Auth
   doesn't know that path. A static route is more specific than a splat, so `me.ts` wins.
3. Hono uses the first route registered that matches. TanStack Router uses the most specific
   matching route, whatever order the files are in.
4. From `serve()` in `src/orpc/handlers.ts` (`context: { headers: request.headers }`), or on the
   server from `getRequestHeaders()` in `src/orpc/client.ts`.
5. No. `createRouterClient` calls the procedures directly in the same process, which is faster and
   avoids a network round-trip to itself.

</details>
