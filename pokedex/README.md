# Pokémon API
> Rawindhya Hettiarachchi

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

## Project organization

`src/server.ts` starts Bun; `src/app.ts` assembles the route groups and handles shared errors. Endpoints are grouped by purpose in `src/routes`: battles, search, Pokemon details, resource lists, authentication, ownership, documentation, and discovery. Shared Pokemon cache helpers live in `src/services/pokemon.ts`. All application routes use the /api prefixes listed below; GET / remains the discovery endpoint.

## Final routes and response formats

| Method | Path | Purpose |
| --- | --- | --- |
| GET | / | Discovery |
| GET | /api/docs | Swagger UI |
| GET | /api/docs/openapi.json | OpenAPI contract |
| POST | /api/auth/sign-up/email | Sign up and receive a session cookie |
| POST | /api/auth/sign-in/email | Sign in |
| POST | /api/auth/sign-out | Sign out |
| GET | /api/auth/get-session | Standard session response; null when anonymous |
| GET | /api/auth/me | Safe trainer summary; 401 when anonymous |
| GET | /api/pokedex | Your ownership list |
| POST | /api/pokedex/create | Add ownership with {"pokemon":"pikachu"} |
| DELETE | /api/pokedex/:pokemonId | Remove your ownership |
| POST | /api/battles/fight | Save a battle with team1 and team2 arrays |
| GET | /api/battles | Saved battle history |
| GET | /api/pokemon/:identifier | Stats, types, effectiveness, and regions |
| GET | /api/pokemon/:identifier/regions | Wild encounter regions |
| GET | /api/types | Complete type list |
| GET | /api/types/type-search?type=water | Cached Pokémon of a type |
| GET | /api/regions | Complete region list |
| GET | /api/regions/region-search?region=kanto | Cached Pokémon with encounters in a region |

`foughtAt` in battle history is a whole-number Unix timestamp in **seconds**.
Pokédex addedAt and authentication dates remain ISO date-time strings.
PostgreSQL retains full timestamps and sorts history before conversion.
For display, use `new Date(battle.foughtAt * 1000)`; choose UTC or the user's
local timezone explicitly when formatting the resulting Date.

Battle teams each contain 1–4 distinct Pokémon; unequal team sizes are allowed.
Names and string IDs can be used, but cannot identify the same Pokémon twice
across a fight. Search routes read cached Pokémon, so their lists may initially
be empty. A region means a wild encounter location, not the Pokémon's generation.

## Postman workflow

Import postman/pokemon-api.postman_collection.json. Set its baseUrl variable
to the running API origin, without a trailing slash. Set appOrigin to exactly
BETTER_AUTH_URL (normally http://localhost:3000). Keep Postman's cookie jar
enabled; the requests use cookie authentication, not bearer tokens.

Run the collection in its saved order, with one iteration. It starts by signing
out any current session, checks public routes and anonymous errors, creates a
fresh example trainer, adds/lists/removes ownership, saves a battle, checks its
history, signs out, and signs back in. The sign-up pre-request script creates a
new example email for each run; later sign-in reuses it. Run the sign-up request
first if you execute individual authenticated requests manually.

Expected errors include 400 for invalid input, 401 without a session, 403 for
an incorrect ownership Origin, 409 for duplicate ownership, and 404 after
ownership has been removed. Battle-history checks locate the battleId returned
by this run rather than assuming it is the first row. The run creates a trainer
account and retains its saved battle/cache data; it removes its sample ownership
entry. No database reset is necessary.

The collection contains post-response checks for statuses, counts, response
fields, timestamp units, and the authentication lifecycle. It does not replace
the broader final verification task. To import the OpenAPI contract separately,
use http://localhost:3000/api/docs/openapi.json; that import describes the API,
while the supplied collection provides an ordered workflow.
