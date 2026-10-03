import { z } from "zod";

// a pokeapi pokemon is identified by a name such as mr-mime or a positive id
// trim and lowercase names before the route looks them up
export const pokemonIdentifier = z
  .string()
  .trim()
  .toLowerCase()
  // reject empty identifiers and unusually long values before checking their shape
  .min(1, "provide a pokemon name or id")
  .max(255, "pokemon identifier is too long")
  // ^ and $ require the entire value to match, not just part of it
  // the | allows either a pokemon name on the left or a numeric id on the right
  // a name starts with a letter, then allows letters and digits
  // each optional hyphen must be followed by at least one letter or digit
  // a numeric id starts from 1 to 9, so 0 and leading zeroes are rejected
  .regex(
    /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[1-9][0-9]*)$/,
    "use a pokemon name or positive numeric id",
  )
  // names do not need a number check
  // numeric ids must fit safely in a javascript number before we use them for a database lookup
  .refine(
    (value) => !/^[0-9]+$/.test(value) || Number.isSafeInteger(Number(value)),
    "pokemon id is too large",
  );

// apply the same identifier rules to every pokemon on either team
const team = z
  .array(pokemonIdentifier)
  .min(1, "choose at least one pokemon")
  .max(4, "choose no more than four pokemon");

// each team independently contains one to four pokemon
export const fightBodySchema = z.object({ team1: team, team2: team });
