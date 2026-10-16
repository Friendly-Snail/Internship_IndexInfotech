# Pokémon Explorer
> Rawindhya Hettiarachchi

TanStack Start app with oRPC endpoints, Better Auth, Drizzle ORM, and PostgreSQL.

## Getting started

```bash
bun install
cp .env.postgres.example .env.postgres   # set a local password
cp .env.example .env.local               # match DATABASE_URL to .env.postgres; set BETTER_AUTH_SECRET
bun run db:up                            # PostgreSQL via Docker Compose on 127.0.0.1:5433
bun run db:migrate                       # apply the Drizzle migrations in ./drizzle
bun run db:check                         # optional connection check
bun run dev                              # http://localhost:3000
```

`BETTER_AUTH_URL` must be the origin you open in the browser (normally `http://localhost:3000`):
Better Auth trusts it, and Pokédex changes require a matching `Origin` header.

Production: `bun run build`, then `bun run preview` (or run `dist/server/server.js` with your host).
Better Auth enables its rate limiter in production, so rapid repeated sign-ins return 429.

Other scripts: `db:down`, `db:logs`, `db:generate` (new migration after schema changes),
`auth:generate` (regenerate `src/db/schema/auth-schema.ts`), `typecheck`.

## Project organization

| Path | Purpose |
| --- | --- |
| `src/routes/` | One TanStack route per page: `/`, `/pokemon`, `/search`, `/battles`, `/pokedex` |
| `src/routes/api.$.ts` | REST (OpenAPI) handler for every oRPC procedure, plus `/api/docs` |
| `src/routes/api.rpc.$.ts` | oRPC endpoint used by the frontend |
| `src/routes/api/auth/` | Better Auth handler; `me.ts` sends `/api/auth/me` to oRPC |
| `src/orpc/router/` | Procedures grouped as before: battles, pokemon, types, regions, pokedex, auth, discovery |
| `src/orpc/base.ts` | Request context, PokeAPI/database error mapping, session and Origin checks |
| `src/orpc/client.ts` | Isomorphic oRPC client + TanStack Query utilities |
| `src/services/pokemon.ts` | Shared Pokémon cache and PokeAPI helpers |
| `src/db/schema/` | Drizzle schema; migrations live in `drizzle/` |
| `src/lib/auth.ts` | Better Auth configuration (Drizzle adapter) |

Pages call the API through the typed oRPC client (`orpc.*.queryOptions()` / `client.*`).
Sign-up, sign-in, and sign-out use the Better Auth client.

## Routes and response formats

Every procedure is reachable two ways: REST at the paths below (unchanged from the Hono version), and
oRPC at `POST /api/rpc/<group>/<procedure>` (e.g. `/api/rpc/pokemon/get`).

| Method | Path | oRPC procedure | Purpose |
| --- | --- | --- | --- |
| GET | /api | discovery | Discovery |
| GET | /api/docs | — | Swagger UI |
| GET | /api/docs/openapi.json | — | OpenAPI contract (includes Better Auth routes) |
| POST | /api/auth/sign-up/email | — (Better Auth) | Sign up and receive a session cookie |
| POST | /api/auth/sign-in/email | — (Better Auth) | Sign in |
| POST | /api/auth/sign-out | — (Better Auth) | Sign out |
| GET | /api/auth/get-session | — (Better Auth) | Standard session response; null when anonymous |
| GET | /api/auth/me | auth.me | Safe trainer summary; 401 when anonymous |
| GET | /api/pokedex | pokedex.list | Your ownership list |
| POST | /api/pokedex/create | pokedex.add | Add ownership with {"pokemon":"pikachu"} (201) |
| DELETE | /api/pokedex/:pokemonId | pokedex.remove | Remove your ownership |
| POST | /api/battles/fight | battles.fight | Save a battle with team1 and team2 arrays |
| GET | /api/battles | battles.list | Saved battle history |
| GET | /api/pokemon/:identifier | pokemon.get | Stats, types, effectiveness, and regions |
| GET | /api/pokemon/:identifier/regions | pokemon.regions | Wild encounter regions |
| GET | /api/types | types.list | Complete type list |
| GET | /api/types/type-search?type=water | types.search | Cached Pokémon of a type |
| GET | /api/regions | regions.list | Complete region list |
| GET | /api/regions/region-search?region=kanto | regions.search | Cached Pokémon with encounters in a region |

Status codes match the Hono version (400, 401, 403, 404, 409, 502, 504). Error bodies now use
oRPC's format: `{ "defined": false, "code": "CONFLICT", "status": 409, "message": "..." }`
(the old format was `{ "error": "..." }`); validation errors list their issues under `data.issues`.

`foughtAt` in battle history is a whole-number Unix timestamp in **seconds**.
Pokédex addedAt and authentication dates are ISO date-time strings over REST (Date objects over oRPC).
For display, use `new Date(battle.foughtAt * 1000)`.

Battle teams each contain 1–4 distinct Pokémon; unequal team sizes are allowed.
Names and string IDs can be used, but cannot identify the same Pokémon twice
across a fight. Search routes read cached Pokémon, so their lists may initially
be empty. A region means a wild encounter location, not the Pokémon's generation.

## Login Session
### Sign Up
Use an unused email. Sign-up creates the user, a credential account with a password hash, and a session. It signs the caller in automatically.
```powershell
$base = "http://localhost:3000"
$headers = @{ Origin = $base }
$signup = @{
  name = "Example"
  email = "example@email.com"
  password = "examplepassword"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "$base/api/auth/sign-up/email" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $signup `
    -SessionVariable trainerSession
```

### Sign In
```powershell
$login = @{
  email = "example@email.com"
  password = "examplepassword"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "$base/api/auth/sign-in/email" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $login `
    -SessionVariable trainerSession
Invoke-RestMethod `
    -Uri "$base/api/auth/me" `
    -WebSession $trainerSession
```
Try an incorrect password with a fresh client: sign-in returns 401 and does not create a signed-in session. Signing in as a different user should return that user's ID. In Postman, use its cookie jar for the same behavior.

### Identify Signed-In User
```powershell
Invoke-RestMethod `
    -Uri "$base/api/auth/me" `
    -WebSession $trainerSession
```
This returns the user's ID, name, email, emailVerified flag, and the session's ID and expiry. It omits the session token, password hash, IP, and user agent. `GET /api/auth/me` returns 401 if the cookie is absent, invalid, revoked, or expired. Its response has Cache-Control: no-store.

**Better Auth** also supplies its standard session endpoint:
```powershell
Invoke-RestMethod `
    -Uri "$base/api/auth/get-session" `
    -WebSession $trainerSession
```
That endpoint returns its standard session/user representation; without a session it returns null. `/api/auth/me` is the project's simpler protected endpoint.

### Sign Out
```powershell
Invoke-RestMethod `
    -Uri "$base/api/auth/sign-out" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body '{}' `
    -WebSession $trainerSession
```
Calling `/api/auth/me` now after signing out returns **401**; PowerShell reports that HTTP failure. Sign-out removes the server-side session, so replaying the old cookie also fails.

## Your Pokédex

After signing in, use the same PowerShell terminal and `$trainerSession`. Each trainer has one unique entry per Pokémon species. The same Pokémon can belong to multiple trainers. Adding it again to your own Pokédex returns 409.

```powershell
$ownedPokemon = @{ pokemon = "pikachu" } | ConvertTo-Json
Invoke-RestMethod `
    -Uri "$base/api/pokedex/create" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $ownedPokemon `
    -WebSession $trainerSession
Invoke-RestMethod `
    -Uri "$base/api/pokedex" `
    -WebSession $trainerSession | ConvertTo-Json `
    -Depth 6
Invoke-RestMethod `
    -Uri "$base/api/pokedex/25" `
    -Method Delete `
    -Headers $headers `
    -WebSession $trainerSession
```

The add request accepts a Pokémon name or ID **as a string**, such as `"25"`. Deletion uses the numeric Pokémon ID shown in the list. All three operations require a valid session. POST and DELETE also require `Origin`, supplied by `$headers`. You cannot choose another trainer by sending a user ID. Removing ownership keeps the shared Pokémon cache and battle history.

## Example fight scripts

Run these in PowerShell while `bun run dev` is running.

### 1v1

```powershell
$body = @{
    team1 = @("pikachu")
    team2 = @("geodude")
} | ConvertTo-Json -Depth 4

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/battles/fight" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body | ConvertTo-Json -Depth 8
```

### 2v2

```powershell
$body = @{
    team1 = @("pikachu", "bulbasaur")
    team2 = @("squirtle", "charmander")
} | ConvertTo-Json -Depth 4

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/battles/fight" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body | ConvertTo-Json -Depth 8
```

## Reset Database

**This deletes cached Pokémon, saved battles, and Pokédex ownership entries**, while keeping trainer accounts, table structure, and Drizzle migration history. Ownership is included because it references the Pokémon cache:

```sql
TRUNCATE TABLE
  public.pokedex,
  public.pokemon_encounter,
  public.encounter_area,
  public.region,
  public.type_matchup,
  public.pokemon_type,
  public.pokemon_element_type,
  public.battle_participant,
  public.battle_history,
  public.pokemon,
  public.resource_list_cache
RESTART IDENTITY;
```

Confirm the reset:

```sql
SELECT
  (SELECT count(*) FROM public.pokedex) AS ownership_entries,
  (SELECT count(*) FROM public.battle_participant) AS participants,
  (SELECT count(*) FROM public.battle_history) AS battles,
  (SELECT count(*) FROM public.pokemon) AS cached_pokemon,
  (SELECT count(*) FROM public.pokemon_type) AS pokemon_types,
  (SELECT count(*) FROM public.pokemon_element_type) AS types,
  (SELECT count(*) FROM public.type_matchup) AS matchups,
  (SELECT count(*) FROM public.pokemon_encounter) AS encounters,
  (SELECT count(*) FROM public.encounter_area) AS encounter_areas,
  (SELECT count(*) FROM public.region) AS regions,
  (SELECT count(*) FROM public.resource_list_cache) AS cached_lists;
```

All counts should be 0. Restart the server afterward; API requests will populate the caches again.

**To delete every trainer account**, run this additional command:

```sql
TRUNCATE TABLE
  public.pokedex,
  public.session,
  public.account,
  public.verification,
  public."user";
```

This deletes users, password hashes, sessions, verification records, and their Pokédex ownership entries. Existing session cookies will no longer identify a user, and you can sign up again using the same emails.

Neither reset requires regenerating or rerunning migrations, because the tables remain in place.
