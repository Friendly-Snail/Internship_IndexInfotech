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
    -Uri "$base/me" `
    -WebSession $trainerSession
```
Try an incorrect password with a fresh client: sign-in returns 401 and does not create a signed-in session. Signing in as a different user should return that user's ID. In Postman, use its cookie jar for the same behavior.

### Identify Signed-In User
```powershell
Invoke-RestMethod `
    -Uri "$base/me" `
    -WebSession $trainerSession
```
This returns the user's ID, name, email, emailVerified flag, and the session's ID and expiry. It omits the session token, password hash, IP, and user agent. `GET /me` returns 401 if the cookie is absent, invalid, revoked, or expired. Its response has Cache-Control: no-store.

**Better Auth** also supplies its standard session endpoint:
```powershell
Invoke-RestMethod `
    -Uri "$base/api/auth/get-session" `
    -WebSession $trainerSession
```
That endpoint returns its standard session/user representation; without a session it returns null. `/me` is the project's simpler protected endpoint.

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
Calling `/me` now after signing out returns **401**; PowerShell reports that HTTP failure. Sign-out removes the server-side session, so replaying the old cookie also fails.

## Your Pokédex

After signing in, use the same PowerShell terminal and `$trainerSession`. Each trainer has one unique entry per Pokémon species. The same Pokémon can belong to multiple trainers. Adding it again to your own Pokédex returns 409.

```powershell
$ownedPokemon = @{ pokemon = "pikachu" } | ConvertTo-Json
Invoke-RestMethod `
    -Uri "$base/pokedex" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $ownedPokemon `
    -WebSession $trainerSession
Invoke-RestMethod `
    -Uri "$base/pokedex" `
    -WebSession $trainerSession | ConvertTo-Json `
    -Depth 6
Invoke-RestMethod `
    -Uri "$base/pokedex/25" `
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
    -Uri "http://localhost:3000/fight" `
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
    -Uri "http://localhost:3000/fight" `
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

`src/server.ts` starts Bun; `src/app.ts` assembles the route groups and handles shared errors. Endpoints are grouped by purpose in `src/routes`: battles, search, Pokemon details, resource lists, authentication, ownership, documentation, and discovery. Shared Pokemon cache helpers live in `src/services/pokemon.ts`. Existing endpoint URLs and authentication rules remain the same.
