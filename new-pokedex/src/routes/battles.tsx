import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { errorMessage } from "#/lib/api-errors";
import { orpc } from "#/orpc/client";
import { formatUnixDate } from "#/utils/timestamps";
import { fightBodySchema } from "#/validation/fight";

export const Route = createFileRoute("/battles")({ component: BattlesPage });

type BattleOutcome = "TEAM1_WIN" | "TEAM2_WIN" | "TIE";
type BattleTeam = {
  score: number;
  pokemon: {
    position: number;
    id: number;
    name: string;
    battleScore: number;
    totalStats: number | null;
    typeMultiplier: number | null;
  }[];
};

/** Parse comma/newline-separated identifiers using the same rules as the server. */
function parseTeams(first: string, second: string) {
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

const outcomeLabel = (result: BattleOutcome) =>
  result === "TIE" ? "Tie" : result === "TEAM1_WIN" ? "Team 1 wins" : "Team 2 wins";

/** Show saved/calculated participant values, including missing legacy snapshots. */
function TeamSummary({ team, number }: { team: BattleTeam; number: number }) {
  return (
    <section className="team-summary" aria-label={`Team ${number} result`}>
      <div className="team-score">
        <h3>Team {number}</h3>
        <strong>{team.score} points</strong>
      </div>
      <div className="battle-table-wrap">
        <table className="stats-table">
          <caption>Team {number} participants</caption>
          <thead>
            <tr>
              <th scope="col">Pokémon</th>
              <th scope="col">Base total</th>
              <th scope="col">Type ×</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {team.pokemon.map((member) => (
              <tr key={`${member.position}-${member.id}`}>
                <th scope="row" className="pokemon-name-cell">
                  {member.name.replaceAll("-", " ")}
                </th>
                <td>{member.totalStats ?? "—"}</td>
                <td>{member.typeMultiplier ?? "—"}</td>
                <td>{member.battleScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BattlesPage() {
  const queryClient = useQueryClient();
  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [parseError, setParseError] = useState("");
  const historyQuery = useQuery(orpc.battles.list.queryOptions());
  const fightMutation = useMutation(
    orpc.battles.fight.mutationOptions({
      // a saved battle changes the history, so read it again
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.battles.list.key() }),
    }),
  );

  const fighting = fightMutation.isPending;
  const result = fightMutation.data;
  const fightError =
    parseError ||
    (fightMutation.isError
      ? errorMessage(
          fightMutation.error,
          "The battle response was interrupted. It may have been saved; refresh history before trying again.",
        )
      : "");
  const history = historyQuery.data;
  const historyLoading = historyQuery.isFetching;
  const historyError =
    historyQuery.isError && !historyLoading
      ? errorMessage(
          historyQuery.error,
          "Could not load battle history. Check your connection and try again.",
        )
      : "";

  function fight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // the pending check also prevents repeated submissions
    if (fighting) return;
    setParseError("");
    fightMutation.reset();
    let teams;
    try {
      teams = parseTeams(team1, team2);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Check the teams.");
      return;
    }
    fightMutation.mutate(teams);
  }

  return (
    <section className="feature-page" aria-labelledby="page-title">
      <p className="eyebrow">TEAM BATTLES</p>
      <h1 id="page-title">Build a rivalry</h1>
      <p className="page-description">Pick your teams and compare their stats and type matchups.</p>
      <form className="battle-form" onSubmit={fight} noValidate>
        <p id="team-hint" className="cache-explanation">
          Enter 1–4 names or IDs per team, separated by commas or new lines. Unequal teams are
          welcome. Every Pokémon must be different, including names and IDs referring to the same
          Pokémon.
        </p>
        <div className="team-input-grid">
          {([1, 2] as const).map((number) => (
            <div key={number}>
              <label htmlFor={`team-${number}`}>Team {number}</label>
              <textarea
                id={`team-${number}`}
                value={number === 1 ? team1 : team2}
                onChange={(event) => (number === 1 ? setTeam1 : setTeam2)(event.target.value)}
                placeholder={number === 1 ? "pikachu, bulbasaur" : "geodude, charmander"}
                rows={3}
                disabled={fighting}
                aria-describedby="team-hint"
                spellCheck={false}
              />
            </div>
          ))}
        </div>
        <button className="button-primary" type="submit" disabled={fighting}>
          {fighting ? "Battling…" : "Start battle"}
        </button>
      </form>
      {fightError && (
        <div className="search-error" role="alert">
          {fightError}
        </div>
      )}
      {fighting && (
        <p className="loading-message" role="status">
          Loading the teams and calculating the battle…
        </p>
      )}
      {result && (
        <article className="battle-result" aria-labelledby="result-title">
          <p className="eyebrow">BATTLE #{result.battleId}</p>
          <h2 id="result-title" role="status">
            {outcomeLabel(result.result)}
          </h2>
          <p>Decided by: {result.decidedBy}</p>
          <div className="battle-team-grid">
            <TeamSummary team={result.team1} number={1} />
            <TeamSummary team={result.team2} number={2} />
          </div>
          <p className="search-hint">{result.note}</p>
        </article>
      )}
      <section className="history-section" aria-labelledby="history-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SAVED MATCHUPS</p>
            <h2 id="history-title">Battle history</h2>
          </div>
          <button
            className="button-secondary"
            type="button"
            onClick={() => void historyQuery.refetch()}
            disabled={historyLoading}
          >
            Refresh history
          </button>
        </div>
        <p className="cache-explanation">
          Dates use your local timezone. Battles use this app’s simplified scoring, not official
          Pokémon combat. A dash means an older record has no saved snapshot.
        </p>
        {historyLoading && <p role="status">Loading history…</p>}
        {historyError && (
          <div className="search-error" role="alert">
            {historyError}
          </div>
        )}
        {history && (
          <>
            <p className="result-count">
              {history.count} saved {history.count === 1 ? "battle" : "battles"}
              {historyLoading || historyError ? " (previously loaded)" : ""}.
            </p>
            {history.battles.length === 0 ? (
              <div className="search-empty">
                <h3>No battles yet</h3>
                <p>Submit your first team battle to start the history.</p>
              </div>
            ) : (
              <div className="battle-history-list">
                {history.battles.map((battle) => (
                  <details className="history-card" key={battle.id}>
                    <summary>
                      <span>
                        Battle #{battle.id} · {formatUnixDate(battle.foughtAt)}
                      </span>
                      <strong>{outcomeLabel(battle.result)}</strong>
                      <span>
                        {battle.team1.score} – {battle.team2.score}
                      </span>
                    </summary>
                    <div className="history-detail">
                      <p>Decided by: {battle.decidedBy}</p>
                      <div className="battle-team-grid">
                        <TeamSummary team={battle.team1} number={1} />
                        <TeamSummary team={battle.team2} number={2} />
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}
