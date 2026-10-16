import { protectedProcedure } from "../procedures";

import { z } from "zod";
import {
  decideTeamResult,
  displayPokemon,
  findOrCachePokemon,
  scoreTeams,
  summarizeTeam,
} from "../utils/battles";
import { ORPCError } from "@orpc/server";
import { battleHistory, battleParticipant } from "#/db/schema/pokemon";

const pokemonIdentifier = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Provide a pokemon name or id")
  .max(255, "Pokemon identifier is too long")
  .regex(
    /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[1-9][0-9]*)$/,
    "Use a pokemon name or positive numeric id",
  )
  .refine(
    (value) => !/^[0-9]+$/.test(value) || Number.isSafeInteger(Number(value)),
    "Pokemon id is too large",
  );

const team = z
  .array(z.object({ pokemonIdentifier }))
  .min(1, "choose at least one pokemon")
  .max(4, "choose no more than four pokemon");

const fightBodySchema = z.object({ team1: team, team2: team });

export const fight = protectedProcedure
  .input(fightBodySchema)
  .handler(async ({ input, context }) => {
    const teams = input;

    const allPokemon = await Promise.all(
      [...teams.team1, ...teams.team2].map((pokemon) =>
        findOrCachePokemon(pokemon.pokemonIdentifier),
      ),
    );

    if (new Set(allPokemon.map((entry) => entry.id)).size !== allPokemon.length) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose different pokemon for every team position",
      });
    }

    const team1 = allPokemon.slice(0, teams.team1.length);
    const team2 = allPokemon.slice(teams.team1.length);

    const { team1: scores1, team2: scores2 } = scoreTeams(team1, team2);
    const totals1 = summarizeTeam(team1, scores1);
    const totals2 = summarizeTeam(team2, scores2);

    const { result, decidedBy } = decideTeamResult(totals1, totals2);

    const battleId = await context.db.transaction(async (tx) => {
      const [record] = await tx
        .insert(battleHistory)
        .values({
          result,
          decidedBy,
          team1Score: totals1.score,
          team2Score: totals2.score,
        })
        .returning({ id: battleHistory.id });

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

// export const battles = protectedProcedure.handler(async ({ context }) => {
//   const battles = await context.db.query.battleHistory.findMany({
//     orderBy: (battle, { desc }) => [desc(battle.foughtAt), desc(battle.id)],
//     with: {
//       participants: {
//         orderBy: (participant, { asc }) => [asc(participant.teamNumber), asc(participant.position)],
//         with: { pokemon: { columns: { id: true, name: true } } },
//       },
//     },
//   });
//   // group the saved participants by battle so each history row has two ordered teams
//   return {
//     count: battles.length,
//     battles: battles.map((battle) => {
//       const rows = battle.participants;
//       /**
//        * Build ordered history entries for participants on one saved team.
//        *
//        * @param teamNumber - The team number to select.
//        * @returns The selected participants with their saved battle snapshots.
//        */
//       const members = (teamNumber: number) =>
//         rows
//           .filter((row) => row.teamNumber === teamNumber)
//           .map((row) => ({
//             position: row.position,
//             id: row.pokemon.id,
//             name: row.pokemon.name,
//             battleScore: row.battleScore,
//             totalStats: row.totalStats,
//             speed: row.speed,
//             typeMultiplier: row.typeMultiplier,
//           }));
//       return {
//         id: battle.id,
//         // expose the saved instant as whole Unix seconds, independent of the server time zone
//         // converting the number to regular date will happen in the frontend
//         foughtAt: battle.foughtAt.getUTCSeconds(),
//         result: battle.result,
//         decidedBy: battle.decidedBy,
//         team1: {
//           score: battle.team1Score,
//           pokemon: members(1),
//         },
//         team2: {
//           score: battle.team2Score,
//           pokemon: members(2),
//         },
//       };
//     }),
//   };
// });
