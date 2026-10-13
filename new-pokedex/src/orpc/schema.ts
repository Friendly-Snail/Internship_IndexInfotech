import { z } from "zod";

// output schemas document every procedure in the generated OpenAPI contract

const battleOutcome = z.enum(["TEAM1_WIN", "TEAM2_WIN", "TIE"]);

export const PokemonStatsSchema = z.object({
  hp: z.number().int(),
  attack: z.number().int(),
  defense: z.number().int(),
  "special-attack": z.number().int(),
  "special-defense": z.number().int(),
  speed: z.number().int(),
});

const effectiveness = z.object({ type: z.string(), multiplier: z.number() });

export const PokemonDetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  stats: PokemonStatsSchema,
  totalStats: z.number().int(),
  types: z.array(z.string()),
  defense: z.object({
    weakTo: z.array(effectiveness),
    resists: z.array(effectiveness),
    immuneTo: z.array(effectiveness),
  }),
  attackAgainstSingleType: z.array(
    effectiveness.extend({ bonus: z.number().int(), potentialScore: z.number().int() }),
  ),
  regions: z.array(z.string()),
  regionsComplete: z.boolean(),
  note: z.string(),
});

export const PokemonRegionsSchema = z.object({
  pokemon: z.string(),
  regions: z.array(z.string()),
});

const fightTeam = z.object({
  score: z.number().int(),
  pokemon: z.array(
    z.object({
      position: z.number().int(),
      id: z.number().int(),
      name: z.string(),
      result: z.enum(["WIN", "LOSE", "TIE"]),
      types: z.array(z.string()),
      totalStats: z.number().int(),
      typeMultiplier: z.number(),
      battleScore: z.number().int(),
    }),
  ),
});

export const FightResultSchema = z.object({
  battleId: z.number().int(),
  result: battleOutcome,
  decidedBy: z.string(),
  team1: fightTeam,
  team2: fightTeam,
  note: z.string(),
});

const historyTeam = z.object({
  score: z.number().int(),
  pokemon: z.array(
    z.object({
      position: z.number().int(),
      id: z.number().int(),
      name: z.string(),
      battleScore: z.number().int(),
      // NULL means the original single-Pokemon record did not save this snapshot
      totalStats: z.number().int().nullable(),
      speed: z.number().int().nullable(),
      typeMultiplier: z.number().nullable(),
    }),
  ),
});

export const BattleHistorySchema = z.object({
  count: z.number().int(),
  battles: z.array(
    z.object({
      id: z.number().int(),
      foughtAt: z.number().int().describe("Unix timestamp in seconds"),
      result: battleOutcome,
      decidedBy: z.string(),
      team1: historyTeam,
      team2: historyTeam,
    }),
  ),
});

export const TypeListSchema = z.object({
  count: z.number().int(),
  types: z.array(z.string()),
  source: z.literal("database"),
});

export const RegionListSchema = z.object({
  count: z.number().int(),
  regions: z.array(z.string()),
  source: z.literal("database"),
});

export const TypeSearchSchema = z.object({
  type: z.string(),
  count: z.number().int(),
  pokemon: z.array(z.string()),
  scope: z.string(),
});

export const RegionSearchSchema = z.object({
  region: z.string(),
  count: z.number().int(),
  pokemon: z.array(z.string()),
  scope: z.string(),
});

export const TrainerSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
  }),
  session: z.object({ id: z.string(), expiresAt: z.date() }),
});

export const OwnedPokemonSchema = z.object({
  pokemon: z.object({ id: z.number().int(), name: z.string() }),
  addedAt: z.date(),
});

export const PokedexListSchema = z.object({
  count: z.number().int(),
  entries: z.array(OwnedPokemonSchema),
});

export const RemovedPokemonSchema = z.object({
  removed: z.literal(true),
  pokemonId: z.number().int(),
});
