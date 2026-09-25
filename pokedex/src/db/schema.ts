// describe how our typescript objects map to actual postgresql tables
// drizzle uses these definitions both for type-safe queries in the app and for generating database migrations
import { relations } from "drizzle-orm";
import { integer, jsonb, pgEnum, pgTable, timestamp, varchar, index } from "drizzle-orm/pg-core";

// pokeapi's type chart tells us which defending types receive double, half, or zero damage
// we save these arrays as json so a cached pokemon can be used in later fights without fetching its type chart again
export type TypeRelations = {
    doubleDamageTo: string[];
    halfDamageTo: string[];
    noDamageTo: string[];
};

// Record<string, number> means "an object whose property names are strings and whose values are numbers"
// in practice this holds keys such as hp, attack, defense, special-attack, special-defense, and speed
export type PokemonStats = Record<string, number>;

// the pokemon table is our local cache of data originally retrieved from pokeapi
// one row represents one pokemon and lets repeated fights use postgresql instead of making the same external api requests again
export const pokemon = pgTable("pokemon", {
    // we deliberately reuse the pokeapi pokemon id instead of generating our own id
    // primaryKey means every row must have a unique id and gives other tables a stable value they can reference
    id: integer("id").primaryKey(), // pokeapi pokemon id: stable external identifier
    // varchar stores text, notNull makes the value required, and unique prevents duplicate pokemon names
    name: varchar("name", { length: 255 }).notNull().unique(),
    // jsonb lets postgres store structured json instead of forcing every individual stat into its own column
    // $type tells typescript what shape we expect that json to have when drizzle reads or writes it
    stats: jsonb("stats").$type<PokemonStats>().notNull(),
    // types is naturally a small array such as ["water"] or ["grass", "poison"], so jsonb fits it well
    types: jsonb("types").$type<string[]>().notNull(),
    // this stores the type-effectiveness data used by server.ts to calculate a matchup without another pokeapi request
    typeRelations: jsonb("type_relations").$type<Record<string, TypeRelations>>().notNull(),
    // postgres automatically records when the pokemon was first cached
    // withTimezone keeps the timestamp unambiguous across machines in different time zones
    cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow().notNull()
});

// a postgres enum restricts the result column to these three legal values
// this prevents arbitrary strings from accidentally being saved as battle results
export const battleResult = pgEnum("battle_result", ["POKEMON1_WIN", "POKEMON2_WIN", "TIE"]);

// battle_history is persistent history rather than a cache
// every completed /fight request inserts one row here so /battles can retrieve past results later
export const battleHistory = pgTable("battle_history", {
    // unlike pokemon ids, battle ids do not come from pokeapi, so postgres generates them automatically
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // these are foreign keys: the integer stored here must refer to a real id in the pokemon table
    // foreign keys connect the battle to its participants and help protect the database from invalid references
    pokemon1Id: integer("pokemon1_id").notNull().references(() => pokemon.id),
    pokemon2Id: integer("pokemon2_id").notNull().references(() => pokemon.id),
    // result uses the enum above, while decidedBy records which comparison actually settled the fight
    result: battleResult("result").notNull(),
    decidedBy: varchar("decided_by", { length: 100 }).notNull(),
    // saving the calculated scores preserves what the result looked like at fight time
    // this is useful because history does not need to recalculate every old battle whenever it is requested
    pokemon1Score: integer("pokemon1_score").notNull(),
    pokemon2Score: integer("pokemon2_score").notNull(),
    // multipliers are scaled by 100 before storage, so 2x is 200 and 0.5x is 50
    // server.ts divides these values by 100 when returning battle history
    pokemon1Multiplier: integer("pokemon1_multiplier").notNull(), // multiplier times 100
    pokemon2Multiplier: integer("pokemon2_multiplier").notNull(),
    // postgres records when the battle row is created so history can be sorted chronologically
    foughtAt: timestamp("fought_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
    // indexes are extra database structures that help postgres find/sort commonly queried values faster
    // they cost some storage and insert/update work, so we add them to fields that are useful for battle-history lookups
    index("battle_history_fought_at_idx").on(table.foughtAt),
    index("battle_history_pokemon1_idx").on(table.pokemon1Id),
    index("battle_history_pokemon2_idx").on(table.pokemon2Id)
]);

// these drizzle relations describe the same connections as the foreign keys in a way drizzle can understand at the object/query level
// one pokemon can appear in many battles as pokemon1 and in many other battles as pokemon2
// the relation names matter because both relationships point between the same two tables and would otherwise be ambiguous
export const pokemonRelations = relations(pokemon, ({ many }) => ({
    battlesAsPokemon1: many(battleHistory, { relationName: "firstPokemon" }),
    battlesAsPokemon2: many(battleHistory, { relationName: "secondPokemon" })
}));

// from the opposite direction, each individual battle has exactly one pokemon1 row and one pokemon2 row
// fields says which foreign-key column we have and references says which pokemon primary key it points to
export const battleHistoryRelations = relations(battleHistory, ({ one }) => ({
    pokemon1: one(pokemon, { fields: [battleHistory.pokemon1Id], references: [pokemon.id], relationName: "firstPokemon" }),
    pokemon2: one(pokemon, { fields: [battleHistory.pokemon2Id], references: [pokemon.id], relationName: "secondPokemon" })
}));
