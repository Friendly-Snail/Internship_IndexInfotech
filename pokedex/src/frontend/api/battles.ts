import { fightBodySchema } from "../../validation/fight";

export type BattleOutcome = "TEAM1_WIN" | "TEAM2_WIN" | "TIE";
export type Participant = {
  position: number;
  id: number;
  name: string;
  battleScore: number;
  totalStats: number | null;
  typeMultiplier: number | null;
};
export type BattleTeam = { score: number; pokemon: Participant[] };
export type FightResult = {
  battleId: number;
  result: BattleOutcome;
  decidedBy: string;
  team1: BattleTeam;
  team2: BattleTeam;
  note: string;
};
export type HistoryBattle = {
  id: number;
  foughtAt: number;
  result: BattleOutcome;
  decidedBy: string;
  team1: BattleTeam;
  team2: BattleTeam;
};
export type BattleHistory = { count: number; battles: HistoryBattle[] };
export type FightTeams = { team1: string[]; team2: string[] };

/** Parse comma/newline-separated identifiers using the same rules as the server. */
export function parseTeams(first: string, second: string): FightTeams {
  const split = (value: string) =>
    value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  const parsed = fightBodySchema.safeParse({ team1: split(first), team2: split(second) });
  if (!parsed.success)
    throw new Error(
      "Each team needs 1–4 Pokémon names or positive IDs, separated by commas or new lines.",
    );
  const entries = [...parsed.data.team1, ...parsed.data.team2];
  if (new Set(entries).size !== entries.length)
    throw new Error("Use a different Pokémon in every team position.");
  return parsed.data;
}

async function request<T>(url: string, signal: AbortSignal, body?: FightTeams): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([signal, AbortSignal.timeout(body ? 90000 : 30000)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      body
        ? "The battle response was interrupted. It may have been saved; refresh history before trying again."
        : "Could not load battle history. Check your connection and try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "The battle API could not complete the request.",
    );
  if (!data)
    throw new Error(
      body
        ? "The battle response could not be read. Refresh history before trying again."
        : "The history response could not be read.",
    );
  return data;
}

export const submitFight = (teams: FightTeams, signal: AbortSignal) =>
  request<FightResult>("/api/battles/fight", signal, teams);
export const getBattleHistory = (signal: AbortSignal) =>
  request<BattleHistory>("/api/battles", signal);
export const outcomeLabel = (result: BattleOutcome) =>
  result === "TIE" ? "Tie" : result === "TEAM1_WIN" ? "Team 1 wins" : "Team 2 wins";
