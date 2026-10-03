// pokeapi's type chart tells us which defending types receive double, half, or zero damage
// this describes the api response before its values are saved as matchup rows
export type TypeRelations = {
  doubleDamageTo: string[];
  halfDamageTo: string[];
  noDamageTo: string[];
};

// public response keys retain PokeAPI stat names
export type PokemonStats = {
  hp: number;
  attack: number;
  defense: number;
  "special-attack": number;
  "special-defense": number;
  speed: number;
};

// assemble the battle data from stat, pokemon type, and matchup rows
export type CachedPokemon = {
  id: number;
  name: string;
  stats: PokemonStats;
  types: string[];
  matchups: Record<string, Record<string, number>>;
};

// these types describe only the parts of pokeapi responses that this program actually uses
export type NamedResource = { name: string; url: string };
export type ApiPokemon = {
  id: number;
  name: string;
  stats: { base_stat: number; stat: NamedResource }[];
  types: { slot: number; type: NamedResource }[];
};
export type ApiType = {
  damage_relations: {
    double_damage_to: NamedResource[];
    half_damage_to: NamedResource[];
    no_damage_to: NamedResource[];
    double_damage_from: NamedResource[];
    half_damage_from: NamedResource[];
    no_damage_from: NamedResource[];
  };
  name: string;
};
export type NamedResourceList = { results: NamedResource[]; next: string | null };
// this is the calculated information we keep for one pokemon during a fight
// totalStats is the sum of its base stats, typeMultiplier describes the matchup, and score combines those intothelearning-project battle rule
export type BattleScore = { totalStats: number; typeMultiplier: number; score: number };

export type ApiEncounter = { location_area: NamedResource };
export type ApiArea = { id: number; name: string; location: NamedResource };
export type ApiLocation = { name: string; region: NamedResource | null };

// the attacker has one or more types and a lookup of saved type matchups
// the first key is the attacking type and the second key is the defending type
export type Attacker = {
  types: string[];
  matchups: Record<string, Record<string, number>>;
};

// these are the incoming damage relationships returned by pokeapi for a type
// for example, double_damage_from lists types that are strong against it
export type IncomingChart = {
  damage_relations: {
    double_damage_from: { name: string }[];
    half_damage_from: { name: string }[];
    no_damage_from: { name: string }[];
  };
};
