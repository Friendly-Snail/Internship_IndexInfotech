import * as authRouter from "./auth";
import * as battlesRouter from "./battles";
import * as pokedexRouter from "./pokedex";
import * as pokemonRouter from "./pokemon";
import * as regionsRouter from "./regions";

export default {
  auth: authRouter,
  battles: battlesRouter,
  pokedex: pokedexRouter,
  pokemon: pokemonRouter,
  regions: regionsRouter,
};
