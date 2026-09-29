// these are the totals calculated for one team before choosing the winner
// score includes the project's type bonus, while totalStats and speed break ties
export type TeamTotals = { score: number; totalStats: number; speed: number };

// 1 and 2 identify the winning team, while 0 means an exact tie
export type TeamWinner = 0 | 1 | 2;

// compare the same three totals in priority order and keep the first that differs
export function decideTeamResult(
  team1: TeamTotals,
  team2: TeamTotals,
): {
  winner: TeamWinner;
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
      return { winner: 1, result: "TEAM1_WIN", decidedBy: comparison.reason };
    }
    if (comparison.difference < 0) {
      return { winner: 2, result: "TEAM2_WIN", decidedBy: comparison.reason };
    }

    // a difference of zero moves us to the next tie breaker
  }

  // every comparison was equal, so neither team wins
  return {
    winner: 0,
    result: "TIE",
    decidedBy: "tie: equal battle score, total base stats, and speed",
  };
}
