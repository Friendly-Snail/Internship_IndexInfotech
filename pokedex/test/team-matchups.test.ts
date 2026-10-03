import { expect, test } from "bun:test";
import { scoreTeams } from "../src/utils/team-matchups";
import { decideTeamResult } from "../src/utils/team-results";
import type { CachedPokemon } from "../src/types/pokemon";

const member: CachedPokemon = {
  id: 1,
  name: "example",
  types: ["normal"],
  matchups: {},
  stats: {
    hp: 10,
    attack: 10,
    defense: 10,
    "special-attack": 10,
    "special-defense": 10,
    speed: 10,
  },
};

for (const [left, right] of [
  [1, 1],
  [1, 3],
  [2, 4],
  [3, 1],
  [4, 2],
  [2, 2],
]) {
  test(`scores every member in ${left}v${right}`, () => {
    const result = scoreTeams(Array(left).fill(member), Array(right).fill(member));
    expect(result.team1).toHaveLength(left);
    expect(result.team2).toHaveLength(right);
    expect(result.team1.every((score) => score.score === 60)).toBe(true);
    expect(result.team2.every((score) => score.score === 60)).toBe(true);
    /**
     * Build equal-stat team totals for a fixture with identical members.
     *
     * @param count - Number of fixture Pokemon in the team.
     * @returns Score, base-stat, and speed totals for the fixture team.
     */
    const totals = (count: number) => ({
      score: count * 60,
      totalStats: count * 60,
      speed: count * 10,
    });
    expect(decideTeamResult(totals(left), totals(right)).result).toBe(
      left === right ? "TIE" : left > right ? "TEAM1_WIN" : "TEAM2_WIN",
    );
  });
}

test("averages each opponent's bonus rather than applying the bonus to average effectiveness", () => {
  const attacker = {
    ...member,
    types: ["fire"],
    matchups: { fire: { grass: 2, water: 0.5, ghost: 0 } },
  };
  const opponents = ["grass", "water", "ghost"].map((type) => ({ ...member, types: [type] }));
  const result = scoreTeams([attacker], opponents);
  expect(result.team1[0].score).toBe(27); // 60 + round((50 - 50 - 100) / 3)
  expect(result.team1[0].typeMultiplier).toBe(0.83);
  expect(scoreTeams([attacker], opponents.toReversed()).team1).toEqual(result.team1);
});

test("rejects either empty team", () => {
  expect(() => scoreTeams([], [member])).toThrow();
  expect(() => scoreTeams([member], [])).toThrow();
});
