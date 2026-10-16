// import tables directly: table modules must not import this module or the schema barrel
import { defineRelations } from "drizzle-orm";
import { user, session, account, verification } from "./auth-schema";
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
  resourceListCache,
} from "./pokemon";

const schema = {
  user,
  session,
  account,
  verification,
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
  resourceListCache,
};

// these relations describe nested ORM reads; table foreign keys enforce database integrity
export const relations = defineRelations(schema, (r) => ({
  // each ownership row belongs to one trainer and one Pokemon
  // both parent tables expose many(pokedex), completing the many-to-many path
  pokedex: {
    trainer: r.one.user({ from: r.pokedex.userId, to: r.user.id, optional: false }),
    pokemon: r.one.pokemon({ from: r.pokedex.pokemonId, to: r.pokemon.id, optional: false }),
  },

  // a pokemon reaches its battles through participant rows
  pokemon: {
    pokedexEntries: r.many.pokedex(),
    battleParticipants: r.many.battleParticipant(),
    types: r.many.pokemonType(),
    encounters: r.many.pokemonEncounter(),
  },

  battleHistory: {
    participants: r.many.battleParticipant(),
  },

  // each participant belongs to one battle and one cached pokemon
  battleParticipant: {
    battle: r.one.battleHistory({
      from: r.battleParticipant.battleId,
      to: r.battleHistory.id,
      optional: false,
    }),
    pokemon: r.one.pokemon({
      from: r.battleParticipant.pokemonId,
      to: r.pokemon.id,
      optional: false,
    }),
  },

  // these orm relations enable nested reads; existing foreign keys enforce integrity
  pokemonType: {
    pokemon: r.one.pokemon({ from: r.pokemonType.pokemonId, to: r.pokemon.id, optional: false }),
    type: r.one.pokemonElementType({
      from: r.pokemonType.typeName,
      to: r.pokemonElementType.name,
      optional: false,
    }),
  },

  // a type reaches its Pokemon through pokemon_type rows
  // matchup roles need aliases because both columns reference the same type table
  pokemonElementType: {
    pokemonTypes: r.many.pokemonType(),
    attackingMatchups: r.many.typeMatchup({ alias: "attacking_type" }),
    defendingMatchups: r.many.typeMatchup({ alias: "defending_type" }),
  },

  typeMatchup: {
    attacker: r.one.pokemonElementType({
      from: r.typeMatchup.attackingType,
      to: r.pokemonElementType.name,
      alias: "attacking_type",
      optional: false,
    }),
    defender: r.one.pokemonElementType({
      from: r.typeMatchup.defendingType,
      to: r.pokemonElementType.name,
      alias: "defending_type",
      optional: false,
    }),
  },

  pokemonEncounter: {
    pokemon: r.one.pokemon({ from: r.pokemonEncounter.pokemonId, to: r.pokemon.id, optional: false }),
    area: r.one.encounterArea({
      from: r.pokemonEncounter.encounterAreaId,
      to: r.encounterArea.id,
      optional: false,
    }),
  },

  encounterArea: {
    encounters: r.many.pokemonEncounter(),
    region: r.one.region({
      from: r.encounterArea.regionName,
      to: r.region.name,
      optional: false,
    }),
  },

  region: {
    encounterAreas: r.many.encounterArea(),
  },

  // define the full application view explicitly instead of calling generated relation internals
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
    pokedexEntries: r.many.pokedex(),
  },

  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
      optional: false,
    }),
  },

  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
      optional: false,
    }),
  },
}));
