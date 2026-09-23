# Beginner Pokémon API - A Super Professional README
> Rawindhya Hettiarachchi
> 
<small>I knew my weird obsession with markdown would come in handy one day ^_^</small>

A small TypeScript & Express project for learning how to consume a REST API using [PokeAPI](https://pokeapi.co/).

The project intentionally focuses on two pieces of Pokémon data (so I don't go crazy):

- **STATS**
- **TYPES**

It exposes two endpoints:

- `GET /fight`
- `GET /search-by-type`

## Requirements

Install:

- Node.js 18 or newer (I'll eventually switch to `bun` I promise)

## Setup

Open this project folder in VS Code, then open a terminal and run:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

You should see:

```text
Pokemon API running at http://localhost:3000
```

and if you don't see that than idk I'm trying my best

## Endpoint 1: fight

Example:

```text
http://localhost:3000/fight?pokemon1=squirtle&pokemon2=charmander
```

The endpoint:

1. Reads `pokemon1` and `pokemon2` from the query string
2. Calls PokeAPI's `/pokemon/{identifier}` resource for both Pokémon
3. Reads their base stats from `stats[].base_stat`
4. Reads their types from `types[].type.name`
5. Calls PokeAPI's `/type/{identifier}` resource
6. Reads type relationships from `damage_relations`
7. Combines base stats and a simple type bonus to pick a winner

This is deliberately **not** an implementation of the official Pokémon battle system because that would be crazy

### No ties

The project always produces WIN/LOSE for two different Pokémon. If the calculated battle scores tie, it uses:

1. total base stats
2. speed
3. PokeAPI Pokémon ID

as deterministic tiebreakers.

## Endpoint 2: search-by-type

Example:

```text
http://localhost:3000/search-by-type?type=fire
```

This calls:

```text
https://pokeapi.co/api/v2/type/fire
```

and turns PokeAPI's nested data into a simpler list of Pokémon names.

The important data path is:

```text
pokemon[].pokemon.name
```

## "What is the identifier for the data?"

Keep this question in mind while reading `src/server.ts`.

Some important examples are:

| Information | PokeAPI data path |
| --- | --- |
| Pokémon ID | `id` |
| Pokémon name | `name` |
| Stats array | `stats` |
| Stat value | `stats[].base_stat` |
| Stat identifier/name | `stats[].stat.name` |
| Types array | `types` |
| Type identifier/name | `types[].type.name` |
| Type relationships | `damage_relations` |
| Pokémon belonging to a type | `pokemon[].pokemon.name` |

PokeAPI resources can generally be addressed by an **ID or name**. In this project, names such as `squirtle`, `charmander`, and `water` are used as resource identifiers.

## Try these

```text
http://localhost:3000/fight?pokemon1=bulbasaur&pokemon2=squirtle
http://localhost:3000/fight?pokemon1=pikachu&pokemon2=squirtle
http://localhost:3000/fight?pokemon1=charizard&pokemon2=venusaur

http://localhost:3000/search-by-type?type=fire
http://localhost:3000/search-by-type?type=water
http://localhost:3000/search-by-type?type=electric
```

## Project structure

```text
pokemon-api-beginner/
├── src/
│   └── server.ts
├── .gitignore
├── package.json
├── README.md
└── tsconfig.json
```

`node_modules` is intentionally not included. Running `npm install` downloads the dependencies listed in `package.json`.

## Build and run compiled JavaScript

For learning/development, `npm run dev` is easiest.

You can also compile the TypeScript:

```bash
npm run build
```

Then run the compiled JavaScript:

```bash
npm start
```

THE END YAYYYY

## Future Notes

* Add a proper tie system :(
* more explicit error codes (what response are we actually getting?)
* make helper function to allow us to make a fetch without putting interpolated strin every time
