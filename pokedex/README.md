# Pokémon API
> Rawindhya Hettiarachchi

A small Pokémon API built with Bun, Hono, TypeScript, Drizzle, PostgreSQL, and PokeAPI. Battles use my own simple scoring rule based on base stats and type effectiveness, not the official Pokémon battle system.

## What's new in this iteration

- Pokémon stats, types, and type matchups live in separate database tables. A Pokémon can have multiple types, and the matchup table records which attacking types are strong or weak against defending types.
- `POST /fight` accepts two equally sized teams of 1–4 Pokémon. Pokémon in matching positions face each other; their scores are added to decide the winning team or a tie. Every participant and score is saved with the battle.
- Zod validates the JSON fight request before the route processes it. `/battles` reads saved fights, including older one-on-one fights.
- Pokémon encounter areas connect to regions. `/search-by-region?region=kanto` and `/search-by-type?type=water` search Pokémon currently cached in the database, so they may not show every Pokémon in PokeAPI.
- `/pokemon/pikachu` shows stats, types, weaknesses, and example scores; `/pokemon/pikachu/regions` checks its encounter regions. `/types` and `/regions` list the available names.
- Migrations `0000` through `0006` build and change the database step by step. The latest migration stores type multipliers as decimals such as `2.00` and `0.50`. Battle history displays dates in UTC.

## Run the project

Set `DATABASE_URL` in `.env` to PostgreSQL database (for example, `pokedex_migrations`). Then run:

```powershell
bun install
bun run db:migrate
bun run dev
```

Visit `http://localhost:3000/` to see the route examples. When changing the database schema later, use `bun run db:generate`, inspect the new SQL, and then run `bun run db:migrate`. You can check the code with `bun run typecheck`, `bun run lint`, `bun run format:check`, and `bun run test`.

## `Promise.all` and `Promise.allSettled`

Both combine multiple asynchronous operations and wait for their outcomes:

- `Promise.all([...])` returns all results in order if every operation succeeds. If any one fails, the combined promise rejects. We use it when a fight needs all Pokémon and their type data to calculate a valid result.
- `Promise.allSettled([...])` waits for every operation even if some fail. It returns an outcome for each one (`fulfilled` or `rejected`). Use it when partial success is useful and you want to handle individual failures.

`Promise.all` rejecting does **not** cancel the other requests that already started. It means the caller cannot use the combined result as a complete set.

## Reset Database

Run this in pgAdmin's Query Tool while connected to the project database. **This removes cached Pokémon and saved battles**, but keeps the table structure and Drizzle migration history.

```sql
TRUNCATE TABLE
  public.pokemon_encounter,
  public.encounter_area,
  public.region,
  public.type_matchup,
  public.pokemon_type,
  public.pokemon_stat,
  public.pokemon_element_type,
  public.battle_participant,
  public.battle_history,
  public.pokemon
RESTART IDENTITY;
```

Confirm the reset:

```sql
SELECT
  (SELECT count(*) FROM public.battle_participant) AS participants,
  (SELECT count(*) FROM public.battle_history) AS battles,
  (SELECT count(*) FROM public.pokemon) AS cached_pokemon,
  (SELECT count(*) FROM public.pokemon_stat) AS stats,
  (SELECT count(*) FROM public.pokemon_type) AS pokemon_types,
  (SELECT count(*) FROM public.type_matchup) AS matchups,
  (SELECT count(*) FROM public.pokemon_encounter) AS encounters,
  (SELECT count(*) FROM public.region) AS regions;
```

All counts should be 0 if successful.

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
