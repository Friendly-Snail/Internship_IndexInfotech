import * as auth from "./auth";
import * as battles from "./battles";
import { discovery } from "./discovery";
import * as pokedex from "./pokedex";
import * as pokemon from "./pokemon";
import * as regions from "./regions";
import * as types from "./types";

export default {
  discovery,
  auth: { me: auth.me },
  pokedex: { list: pokedex.list, add: pokedex.add, remove: pokedex.remove },
  battles: { fight: battles.fight, list: battles.list },
  pokemon: { get: pokemon.get, regions: pokemon.regions },
  types: { list: types.list, search: types.search },
  regions: { list: regions.list, search: regions.search },
};
