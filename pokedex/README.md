# Pokémon API
> Rawindhya Hettiarachchi

A small TypeScript API built with Bun, Hono, Drizzle ORM, PostgreSQL,
and PokeAPI. The project lets you compare two Pokémon in a simplified
battle, search for Pokémon by type, and view saved battle history.

The battle system is a custom learning rule based on Pokémon base stats
and type effectiveness. It is not the official Pokémon battle system (duh).

## Features

-   `GET /fight` compares two Pokémon and returns a winner, loser, or
    tie
-   `GET /search-by-type` returns Pokémon that belong to a requested
    type
-   `GET /battles` returns previously completed battles
-   Pokémon used in battles are cached in PostgreSQL so the program does
    not need to request the same data from PokeAPI every time
-   completed battles are saved in PostgreSQL

## How It Works

The server is written in TypeScript and uses Hono to handle HTTP
requests.

For a fight, the program first checks the local PostgreSQL database for
each Pokémon. If a Pokémon has already been cached, its saved data is
reused. If it is not in the database, the server requests its stats,
types, and type-effectiveness information from PokeAPI and saves that
information locally.

The program then calculates a simplified battle score using total base
stats and type effectiveness. If the battle scores are equal, total
stats and then speed are used as tiebreakers. If those are also equal,
the battle is recorded as a tie.

Drizzle ORM is used to communicate with PostgreSQL from TypeScript. The
database contains a `pokemon` table for cached Pokémon data and a
`battle_history` table for completed fights.

## Requirements

Before running the project, install:

-   Bun
-   PostgreSQL

Create a PostgreSQL database named:

``` text
pokedex
```

## Setup

Install the project dependencies:

``` powershell
bun install
```

Create your local `.env` file from the example:

``` powershell
Copy-Item .env.example .env
```

Update `.env` with your PostgreSQL password:

``` env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/pokedex
PORT=3000
```

Do not commit the real `.env` file because it contains your database
credentials.

Generate the database migration:

``` powershell
bun run db:generate
```

Apply the migration to PostgreSQL:

``` powershell
bun run db:migrate
```

## Running the Program

Start the development server:

``` powershell
bun run dev
```

The API will normally run at:

``` text
http://localhost:3000
```

The terminal also prints example endpoint URLs when the server starts.

To stop the server, press:

``` text
Ctrl + C
```

## Endpoints

### Fight

``` text
GET /fight?pokemon1=squirtle&pokemon2=charmander
```

Example:

``` text
http://localhost:3000/fight?pokemon1=squirtle&pokemon2=charmander
```

This endpoint loads or caches both Pokémon, calculates the battle
result, saves the battle to PostgreSQL, and returns the result as JSON.

### Search by Type

``` text
GET /search-by-type?type=water
```

Example:

``` text
http://localhost:3000/search-by-type?type=water
```

This endpoint requests type information from PokeAPI and returns an
alphabetical list of Pokémon belonging to that type.

### Battle History

``` text
GET /battles
```

Example:

``` text
http://localhost:3000/battles
```

This endpoint reads the saved battle records from PostgreSQL and returns
them as JSON.

## Main Files

-   `src/server.ts` contains the API routes, PokeAPI communication,
    caching logic, battle calculations, and error handling
-   `src/db/schema.ts` defines the PostgreSQL tables, columns, keys,
    relations, and indexes
-   `src/db/index.ts` creates the Drizzle/PostgreSQL database connection
-   `drizzle.config.ts` contains the Drizzle migration configuration
-   `.env` contains local database connection settings and is not
    committed to Git

## Useful Commands

``` powershell
bun run dev
```

Runs the development server with hot reloading.

``` powershell
bun run start
```

Runs the server normally.

``` powershell
bun run typecheck
```

Checks the TypeScript code for type errors.

``` powershell
bun run db:generate
```

Generates migration files from the Drizzle schema.

``` powershell
bun run db:migrate
```

Applies generated migrations to PostgreSQL.

## Technical Summary

The main flow of the project is:

``` text
client request
→ Hono route
→ PostgreSQL lookup
→ PokeAPI request if data is missing
→ battle or search logic
→ PostgreSQL storage when needed
→ JSON response
```

Bun runs the TypeScript application, Hono handles the API routes, Ky
sends HTTP requests to PokeAPI, Drizzle provides type-safe database
queries, and PostgreSQL stores cached Pokémon and battle history.
