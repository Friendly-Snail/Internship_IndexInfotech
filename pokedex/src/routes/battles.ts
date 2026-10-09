import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { battleHistory, battleParticipant } from "../db/schema/pokemon";
import type { AppDatabase } from "../db/types";
import type { PokemonService } from "../services/pokemon";
import type { CachedPokemon, BattleScore } from "../types/pokemon";
import { fightBodySchema } from "../validation/fight";
import { decideTeamResult, type TeamTotals } from "../utils/team-results";
import { scoreTeams } from "../utils/team-matchups";
import { toUnixSeconds } from "../utils/timestamps";

/**
 * Register team fights and saved battle history.
 *
 * @param database - Database used to save fights and read their participants.
 * @param service - Shared Pokemon lookup helpers.
 * @returns Public POST /api/battles/fight and GET /api/battles routes.
 */
export function createBattleRoutes(database: AppDatabase, service: PokemonService) {
  const routes = new Hono();
  const { findOrCachePokemon } = service;
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
  function displayPokemon(
    entry: CachedPokemon,
    battle: BattleScore,
    result: "WIN" | "LOSE" | "TIE",
  ) {
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

  // summarize one team's participants for the winner and the saved battle row
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
  // client request -> hono -> postgresql cache -> pokeapi if needed -> battle calculation -> database insert -> json response
  routes.post(
    "/fight",
    zValidator("json", fightBodySchema, (result, c) => {
      // hono checks the json body before the fight handler touches the cache or pokeapi
      if (!result.success) {
        return c.json(
          {
            error: "Invalid fight request",
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          400,
        );
      }
    }),
    async (c) => {
      // this value has been checked and normalized by the zod schema above
      const teams = c.req.valid("json");

      // load every pokemon while reusing cached rows where possible
      // all lookups are needed to score the complete fight
      // promise.all keeps their input order and rejects if any lookup fails
      const allPokemon = await Promise.all(
        [...teams.team1, ...teams.team2].map(findOrCachePokemon),
      );
      // names and numeric IDs can point to the same pokemon, so compare their actual IDs
      if (new Set(allPokemon.map((entry) => entry.id)).size !== allPokemon.length) {
        return c.json({ error: "Choose different pokemon for every team position" }, 400);
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
      const battleId = await database.transaction(async (tx) => {
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
      return c.json({
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
      });
    },
  );

  // GET /api/battles reads saved fights from postgresql without calling pokeapi
  // all battles, including migrated 1v1 records, use team participants
  routes.get("/", async (c) => {
    const battles = await database.query.battleHistory.findMany({
      orderBy: (battle, { desc }) => [desc(battle.foughtAt), desc(battle.id)],
      with: {
        participants: {
          orderBy: (participant, { asc }) => [
            asc(participant.teamNumber),
            asc(participant.position),
          ],
          with: { pokemon: { columns: { id: true, name: true } } },
        },
      },
    });
    // group the saved participants by battle so each history row has two ordered teams
    return c.json({
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
          team1: {
            score: battle.team1Score,
            pokemon: members(1),
          },
          team2: {
            score: battle.team2Score,
            pokemon: members(2),
          },
        };
      }),
    });
  });

  return routes;
}
