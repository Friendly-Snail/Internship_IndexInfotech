import { ORPCError } from "@orpc/server";
import { db } from "#/db";
import { battleHistory, battleParticipant } from "#/db/schema/pokemon";
import { BattleHistorySchema, FightResultSchema } from "#/orpc/schema";
import type { BattleScore, CachedPokemon } from "#/types/pokemon";
import { scoreTeams } from "#/utils/team-matchups";
import { decideTeamResult, type TeamTotals } from "#/utils/team-results";
import { toUnixSeconds } from "#/utils/timestamps";
import { fightBodySchema } from "#/validation/fight";
import { pokemonService, publicProcedure } from "../base";

// database rows contain extra cached information that an api caller does not necessarily need
// this helper creates the smaller, cleaner pokemon object that we want to expose in a fight response
/**
 * Build the public battle response for one participant.
 *
 * @param entry - Cached Pokemon identity and types.
 * @param battle - Calculated stats, effectiveness, and battle score.
 * @param result - Outcome inherited from the participant's team.
 * @returns The participant fields exposed in the fight response.
 */
function displayPokemon(entry: CachedPokemon, battle: BattleScore, result: "WIN" | "LOSE" | "TIE") {
  return {
    id: entry.id,
    name: entry.name,
    result,
    types: entry.types,
    totalStats: battle.totalStats,
    typeMultiplier: battle.typeMultiplier,
    battleScore: battle.score,
  };
}

/**
 * Sum a team's battle scores, base stats, and speeds for winner selection.
 *
 * @param team - Pokemon in team order.
 * @param scores - Calculated scores in the same order as the team.
 * @returns Team totals used for scoring and tie breakers.
 */
function summarizeTeam(team: CachedPokemon[], scores: BattleScore[]): TeamTotals {
  return {
    score: scores.reduce((sum, battle) => sum + battle.score, 0),
    totalStats: scores.reduce((sum, battle) => sum + battle.totalStats, 0),
    speed: team.reduce((sum, entry) => sum + entry.stats.speed, 0),
  };
}

// POST /api/battles/fight accepts two teams with one to four pokemon per team
// client request -> orpc -> postgresql cache -> pokeapi if needed -> battle calculation -> database insert -> response
export const fight = publicProcedure
  .route({
    method: "POST",
    path: "/battles/fight",
    tags: ["Battles"],
    summary: "Run and save a team battle",
  })
  .input(fightBodySchema)
  .output(FightResultSchema)
  .handler(async ({ input: teams }) => {
    // load every pokemon while reusing cached rows where possible
    // promise.all keeps their input order and rejects if any lookup fails
    const allPokemon = await Promise.all(
      [...teams.team1, ...teams.team2].map(pokemonService.findOrCachePokemon),
    );
    // names and numeric IDs can point to the same pokemon, so compare their actual IDs
    if (new Set(allPokemon.map((entry) => entry.id)).size !== allPokemon.length) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose different pokemon for every team position",
      });
    }
    // split the ordered results back into the two original teams
    const team1 = allPokemon.slice(0, teams.team1.length);
    const team2 = allPokemon.slice(teams.team1.length);

    // Every member is scored against the complete opposing team.
    const { team1: scores1, team2: scores2 } = scoreTeams(team1, team2);
    const totals1 = summarizeTeam(team1, scores1);
    const totals2 = summarizeTeam(team2, scores2);
    // compare score, then base stats, then speed, leaving exact matches as ties
    const { result, decidedBy } = decideTeamResult(totals1, totals2);

    // a transaction saves the parent battle and every participant together
    // if one insert fails, postgres rolls the whole battle back
    const battleId = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(battleHistory)
        .values({
          result,
          decidedBy,
          team1Score: totals1.score,
          team2Score: totals2.score,
        })
        .returning({ id: battleHistory.id });
      // make one row for every pokemon with its team number and position
      const participants = [
        ...team1.map((entry, position) => ({
          entry,
          position,
          teamNumber: 1,
          battle: scores1[position],
        })),
        ...team2.map((entry, position) => ({
          entry,
          position,
          teamNumber: 2,
          battle: scores2[position],
        })),
      ];
      await tx.insert(battleParticipant).values(
        participants.map(({ entry, position, teamNumber, battle }) => ({
          battleId: record.id,
          pokemonId: entry.id,
          teamNumber,
          position: position + 1,
          battleScore: battle.score,
          totalStats: battle.totalStats,
          speed: entry.stats.speed,
          typeMultiplier: battle.typeMultiplier,
        })),
      );
      return record.id;
    });

    // Derive participant outcomes directly from the saved team result.
    let outcome1: "WIN" | "LOSE" | "TIE" = "TIE";
    let outcome2: "WIN" | "LOSE" | "TIE" = "TIE";
    if (result === "TEAM1_WIN") {
      outcome1 = "WIN";
      outcome2 = "LOSE";
    } else if (result === "TEAM2_WIN") {
      outcome1 = "LOSE";
      outcome2 = "WIN";
    }
    const note =
      "Each Pokemon scores its total base stats plus the rounded average type bonus against all opponents. " +
      "Team scores sum member scores; typeMultiplier is the average effectiveness, rounded to two decimals. This is not the official Pokemon battle system, please don't sue me.";
    return {
      battleId,
      result,
      decidedBy,
      team1: {
        score: totals1.score,
        pokemon: team1.map((entry, i) => ({
          position: i + 1,
          ...displayPokemon(entry, scores1[i], outcome1),
        })),
      },
      team2: {
        score: totals2.score,
        pokemon: team2.map((entry, i) => ({
          position: i + 1,
          ...displayPokemon(entry, scores2[i], outcome2),
        })),
      },
      note,
    };
  });

// GET /api/battles reads saved fights from postgresql without calling pokeapi
// all battles, including migrated 1v1 records, use team participants
export const list = publicProcedure
  .route({ method: "GET", path: "/battles", tags: ["Battles"], summary: "List saved battles" })
  .output(BattleHistorySchema)
  .handler(async () => {
    const battles = await db.query.battleHistory.findMany({
      orderBy: (battle, { desc }) => [desc(battle.foughtAt), desc(battle.id)],
      with: {
        participants: {
          orderBy: (participant, { asc }) => [asc(participant.teamNumber), asc(participant.position)],
          with: { pokemon: { columns: { id: true, name: true } } },
        },
      },
    });
    // group the saved participants by battle so each history row has two ordered teams
    return {
      count: battles.length,
      battles: battles.map((battle) => {
        const rows = battle.participants;
        /**
         * Build ordered history entries for participants on one saved team.
         *
         * @param teamNumber - The team number to select.
         * @returns The selected participants with their saved battle snapshots.
         */
        const members = (teamNumber: number) =>
          rows
            .filter((row) => row.teamNumber === teamNumber)
            .map((row) => ({
              position: row.position,
              id: row.pokemon.id,
              name: row.pokemon.name,
              battleScore: row.battleScore,
              totalStats: row.totalStats,
              speed: row.speed,
              typeMultiplier: row.typeMultiplier,
            }));
        return {
          id: battle.id,
          // expose the saved instant as whole Unix seconds, independent of the server time zone
          // converting the number to regular date will happen in the frontend
          foughtAt: toUnixSeconds(battle.foughtAt),
          result: battle.result,
          decidedBy: battle.decidedBy,
          team1: { score: battle.team1Score, pokemon: members(1) },
          team2: { score: battle.team2Score, pokemon: members(2) },
        };
      }),
    };
  });
