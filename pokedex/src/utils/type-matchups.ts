import type { Attacker, IncomingChart } from "../types/pokemon";

// try each type the attacking pokemon has and choose its strongest option
/**
 * Choose the attacker's strongest type against all defending types.
 *
 * @param attacker - Attacking types and their cached effectiveness matchups.
 * @param defendingTypes - Types of a single defending Pokemon.
 * @returns The best combined multiplier; missing matchups and an untyped attacker are neutral.
 */
export function typeMultiplierAgainstTypes(attacker: Attacker, defendingTypes: string[]): number {
  let best = 0;

  for (const attackingType of attacker.types) {
    // start at normal effectiveness for this attacking type
    let multiplier = 1;

    for (const defendingType of defendingTypes) {
      // multiply against each defending type, so a dual type can change the result twice
      // a missing matchup is neutral and contributes 1
      multiplier *= attacker.matchups[attackingType]?.[defendingType] ?? 1;
    }

    // keep the strongest result found across the attacker's types
    best = Math.max(best, multiplier);
  }

  // a pokemon without a recorded type falls back to neutral effectiveness
  return attacker.types.length === 0 ? 1 : best;
}

// check how one possible attacking type affects the pokemon we are describing
// each chart represents one of that defending pokemon's types
/**
 * Combine the defensive type charts against one attacking type.
 *
 * @param attackingType - The attack type being evaluated.
 * @param defendingCharts - One incoming-effectiveness chart per defending type.
 * @returns The combined multiplier; any immunity makes the result zero.
 */
export function incomingMultiplier(
  attackingType: string,
  defendingCharts: IncomingChart[],
): number {
  let multiplier = 1;

  for (const chart of defendingCharts) {
    const relations = chart.damage_relations;

    // immunity makes the entire result zero, even if the other type is weak to the attack
    if (relations.no_damage_from.some((entry) => entry.name === attackingType)) return 0;

    // multiply once for each defending type that is weak or resistant
    // for example, 2 times 0.5 becomes 1, while 2 times 2 becomes 4
    if (relations.double_damage_from.some((entry) => entry.name === attackingType)) multiplier *= 2;
    if (relations.half_damage_from.some((entry) => entry.name === attackingType)) multiplier *= 0.5;
  }

  return multiplier;
}

// convert type effectiveness into points for this project's simple battle rule
// the same function is used by fights and the pokemon detail examples
/**
 * Convert effectiveness into points for this project's simplified scoring rule.
 *
 * @param multiplier - The attack effectiveness multiplier.
 * @returns 100 for at least 4x, 50 for weakness, -100 for immunity, -50 for resistance, or 0 for neutral.
 */
export function battleBonus(multiplier: number): number {
  if (multiplier >= 4) return 100;
  if (multiplier > 1) return 50;
  if (multiplier === 0) return -100;
  if (multiplier < 1) return -50;
  return 0;
}
