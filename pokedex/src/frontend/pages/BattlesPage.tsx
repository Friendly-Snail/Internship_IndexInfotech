import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getBattleHistory, outcomeLabel, parseTeams, submitFight } from "../api/battles";
import type { BattleHistory, BattleTeam, FightResult } from "../api/battles";
import { formatUnixDate } from "../../utils/timestamps";

/** Show saved/calculated participant values, including missing legacy snapshots. */
export function TeamSummary({ team, number }: { team: BattleTeam; number: number }) {
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

export function BattlesPage() {
  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [result, setResult] = useState<FightResult | null>(null);
  const [fighting, setFighting] = useState(false);
  const [fightError, setFightError] = useState("");
  const [history, setHistory] = useState<BattleHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const historyRequest = useRef<AbortController | null>(null);
  const fightRequest = useRef<AbortController | null>(null);

  async function refreshHistory() {
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await getBattleHistory(controller.signal);
      if (!controller.signal.aborted) setHistory(data);
    } catch (error) {
      if (!controller.signal.aborted)
        setHistoryError(error instanceof Error ? error.message : "Could not load history.");
    } finally {
      if (!controller.signal.aborted) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void refreshHistory();
    return () => {
      historyRequest.current?.abort();
      fightRequest.current?.abort();
    };
  }, []);

  async function fight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The ref also prevents repeated submissions before React updates the button.
    if (fightRequest.current) return;
    setFightError("");
    setResult(null);
    let teams;
    try {
      teams = parseTeams(team1, team2);
    } catch (error) {
      setFightError(error instanceof Error ? error.message : "Check the teams.");
      return;
    }
    const controller = new AbortController();
    fightRequest.current = controller;
    setFighting(true);
    try {
      const data = await submitFight(teams, controller.signal);
      if (!controller.signal.aborted) {
        setResult(data);
        void refreshHistory();
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setFightError(error instanceof Error ? error.message : "The fight failed.");
    } finally {
      if (!controller.signal.aborted) setFighting(false);
      if (fightRequest.current === controller) fightRequest.current = null;
    }
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
            onClick={() => void refreshHistory()}
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
