import { z } from 'zod'

export const TodoSchema = z.object({
  id: z.number().int().min(1),
  name: z.string(),
})

// Kept free of server imports so routes can validate in the browser.
export const pokemonIdentifier = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Provide a pokemon name or id")
  .max(255, "Pokemon identifier is too long")
  .regex(
    /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[1-9][0-9]*)$/,
    "Use a pokemon name or positive numeric id",
  )
  .refine(
    (value) => !/^[0-9]+$/.test(value) || Number.isSafeInteger(Number(value)),
    "Pokemon id is too large",
  );

const team = z
  .array(z.object({ pokemonIdentifier }))
  .min(1, "choose at least one pokemon")
  .max(4, "choose no more than four pokemon");

export const fightBodySchema = z.object({ team1: team, team2: team });
