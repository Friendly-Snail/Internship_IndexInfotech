import type { BattleScore, CachedPokemon } from "../types/pokemon";
import { battleBonus, typeMultiplierAgainstTypes } from "./type-matchups";

/**
 * Score every member against all opponents, allowing different team sizes.
 *
 * @param team1 - The nonempty first team.
 * @param team2 - The nonempty second team.
 * @returns Scores in team order; bonuses are averaged and rounded, and reported multipliers use two decimals.
 * @throws If either team is empty.
 */
export function scoreTeams(
  team1: CachedPokemon[],
  team2: CachedPokemon[],
): {
  team1: BattleScore[];
  team2: BattleScore[];
} {
  if (team1.length === 0 || team2.length === 0) {
    throw new Error("Both teams must contain at least one Pokemon.");
  }

  /**
   * Add the rounded average opponent bonus to one Pokemon's total base stats.
   *
   * @param attacker - The Pokemon being scored.
   * @param opponents - The nonempty opposing team.
   * @returns Base-stat total, integer battle score, and average multiplier rounded to two decimals.
   */
  function scoreMember(attacker: CachedPokemon, opponents: CachedPokemon[]): BattleScore {
    const totalStats = Object.values(attacker.stats).reduce((sum, value) => sum + value, 0);
    let bonusTotal = 0;
    let multiplierTotal = 0;
    for (const defender of opponents) {
      const multiplier = typeMultiplierAgainstTypes(attacker, defender.types);
      bonusTotal += battleBonus(multiplier);
      multiplierTotal += multiplier;
    }
    return {
      totalStats,
      score: totalStats + Math.round(bonusTotal / opponents.length),
      typeMultiplier: Math.round((multiplierTotal / opponents.length) * 100) / 100,
    };
  }

  return {
    team1: team1.map((member) => scoreMember(member, team2)),
    team2: team2.map((member) => scoreMember(member, team1)),
  };
}
