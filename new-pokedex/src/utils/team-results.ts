// these are the totals calculated for one team before choosing the winner
// score includes the project's type bonus, while totalStats and speed break ties
export type TeamTotals = { score: number; totalStats: number; speed: number };

/**
 * Compare battle scores, then base stats, then speed; keep exact matches as ties.
 *
 * @param team1 - Totals for the first team.
 * @param team2 - Totals for the second team.
 * @returns The saved team result and the comparison that decided it.
 */
export function decideTeamResult(
  team1: TeamTotals,
  team2: TeamTotals,
): {
  result: "TEAM1_WIN" | "TEAM2_WIN" | "TIE";
  decidedBy: string;
} {
  // subtract team2 from team1 so a positive difference favors team1
  // the order matters because later values only break ties in earlier values
  const comparisons = [
    { difference: team1.score - team2.score, reason: "team battle score" },
    { difference: team1.totalStats - team2.totalStats, reason: "total base stats" },
    { difference: team1.speed - team2.speed, reason: "speed" },
  ];

  for (const comparison of comparisons) {
    // return as soon as this comparison identifies a winner
    if (comparison.difference > 0) {
      return { result: "TEAM1_WIN", decidedBy: comparison.reason };
    }
    if (comparison.difference < 0) {
      return { result: "TEAM2_WIN", decidedBy: comparison.reason };
    }

    // a difference of zero moves us to the next tie breaker
  }

  // every comparison was equal, so neither team wins
  return {
    result: "TIE",
    decidedBy: "tie: equal battle score, total base stats, and speed",
  };
}
