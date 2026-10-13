# 4. Step three: rewrite the API as oRPC procedures

This is the biggest backend change. Every Hono route became an oRPC **procedure**. Let's start
with the smallest example and then build up.

## 4.1 One route, before and after

**Old: `../pokedex/src/routes/types.ts`**

```ts
function normalizeIdentifier(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function createTypeRoutes(database: typeof db, service: PokemonService) {
  const routes = new Hono();

  routes.get("/type-search", async (c) => {
    const type = normalizeIdentifier(c.req.query("type"));
    if (!type) return c.json({ error: "Provide a Pokemon type using ?type=fire" }, 400);
    const rows = await database.select(/* ... */).where(eq(pokemonType.typeName, type));
    const names = rows.map((row) => row.name).sort((a, b) => a.localeCompare(b));
    return c.json({ type, count: names.length, pokemon: names, scope: "cached pokemon" });
  });

  return routes;
}
```

**New: `src/orpc/router/types.ts`**

```ts
export const search = publicProcedure
  .route({
    method: "GET",
    path: "/types/type-search",
    tags: ["Resources"],
    summary: "Search cached Pokemon by type",
  })
  .input(
    z.object({
      type: z.string().trim().toLowerCase().min(1, "Provide a Pokemon type using ?type=fire"),
    }),
  )
  .output(TypeSearchSchema)
  .handler(async ({ input: { type } }) => {
    const rows = await db.select(/* ... */).where(eq(pokemonType.typeName, type));
    const names = rows.map((row) => row.name).sort((a, b) => a.localeCompare(b));
    return { type, count: names.length, pokemon: names, scope: "cached pokemon" };
  });
```

Read the new version from top to bottom. Each line in the chain has one job:

| Piece | Job | Old equivalent |
| --- | --- | --- |
| `publicProcedure` | Starting point that already includes the shared error handling | `new Hono()` + `app.onError` |
| `.route({ method, path })` | The REST method and URL | `routes.get("/type-search", ...)` + the mount point in `app.ts` |
| `tags`, `summary` | Text for the generated API docs | Hand-written in `src/docs/openapi.ts` |
| `.input(zodSchema)` | Validate and normalize the input, or answer 400 | `normalizeIdentifier` + the `if (!type) return 400` |
| `.output(zodSchema)` | Validate the response, type it for the client, document it | Nothing (responses weren't checked) |
| `.handler(fn)` | The actual work; **returns plain data** | The `async (c) => { ... return c.json(...) }` callback |

Notice that:

- The handler **returns an object** instead of calling `c.json(...)`. oRPC turns it into a
  response for you.
- The handler receives **already-validated input**. The `trim().toLowerCase()` in the Zod schema
  replaced the `normalizeIdentifier` helper, so that helper was deleted.
- The `path` is now the **full** path (`/types/type-search`). In Hono, each router had a
  relative path and `app.ts` added the prefix (`app.route("/api/types", ...)`). In oRPC, each
  procedure says its whole path. The `/api` prefix is added once, where the handler is mounted
  (chapter 5).

## 4.2 Where does the input come from?

In Hono you picked each piece of input yourself: `c.req.query("type")`, `c.req.param("id")`,
`c.req.valid("json")`. In oRPC, **all input is merged into one object** and validated by one
schema:

- Path parameters: `path: "/pokemon/{identifier}"` → `input.identifier`
- Query string: `GET /types/type-search?type=water` → `input.type`
- JSON body: `POST /battles/fight` with `{ team1, team2 }` → `input.team1`, `input.team2`

Note the path parameter syntax changed: Hono used `/:pokemonId`, oRPC uses `/{pokemonId}`.

```ts
// old: src/routes/pokemon.ts
routes.get("/:identifier", async (c) => {
  const identifier = pokemonIdentifier.safeParse(c.req.param("identifier"));
  if (!identifier.success)
    return c.json({ error: "Provide a valid pokemon name or positive ID" }, 400);
  const entry = await findOrCachePokemon(identifier.data);
  // ...
```

```ts
// new: src/orpc/router/pokemon.ts
const identifierInput = z.object({ identifier: pokemonIdentifier });

export const get = publicProcedure
  .route({ method: "GET", path: "/pokemon/{identifier}", /* ... */ })
  .input(identifierInput)
  .output(PokemonDetailSchema)
  .handler(async ({ input }) => {
    const entry = await pokemonService.findOrCachePokemon(input.identifier);
    // ...
```

The reused `pokemonIdentifier` schema from `src/validation/fight.ts` does the validation, and
the manual `safeParse` + early return disappeared.

## 4.3 Output schemas: `src/orpc/schema.ts`

Every procedure has an `.output(...)` schema. They live together in `src/orpc/schema.ts`:

```ts
export const PokemonDetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  stats: PokemonStatsSchema,
  totalStats: z.number().int(),
  types: z.array(z.string()),
  // ...
});
```

An output schema does three jobs at once:

1. **Checks the server.** If a handler returns the wrong shape, the request fails loudly instead
   of sending bad data.
2. **Types the client.** The React code gets the result type from this schema. That's why the
   hand-written `type PokemonDetail = {...}` in the old `src/frontend/api/pokemon.ts` could be
   deleted.
3. **Documents the API.** The OpenAPI document's response schemas are generated from it.

## 4.4 Errors: `return c.json(..., 409)` becomes `throw new ORPCError("CONFLICT")`

```ts
// old: src/routes/pokedex.ts
if (!entry) return c.json({ error: "This Pokemon is already in your Pokedex." }, 409);
```

```ts
// new: src/orpc/router/pokedex.ts
if (!entry) {
  throw new ORPCError("CONFLICT", { message: "This Pokemon is already in your Pokedex." });
}
```

oRPC maps error **codes** to HTTP **status numbers**. These are the ones this project uses:

| `ORPCError` code | HTTP status | Used for |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Invalid input (thrown automatically by `.input`), duplicate Pokémon in a fight |
| `UNAUTHORIZED` | 401 | Not signed in |
| `FORBIDDEN` | 403 | Missing or wrong `Origin` header on a Pokédex change |
| `NOT_FOUND` | 404 | Unknown Pokémon, entry not in your Pokédex |
| `CONFLICT` | 409 | Pokémon already in your Pokédex |
| `BAD_GATEWAY` | 502 | PokeAPI failed or unreachable |
| `GATEWAY_TIMEOUT` | 504 | PokeAPI too slow |
| `INTERNAL_SERVER_ERROR` | 500 | Anything unexpected |

A **non-200 success status** is set on the route instead:

```ts
.route({ method: "POST", path: "/pokedex/create", successStatus: 201, /* ... */ })
```

**The error body format changed.** This is the one visible difference for API users:

```jsonc
// old
{ "error": "This Pokemon is already in your Pokedex." }

// new
{ "defined": false, "code": "CONFLICT", "status": 409, "message": "This Pokemon is already in your Pokedex." }
```

## 4.5 Middleware: shared behavior for many procedures

`src/orpc/base.ts` holds everything that used to be spread across `app.ts` and the top of
individual route files.

### a) Error mapping (replaces `app.onError`)

The old `app.onError` turned `ky` errors from PokeAPI into nice JSON responses. The new version
is a middleware that wraps every procedure in a `try/catch`:

```ts
const errorMapper = os.$context<ORPCContext>().middleware(async ({ next }) => {
  try {
    return await next();               // run the procedure
  } catch (error) {
    if (error instanceof ORPCError) throw error;   // already a proper API error: pass it on
    if (error instanceof HTTPError) {               // ky: PokeAPI answered with an error
      if (error.response.status === 404) {
        throw new ORPCError("NOT_FOUND", { message: "Requested resource not found in PokeAPI." });
      }
      throw new ORPCError("BAD_GATEWAY", { message: "PokeAPI could not complete the request..." });
    }
    // ... NetworkError → BAD_GATEWAY, TimeoutError → GATEWAY_TIMEOUT, anything else → 500
  }
});

export const publicProcedure = os.$context<ORPCContext>().use(errorMapper);
```

Compare it line by line with `app.onError` in `../pokedex/src/app.ts`. The branches are the
same; only the way the result is reported changed (`throw ORPCError` instead of `return c.json`).

Because every procedure starts from `publicProcedure`, every procedure gets this error handling.

### b) Authentication (replaces `routes.use("*", ...)` in the Pokédex router)

```ts
// old: src/routes/pokedex.ts
const routes = new Hono<{ Variables: { trainerId: string } }>();
routes.use("*", async (c, next) => {
  const current = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!current) return c.json({ error: "Sign in to access your Pokedex." }, 401);
  c.set("trainerId", current.user.id);
  await next();
});
routes.get("/", async (c) => { /* ... */ c.get("trainerId") /* ... */ });
```

```ts
// new: src/orpc/base.ts
export function protectedProcedure(message: string) {
  return publicProcedure.use(async ({ context, next }) => {
    context.resHeaders?.set("Cache-Control", "no-store");
    const current = await auth.api.getSession({ headers: context.headers });
    if (!current) throw new ORPCError("UNAUTHORIZED", { message });
    return next({ context: { session: current } });   // add `session` to the context
  });
}

// new: src/orpc/router/pokedex.ts
const trainerProcedure = protectedProcedure("Sign in to access your Pokedex.");
export const list = trainerProcedure
  .route({ method: "GET", path: "/pokedex", /* ... */ })
  .handler(async ({ context }) => {
    // context.session is fully typed: TypeScript knows it exists here
    /* ... */ eq(pokedex.userId, context.session.user.id) /* ... */
  });
```

The key idea is `next({ context: { session } })`. A middleware can **add things to the
context**, and every later middleware or handler can use them, **with types**. In Hono,
`c.get("trainerId")` needed the `Variables` generic to be typed. In oRPC the type flows
automatically from the middleware.

`protectedProcedure` is used by both `auth.me` and the three Pokédex procedures. In the old app,
each of those files repeated its own `getSession` check.

### c) The Origin check

```ts
export const requireAppOrigin = os
  .$context<{ headers: Headers }>()
  .middleware(async ({ context, next }) => {
    if (context.headers.get("Origin") !== auth.options.baseURL) {
      throw new ORPCError("FORBIDDEN", { message: "Use the app's Origin header for Pokedex changes." });
    }
    return next();
  });

export const add = trainerProcedure.use(requireAppOrigin).route(/* ... */)
```

Old code checked `!["GET", "HEAD", "OPTIONS"].includes(c.req.method)` inside one shared
middleware. New code simply attaches `requireAppOrigin` to the procedures that change data
(`add` and `remove`). Chaining `.use(...)` reads like a list of requirements.

> **Why check `Origin`?** Cookies are sent automatically by the browser, even when another
> website triggers the request. Checking that the `Origin` header matches our own site blocks
> that kind of attack (CSRF) on our cookie-authenticated changes.

### d) The context type

```ts
export type ORPCContext = ResponseHeadersPluginContext & { headers: Headers };
```

The **context** is the information every procedure receives about the current request. Here it's
the request headers (needed to read the session cookie) and, through `ResponseHeadersPlugin`, a
`resHeaders` object for setting response headers like `Cache-Control`. Chapter 5 shows where the
context is created.

## 4.6 Dependencies: from parameters to imports

Old route files received their dependencies as **function parameters**:

```ts
export function createPokedexRoutes(auth: Auth, database: OwnershipDatabase, findOrCachePokemon: PokemonLoader)
```

New procedure files **import** them directly:

```ts
import { db } from "#/db";
import { pokemonService, protectedProcedure } from "../base";
```

with one shared service created in `base.ts`:

```ts
export const pokemonService = createPokemonService();
```

This is simpler to read, but it's a trade-off. Passing dependencies in ("dependency injection")
made it easy to give a route a fake database in a test. With direct imports, a test has to
replace the module instead. It's a good thing to discuss with your mentor.

## 4.7 The router: one object that lists every procedure

`src/orpc/router/index.ts` replaces the list of `app.route(...)` calls in `app.ts`:

```ts
export default {
  discovery,
  auth: { me: auth.me },
  pokedex: { list: pokedex.list, add: pokedex.add, remove: pokedex.remove },
  battles: { fight: battles.fight, list: battles.list },
  pokemon: { get: pokemon.get, regions: pokemon.regions },
  types: { list: types.list, search: types.search },
  regions: { list: regions.list, search: regions.search },
};
```

The **shape of this object** decides two things:

- The RPC URLs: `pokemon.get` is reachable at `/api/rpc/pokemon/get`.
- The client API: the frontend calls `client.pokemon.get(...)`, `client.pokedex.add(...)`, etc.

## 4.8 Handlers and generated docs: `src/orpc/handlers.ts`

A router is just a description. A **handler** turns HTTP requests into procedure calls. We create
two handlers for the same router:

```ts
// typed RPC endpoint used by the frontend's oRPC client
export const rpcHandler = new RPCHandler(router, {
  interceptors: [onError(logUnexpected)],
  plugins: [new ResponseHeadersPlugin()],
});

// REST endpoints keep the original /api/... paths, plus Swagger UI and the OpenAPI document
export const openAPIHandler = new OpenAPIHandler(router, {
  interceptors: [onError(logUnexpected)],
  plugins: [
    new ResponseHeadersPlugin(),
    new SmartCoercionPlugin({ schemaConverters: [new ZodToJsonSchemaConverter()] }),
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      docsProvider: "swagger",
      docsPath: "/docs",
      specPath: "/docs/openapi.json",
      specGenerateOptions,
    }),
  ],
});
```

- **`RPCHandler`** speaks oRPC's own protocol. It understands rich types like `Date`, which is why
  `addedAt` arrives in the browser as a real `Date` object over RPC.
- **`OpenAPIHandler`** speaks normal REST and JSON, using the `method`/`path` from each `.route()`.
  Over REST, `Date` values become ISO strings.
- **`SmartCoercionPlugin`** converts query-string and path text into the types the input schema
  expects. URLs only contain text, so this matters when a schema wants something like a number.
- **`OpenAPIReferencePlugin`** generates `/api/docs/openapi.json` from the Zod schemas and serves
  Swagger UI at `/api/docs`. This replaced the 856-line hand-written document.
- **`specGenerateOptions`** adds the parts oRPC can't know about: Better Auth's own
  sign-up/sign-in/sign-out/get-session endpoints (taken from `auth.api.generateOpenAPISchema()`),
  and the session cookie as a security scheme.
- **`logUnexpected`** logs errors that `errorMapper` never saw. One example is an **output**
  validation failure, which happens after the handler has returned.

## Check yourself

1. In the old code, the `/api/types` prefix came from `app.ts`. Where does it come from now?
2. What three jobs does an `.output()` schema do?
3. How does a handler send a 409 now?
4. In `protectedProcedure`, what does `next({ context: { session: current } })` achieve?
5. Why does `addedAt` arrive as a `Date` in the React app but as a string in PowerShell?
6. Try it: open `http://localhost:3000/api/docs` and find `POST /pokedex/create`. Which part of
   the code produced its summary text?

<details>
<summary>Answers</summary>

1. Each procedure's `.route({ path: "/types/..." })` contains its full path, and the handler is
   mounted under `/api` in `src/routes/api.$.ts` (`serve(openAPIHandler, "/api")`).
2. It validates the server's response, gives the client its TypeScript type, and documents the
   response in the OpenAPI document.
3. `throw new ORPCError("CONFLICT", { message: "..." })`.
4. It adds `session` to the context for every later middleware and the handler, and TypeScript
   knows it's there.
5. The browser uses the RPC protocol, which can encode `Date` values. REST uses plain JSON,
   which has no date type, so dates become ISO strings.
6. `summary: "Add a Pokemon to your Pokedex"` in the `.route({...})` call in
   `src/orpc/router/pokedex.ts`.

</details>
