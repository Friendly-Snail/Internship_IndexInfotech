// import tables directly: table modules must not import this module or the schema barrel
import { relations } from "drizzle-orm";
import { user, session, account } from "./auth-schema";
import {
  pokemon,
  pokedex,
  battleHistory,
  battleParticipant,
  pokemonType,
  pokemonElementType,
  typeMatchup,
  pokemonEncounter,
  encounterArea,
  region,
} from "./pokemon";

// these relations describe nested ORM reads; table foreign keys enforce database integrity
// each ownership row belongs to one trainer and one Pokemon
// both parent tables expose many(pokedex), completing the v1 many-to-many path
export const pokedexRelations = relations(pokedex, ({ one }) => ({
  trainer: one(user, { fields: [pokedex.userId], references: [user.id] }),
  pokemon: one(pokemon, { fields: [pokedex.pokemonId], references: [pokemon.id] }),
}));

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
  type: one(pokemonElementType, {
    fields: [pokemonType.typeName],
    references: [pokemonElementType.name],
  }),
}));

// a type reaches its Pokemon through pokemon_type rows
// matchup roles need names because both columns reference the same type table
export const pokemonElementTypeRelations = relations(pokemonElementType, ({ many }) => ({
  pokemonTypes: many(pokemonType),
  attackingMatchups: many(typeMatchup, { relationName: "attackingType" }),
  defendingMatchups: many(typeMatchup, { relationName: "defendingType" }),
}));

export const typeMatchupRelations = relations(typeMatchup, ({ one }) => ({
  attackingType: one(pokemonElementType, {
    fields: [typeMatchup.attackingType],
    references: [pokemonElementType.name],
    relationName: "attackingType",
  }),
  defendingType: one(pokemonElementType, {
    fields: [typeMatchup.defendingType],
    references: [pokemonElementType.name],
    relationName: "defendingType",
  }),
}));

export const pokemonEncounterRelations = relations(pokemonEncounter, ({ one }) => ({
  pokemon: one(pokemon, { fields: [pokemonEncounter.pokemonId], references: [pokemon.id] }),
  area: one(encounterArea, {
    fields: [pokemonEncounter.encounterAreaId],
    references: [encounterArea.id],
  }),
}));

export const encounterAreaRelations = relations(encounterArea, ({ one, many }) => ({
  encounters: many(pokemonEncounter),
  region: one(region, {
    fields: [encounterArea.regionName],
    references: [region.name],
  }),
}));

export const regionRelations = relations(region, ({ many }) => ({
  encounterAreas: many(encounterArea),
}));

// define the full application view explicitly instead of calling generated relation internals
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  pokedexEntries: many(pokedex),
}));
