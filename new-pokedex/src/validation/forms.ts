import { z } from "zod";
import { fightBodySchema, pokemonIdentifier } from "#/validation/fight";

// the Pokémon lookup and the Pokedex add form take one identifier
export const pokemonSearchForm = z.object({ identifier: pokemonIdentifier });
export const pokedexAddForm = z.object({ pokemon: pokemonIdentifier });

// teams are typed as comma/newline-separated text, then checked with the server's rules
const teamText = z.string().transform((value) =>
  value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean),
);

export const battleForm = z
  .object({
    team1: teamText.pipe(fightBodySchema.shape.team1),
    team2: teamText.pipe(fightBodySchema.shape.team2),
  })
  // no Pokémon may appear twice, within a team or across both
  .refine(
    ({ team1, team2 }) => new Set([...team1, ...team2]).size === team1.length + team2.length,
    "Use a different Pokémon in every team position.",
  );

const email = z.string().trim().pipe(z.email("Enter a valid email address."));

// signing up also needs a trainer name and a longer password
export const accountForm = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("login"),
    name: z.string(),
    email,
    password: z.string().min(1, "Enter your password."),
  }),
  z.object({
    mode: z.literal("signup"),
    name: z.string().trim().min(1, "Enter your trainer name."),
    email,
    password: z.string().min(8, "Use a password with at least 8 characters."),
  }),
]);
