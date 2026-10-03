import { describe, expect, test } from "bun:test";
import { decideTeamResult } from "../src/utils/team-results";
import { formatUtcDate } from "../src/utils/utc";

describe("team winner selection", () => {
  test("battle score decides before stats or speed", () => {
    expect(
      decideTeamResult(
        { score: 620, totalStats: 200, speed: 20 },
        { score: 600, totalStats: 700, speed: 100 },
      ),
    ).toEqual({ result: "TEAM1_WIN", decidedBy: "team battle score" });
  });

  test("stats and then speed break equal-score ties", () => {
    expect(
      decideTeamResult(
        { score: 600, totalStats: 500, speed: 90 },
        { score: 600, totalStats: 510, speed: 40 },
      ),
    ).toEqual({ result: "TEAM2_WIN", decidedBy: "total base stats" });
    expect(
      decideTeamResult(
        { score: 600, totalStats: 500, speed: 90 },
        { score: 600, totalStats: 500, speed: 40 },
      ),
    ).toEqual({ result: "TEAM1_WIN", decidedBy: "speed" });
  });

  test("equal totals remain a tie", () => {
    expect(
      decideTeamResult(
        { score: 600, totalStats: 500, speed: 90 },
        { score: 600, totalStats: 500, speed: 90 },
      ).result,
    ).toBe("TIE");
  });
});

test("history dates use utc at both sides of a local midnight", () => {
  expect(formatUtcDate(new Date("2026-09-29T23:30:00-04:00"))).toBe("2026-09-30");
  expect(formatUtcDate(new Date("2026-09-29T00:30:00+09:00"))).toBe("2026-09-28");
});
