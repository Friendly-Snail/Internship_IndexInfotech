// describe how the typescript objects map to actual postgresql tables
// drizzle uses these definitions both for type-safe queries in the app and for generating database migrations
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  varchar,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// pokeapi's type chart tells us which defending types receive double, half, or zero damage
// this describes the api response before its values are saved as matchup rows
export type TypeRelations = {
  doubleDamageTo: string[];
  halfDamageTo: string[];
  noDamageTo: string[];
};

// Record<string, number> means "an object whose property names are strings and whose values are numbers"
// in practice this holds keys such as hp, attack, defense, special-attack, special-defense, and speed
export type PokemonStats = Record<string, number>;

// the pokemon table is the local cache of data originally retrieved from pokeapi
// one row represents one pokemon and lets repeated fights use postgresql instead of making the same external api requests again
export const pokemon = pgTable("pokemon", {
  // we deliberately reuse the pokeapi pokemon id instead of generating our own id
  // primaryKey means every row must have a unique id and gives other tables a stable value they can reference
  id: integer("id").primaryKey(), // pokeapi pokemon id: stable external identifier
  // varchar stores text, notNull makes the value required, and unique prevents duplicate pokemon names
  name: varchar("name", { length: 255 }).notNull().unique(),
  // postgres automatically records when the pokemon was first cached
  // withTimezone keeps the timestamp unambiguous across machines in different time zones
  cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow().notNull(),
  // null means we have not checked pokeapi encounter locations for this pokemon yet
  regionsCachedAt: timestamp("regions_cached_at", { withTimezone: true }),
});

// each stat has its own row so we can compare hp, speed, and other stats in sql
// the pair of pokemon id and stat name is the primary key because each pokemon has one value per stat
export const pokemonStat = pgTable(
  "pokemon_stat",
  {
    pokemonId: integer("pokemon_id")
      .notNull()
      .references(() => pokemon.id),
    statName: varchar("stat_name", { length: 100 }).notNull(),
    baseStat: integer("base_stat").notNull(),
  },
  (table) => [primaryKey({ columns: [table.pokemonId, table.statName] })],
);

// one row per distinct pokemon type, shared by pokemon and matchup rows
export const pokemonElementType = pgTable("pokemon_element_type", {
  name: varchar("name", { length: 100 }).primaryKey(),
});

// one pokemon can have multiple types and one type can belong to multiple pokemon
// pokemon_type is the join table for that many-to-many relationship
// slot keeps pokeapi's order for a pokemon's first and second types
export const pokemonType = pgTable(
  "pokemon_type",
  {
    pokemonId: integer("pokemon_id")
      .notNull()
      .references(() => pokemon.id),
    typeName: varchar("type_name", { length: 100 })
      .notNull()
      .references(() => pokemonElementType.name),
    slot: integer("slot").notNull(),
  },
  (table) => [
    // one pokemon cannot repeat the same type or place two types in the same slot
    // the type name index helps searches such as search-by-type
    primaryKey({ columns: [table.pokemonId, table.typeName] }),
    unique("pokemon_type_slot_unique").on(table.pokemonId, table.slot),
    index("pokemon_type_name_idx").on(table.typeName),
  ],
);

// one row describes the attacking type against one defending type
// neutral pairs use 1, resistance uses 0.5, weakness uses 2, and immunity uses 0
// the ordered pair is the key because fire attacking water differs from water attacking fire
export const typeMatchup = pgTable(
  "type_matchup",
  {
    attackingType: varchar("attacking_type", { length: 100 })
      .notNull()
      .references(() => pokemonElementType.name),
    defendingType: varchar("defending_type", { length: 100 })
      .notNull()
      .references(() => pokemonElementType.name),
    // numeric keeps two decimal places in postgres and mode number reads it as a javascript number
    multiplier: numeric("multiplier", { precision: 5, scale: 2, mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.attackingType, table.defendingType] })],
);

// a region groups encounter locations, and the same pokemon may appear in several regions
// a region means the region of a recorded wild encounter, not a species' generation
export const region = pgTable("region", {
  name: varchar("name", { length: 100 }).primaryKey(),
});

// pokeapi's encounter area id gives each area a stable key across pokemon lookups
// each area belongs to a location, which in turn belongs to a region
export const encounterArea = pgTable(
  "encounter_area",
  {
    id: integer("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    locationName: varchar("location_name", { length: 255 }).notNull(),
    regionName: varchar("region_name", { length: 100 })
      .notNull()
      .references(() => region.name),
  },
  (table) => [index("encounter_area_region_idx").on(table.regionName)],
);

// one row says a pokemon can be encountered in one area
// the pair of ids prevents duplicate links while letting both sides have many matches
export const pokemonEncounter = pgTable(
  "pokemon_encounter",
  {
    pokemonId: integer("pokemon_id")
      .notNull()
      .references(() => pokemon.id),
    areaId: integer("area_id")
      .notNull()
      .references(() => encounterArea.id),
  },
  (table) => [
    primaryKey({ columns: [table.pokemonId, table.areaId] }),
    index("pokemon_encounter_area_idx").on(table.areaId),
  ],
);

// a postgres enum restricts the result column to the listed legal values
// this prevents arbitrary strings from accidentally being saved as battle results
// keep the old values so earlier one-on-one history can still be read during this migration
export const battleResult = pgEnum("battle_result", [
  "POKEMON1_WIN",
  "POKEMON2_WIN",
  "TIE",
  "TEAM1_WIN",
  "TEAM2_WIN",
]);

// battle_history is persistent history rather than a cache
// every completed /fight request inserts one row here so /battles can retrieve past results later
export const battleHistory = pgTable(
  "battle_history",
  {
    // unlike pokemon ids, battle ids do not come from pokeapi, so postgres generates them automatically
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // these are foreign keys: the integer stored here must refer to a real id in the pokemon table
    // these foreign keys connect older battles directly to their two pokemon
    // these older fields stay nullable so original one-on-one battles can still be displayed
    pokemon1Id: integer("pokemon1_id").references(() => pokemon.id),
    pokemon2Id: integer("pokemon2_id").references(() => pokemon.id),
    // result uses the enum above, while decidedBy records which comparison actually settled the fight
    result: battleResult("result").notNull(),
    decidedBy: varchar("decided_by", { length: 100 }).notNull(),
    // saving the calculated scores preserves what the result looked like at fight time
    // this is useful because history does not need to recalculate every old battle whenever it is requested
    pokemon1Score: integer("pokemon1_score"),
    pokemon2Score: integer("pokemon2_score"),
    // new battles store the sum of each team's participant scores
    team1Score: integer("team1_score"),
    team2Score: integer("team2_score"),
    // older one-on-one rows keep their multipliers here as decimal values
    pokemon1Multiplier: numeric("pokemon1_multiplier", { precision: 5, scale: 2, mode: "number" }),
    pokemon2Multiplier: numeric("pokemon2_multiplier", { precision: 5, scale: 2, mode: "number" }),
    // postgres records an absolute instant and the api formats it as a utc date
    foughtAt: timestamp("fought_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // indexes are extra database structures that help postgres find/sort commonly queried values faster
    // they cost some storage and insert/update work, so we add them to fields that are useful for battle-history lookups
    index("battle_history_fought_at_idx").on(table.foughtAt),
    index("battle_history_pokemon1_idx").on(table.pokemon1Id),
    index("battle_history_pokemon2_idx").on(table.pokemon2Id),
  ],
);

// one row per pokemon in a fight, so teams can have one to four members without adding more battle columns
// a new team battle has one parent history row and two to eight participant rows
export const battleParticipant = pgTable(
  "battle_participant",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    battleId: integer("battle_id")
      .notNull()
      .references(() => battleHistory.id),
    pokemonId: integer("pokemon_id")
      .notNull()
      .references(() => pokemon.id),
    // team number is 1 or 2 and position pairs opponents across the two teams
    teamNumber: integer("team_number").notNull(),
    position: integer("position").notNull(),
    // save each pokemon's contribution so history can show the original calculation
    battleScore: integer("battle_score").notNull(),
    totalStats: integer("total_stats").notNull(),
    speed: integer("speed").notNull(),
    typeMultiplier: numeric("type_multiplier", {
      precision: 5,
      scale: 2,
      mode: "number",
    }).notNull(),
  },
  (table) => [
    // one pokemon fills each team slot in a battle
    // database checks protect the team and position limits even outside the api route
    unique("battle_participant_slot_unique").on(table.battleId, table.teamNumber, table.position),
    check("battle_participant_team_check", sql`${table.teamNumber} IN (1, 2)`),
    check("battle_participant_position_check", sql`${table.position} BETWEEN 1 AND 4`),
    index("battle_participant_battle_idx").on(table.battleId),
  ],
);

// these drizzle relations describe the same connections as the foreign keys in a way drizzle can understand at the object/query level
// foreign keys enforce valid ids in postgres while relations help drizzle navigate linked rows
// one pokemon can appear in many battles as pokemon1 and in many other battles as pokemon2
// the relation names matter because both relationships point between the same two tables and would otherwise be ambiguous
export const pokemonRelations = relations(pokemon, ({ many }) => ({
  battlesAsPokemon1: many(battleHistory, { relationName: "firstPokemon" }),
  battlesAsPokemon2: many(battleHistory, { relationName: "secondPokemon" }),
  battleParticipants: many(battleParticipant),
}));

// original battles may have pokemon1 and pokemon2, while new ones use participant rows
// fields says which foreign-key column we have and references says which pokemon primary key it points to
export const battleHistoryRelations = relations(battleHistory, ({ one, many }) => ({
  pokemon1: one(pokemon, {
    fields: [battleHistory.pokemon1Id],
    references: [pokemon.id],
    relationName: "firstPokemon",
  }),
  pokemon2: one(pokemon, {
    fields: [battleHistory.pokemon2Id],
    references: [pokemon.id],
    relationName: "secondPokemon",
  }),
  participants: many(battleParticipant),
}));

// each participant belongs to one battle and one cached pokemon
export const battleParticipantRelations = relations(battleParticipant, ({ one }) => ({
  battle: one(battleHistory, {
    fields: [battleParticipant.battleId],
    references: [battleHistory.id],
  }),
  pokemon: one(pokemon, {
    fields: [battleParticipant.pokemonId],
    references: [pokemon.id],
  }),
}));
