// describe how the typescript objects map to actual postgresql tables
// drizzle uses these definitions both for type-safe queries in the app and for generating database migrations
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";
import {
  check,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  text,
  unique,
  varchar,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// the pokemon table is the local cache of data originally retrieved from pokeapi
// one row represents one pokemon and lets repeated fights use postgresql instead of making the same external api requests again
export const pokemon = pgTable("pokemon", {
  // we deliberately reuse the pokeapi pokemon id instead of generating our own id
  // primaryKey means every row must have a unique id and gives other tables a stable value they can reference
  ///TODO `id` isn't actually needed for primaryKey because `name` is already unique
  id: integer("id").primaryKey(), // pokeapi pokemon id: stable external identifier
  // varchar stores text, notNull makes the value required, and unique prevents duplicate pokemon names
  name: varchar("name", { length: 255 }).notNull().unique(),
  // all Pokemon share these six fixed base stats
  hp: integer("hp").notNull(),
  attack: integer("attack").notNull(),
  defense: integer("defense").notNull(),
  specialAttack: integer("special_attack").notNull(),
  specialDefense: integer("special_defense").notNull(),
  speed: integer("speed").notNull(),
  // postgres automatically records when the pokemon was first cached
  // withTimezone keeps the timestamp unambiguous across machines in different time zones
  cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow().notNull(),
  // null means we have not checked pokeapi encounter locations for this pokemon yet
  regionsCachedAt: timestamp("regions_cached_at", { withTimezone: true }),
});

// one entry per trainer and Pokemon species; this is ownership, not another Pokemon cache
export const pokedex = pgTable(
  "pokedex",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pokemonId: integer("pokemon_id")
      .notNull()
      .references(() => pokemon.id),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.pokemonId] }),
    index("pokedex_pokemon_id_idx").on(table.pokemonId),
  ],
);

export const pokedexRelations = relations(pokedex, ({ one }) => ({
  trainer: one(user, { fields: [pokedex.userId], references: [user.id] }),
  pokemon: one(pokemon, { fields: [pokedex.pokemonId], references: [pokemon.id] }),
}));

// one row per distinct pokemon type, shared by pokemon and matchup rows
export const pokemonElementType = pgTable("pokemon_element_type", { ///
  name: varchar("name", { length: 100 }).primaryKey(),
});

// a populated type/region table may still be partial. this row is written only
// after every page of that resource list has been fetched and stored
export const resourceListCache = pgTable(
  "resource_list_cache",
  {
    resource: varchar("resource", { length: 100 }).primaryKey(),
    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("resource_list_cache_resource_check", sql`${table.resource} IN ('type', 'region')`),
  ],
);

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

// every result identifies a winning team, including teams of one
export const battleResult = pgEnum("battle_result", ["TIE", "TEAM1_WIN", "TEAM2_WIN"]);

// battle_history is persistent history rather than a cache
// every completed /fight request inserts one row here so /battles can retrieve past results later
export const battleHistory = pgTable(
  "battle_history",
  {
    // unlike pokemon ids, battle ids do not come from pokeapi, so postgres generates them automatically
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // result uses the enum above, while decidedBy records which comparison actually settled the fight
    result: battleResult("result").notNull(),
    decidedBy: varchar("decided_by", { length: 100 }).notNull(),
    // Persist each team's score so old results do not need recalculation.
    team1Score: integer("team1_score").notNull(),
    team2Score: integer("team2_score").notNull(),
    // postgres records an absolute instant and the api formats it as a utc date
    foughtAt: timestamp("fought_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // indexes are extra database structures that help postgres find/sort commonly queried values faster
    // they cost some storage and insert/update work, so we add them to fields that are useful for battle-history lookups
    index("battle_history_fought_at_idx").on(table.foughtAt),
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
    // team number identifies the side; position preserves the member order within that team
    teamNumber: integer("team_number").notNull(),
    position: integer("position").notNull(),
    // save each pokemon's contribution so history can show the original calculation
    battleScore: integer("battle_score").notNull(),
    // historical tie-break inputs stay unchanged when cached pokemon stats change
    // NULL means the original single-Pokemon record did not save this snapshot.
    totalStats: integer("total_stats"),
    speed: integer("speed"),
    typeMultiplier: numeric("type_multiplier", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
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

// a pokemon reaches its battles through participant rows
export const pokemonRelations = relations(pokemon, ({ many }) => ({
  pokedexEntries: many(pokedex),
  battleParticipants: many(battleParticipant),
  types: many(pokemonType),
  encounters: many(pokemonEncounter),
}));

export const battleHistoryRelations = relations(battleHistory, ({ many }) => ({
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

// these orm relations enable nested reads; existing foreign keys enforce integrity
export const pokemonTypeRelations = relations(pokemonType, ({ one }) => ({
  pokemon: one(pokemon, { fields: [pokemonType.pokemonId], references: [pokemon.id] }),
}));

export const pokemonEncounterRelations = relations(pokemonEncounter, ({ one }) => ({
  pokemon: one(pokemon, { fields: [pokemonEncounter.pokemonId], references: [pokemon.id] }),
  area: one(encounterArea, { fields: [pokemonEncounter.areaId], references: [encounterArea.id] }),
}));

export const encounterAreaRelations = relations(encounterArea, ({ many }) => ({
  encounters: many(pokemonEncounter),
}));

// re-export auth tables so Drizzle migrations and the database include them
export * from "./auth-schema";
