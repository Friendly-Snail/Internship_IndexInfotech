import express from "express";
import ky from "ky"

const app = express();
const PORT = 3000;
const POKEAPI_BASE_URL = "https://pokeapi.co/api/v2";

// only describe the PokeAPI fields this project actually uses bs im a beginner lol
interface NamedApiResource {
    name: string;
    url: string;
}

interface PokemonStat {
    base_stat: number;
    stat: NamedApiResource;
}

interface PokemonTypeSlot {
    slot: number;
    type: NamedApiResource;
}

interface Pokemon {
    id: number;
    name: string;
    stats: PokemonStat[];
    types: PokemonTypeSlot[];
}

interface TypeDamageRelations {
    double_damage_to: NamedApiResource[];
    half_damage_to: NamedApiResource[];
    no_damage_to: NamedApiResource[];
}

interface TypePokemonEntry {
    pokemon: NamedApiResource;
    slot: number;
}

interface PokemonTypeResponse {
    id: number;
    name: string;
    damage_relations: TypeDamageRelations;
    pokemon: TypePokemonEntry[];
}

// -----------------------------
// PokeAPI helper functions
// -----------------------------


async function getPokemon(identifier: string): Promise<Pokemon> {
    const response = await fetch(
      `${POKEAPI_BASE_URL}/pokemon/${encodeURIComponent(identifier.toLowerCase())}`, 
    );

    if (!response.ok) {
        throw new Error(`Pokemon "${identifier}" was not found.`);
    }

    return (await response.json()) as Pokemon;
}

async function getType(identifier: string): Promise<PokemonTypeResponse> {
    const response = await fetch(
        `${POKEAPI_BASE_URL}/type/${encodeURIComponent(identifier.toLowerCase())}`
    );

    if (!response.ok) {
        throw new Error(`Type "${identifier}" was not found.`);
    }

    return (await response.json()) as PokemonTypeResponse;
}

// -----------------------------
// Pokemon data helpers
// -----------------------------

function getTotalStats(pokemon: Pokemon): number {
    // identifier/path being used:
    // pokemon.stats[].base_stat
    return pokemon.stats.reduce(
        (total, stat) => total + stat.base_stat,
        0
    );
}

function getSpeed(pokemon: Pokemon): number {
    // identify the speed stat by:
    // pokemon.stats[].stat.name === "speed"
    const speedStat = pokemon.stats.find(
        (stat) => stat.stat.name === "speed"
    );

    return speedStat?.base_stat ?? 0;
}

function getTypes(pokemon: Pokemon): string[] {
    // identifier/path being used:
    // pokemon.types[].type.name
    return pokemon.types.map(
        (pokemonType) => pokemonType.type.name
    );
}

// -----------------------------
// Type effectiveness
// -----------------------------

async function getTypeMultiplier(
    attackingPokemon: Pokemon,
    defendingPokemon: Pokemon
): Promise<number> {
    const attackingTypes = getTypes(attackingPokemon);
    const defendingTypes = getTypes(defendingPokemon);

    let bestMultiplier = 0;

    // This is intentionally a simple beginner battle rule:
    // find the best type matchup the attacking Pokemon has.
    for (const attackingType of attackingTypes) {
        const typeData = await getType(attackingType);
        let multiplier = 1;

        for (const defendingType of defendingTypes) {
            if (
                typeData.damage_relations.double_damage_to.some(
                    (type) => type.name === defendingType
                )
            ) {
                multiplier *= 2;
            }

            if (
                typeData.damage_relations.half_damage_to.some(
                    (type) => type.name === defendingType
                )
            ) {
                multiplier *= 0.5;
            }

            if (
                typeData.damage_relations.no_damage_to.some(
                    (type) => type.name === defendingType
                )
            ) {
                multiplier *= 0;
            }
        }

        bestMultiplier = Math.max(bestMultiplier, multiplier);
    }

    return bestMultiplier || 1;
}

function getTypeBonus(multiplier: number): number {
    if (multiplier >= 4) return 100;
    if (multiplier > 1) return 50;
    if (multiplier === 0) return -100;
    if (multiplier < 1) return -50;
    return 0;
}

async function calculateBattleScore(
    attacker: Pokemon,
    defender: Pokemon
): Promise<{ totalStats: number; typeMultiplier: number; score: number }> {
    const totalStats = getTotalStats(attacker);
    const typeMultiplier = await getTypeMultiplier(attacker, defender);
    const score = totalStats + getTypeBonus(typeMultiplier);

    return {
        totalStats,
        typeMultiplier,
        score
    };
}

// -----------------------------
// GET /fight
// Example:
// /fight?pokemon1=squirtle&pokemon2=charmander
// -----------------------------

app.get("/fight", async (req, res) => {
    const pokemon1Name = req.query.pokemon1;
    const pokemon2Name = req.query.pokemon2;

    if (
        typeof pokemon1Name !== "string" ||
        typeof pokemon2Name !== "string"
    ) {
        return res.status(400).json({
            error:
                "Provide two Pokemon using ?pokemon1=squirtle&pokemon2=charmander"
        });
    }

    if (
        pokemon1Name.trim().toLowerCase() ===
        pokemon2Name.trim().toLowerCase()
    ) {
        return res.status(400).json({
            error: "Please choose two different Pokemon."
        });
    }

    try {
        const [pokemon1, pokemon2] = await Promise.all([
            getPokemon(pokemon1Name.trim()),
            getPokemon(pokemon2Name.trim())
        ]);

        const [battle1, battle2] = await Promise.all([
            calculateBattleScore(pokemon1, pokemon2),
            calculateBattleScore(pokemon2, pokemon1)
        ]);

        let winner: Pokemon;
        let loser: Pokemon;
        let winnerBattle;
        let loserBattle;
        let tieBreaker = "battle score";

        if (battle1.score !== battle2.score) {
            const firstWins = battle1.score > battle2.score;
            winner = firstWins ? pokemon1 : pokemon2;
            loser = firstWins ? pokemon2 : pokemon1;
            winnerBattle = firstWins ? battle1 : battle2;
            loserBattle = firstWins ? battle2 : battle1;
        } else if (battle1.totalStats !== battle2.totalStats) {
            tieBreaker = "total base stats";
            const firstWins = battle1.totalStats > battle2.totalStats;
            winner = firstWins ? pokemon1 : pokemon2;
            loser = firstWins ? pokemon2 : pokemon1;
            winnerBattle = firstWins ? battle1 : battle2;
            loserBattle = firstWins ? battle2 : battle1;
        } else if (getSpeed(pokemon1) !== getSpeed(pokemon2)) {
            tieBreaker = "speed";
            const firstWins = getSpeed(pokemon1) > getSpeed(pokemon2);
            winner = firstWins ? pokemon1 : pokemon2;
            loser = firstWins ? pokemon2 : pokemon1;
            winnerBattle = firstWins ? battle1 : battle2;
            loserBattle = firstWins ? battle2 : battle1;
        } else {
            // final deterministic tiebreaker because the endpoint rejects
            // identical Pokemon, two valid choices will have different IDs
            tieBreaker = "PokeAPI Pokemon ID";
            const firstWins = pokemon1.id > pokemon2.id;
            winner = firstWins ? pokemon1 : pokemon2;
            loser = firstWins ? pokemon2 : pokemon1;
            winnerBattle = firstWins ? battle1 : battle2;
            loserBattle = firstWins ? battle2 : battle1;
        }

        return res.json({
            winner: {
                name: winner.name,
                result: "WIN",
                types: getTypes(winner),
                totalStats: winnerBattle.totalStats,
                typeMultiplier: winnerBattle.typeMultiplier,
                battleScore: winnerBattle.score
            },
            loser: {
                name: loser.name,
                result: "LOSE",
                types: getTypes(loser),
                totalStats: loserBattle.totalStats,
                typeMultiplier: loserBattle.typeMultiplier,
                battleScore: loserBattle.score
            },
            decidedBy: tieBreaker,
            note:
                "This is a simple learning rule based on base stats and type effectiveness, not the official Pokemon battle system."
        });
    } catch (error) {
        return res.status(404).json({
            error:
                error instanceof Error
                    ? error.message
                    : "Something went wrong."
        });
    }
});

// -----------------------------
// GET /search-by-type
// Example:
// /search-by-type?type=fire
// -----------------------------

app.get("/search-by-type", async (req, res) => {
    const typeName = req.query.type;

    if (typeof typeName !== "string") {
        return res.status(400).json({
            error: "Provide a Pokemon type using ?type=fire"
        });
    }

    try {
        const typeData = await getType(typeName.trim());

        // Identifier/path being used:
        // typeData.pokemon[].pokemon.name
        const pokemonNames = typeData.pokemon
            .map((entry) => entry.pokemon.name)
            .sort((a, b) => a.localeCompare(b));

        return res.json({
            type: typeData.name,
            count: pokemonNames.length,
            pokemon: pokemonNames
        });
    } catch (error) {
        return res.status(404).json({
            error:
                error instanceof Error
                    ? error.message
                    : "Something went wrong."
        });
    }
});

// a small home route so localhost:3000 explains what to try.
app.get("/", (_req, res) => {
    res.json({
        message: "Beginner Pokemon API is running!",
        endpoints: {
            fight:
                "/fight?pokemon1=squirtle&pokemon2=charmander",
            searchByType:
                "/search-by-type?type=water"
        }
    });
});

app.listen(PORT, () => {
    console.log(`Pokemon API running at http://localhost:${PORT}`);
    console.log(
        `Fight example: http://localhost:${PORT}/fight?pokemon1=squirtle&pokemon2=charmander`
    );
    console.log(
        `Type example: http://localhost:${PORT}/search-by-type?type=water`
    );
});
