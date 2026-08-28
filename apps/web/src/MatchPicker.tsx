import type {
  DisplayState,
  DraftState,
  SeriesCommand,
} from "@shayyz/contracts";
import { useState } from "react";
import { sendSeriesCommand } from "./api";

type SeriesCommandInput = SeriesCommand extends infer Command
  ? Command extends SeriesCommand
    ? Omit<Command, "expectedDraftRevision" | "expectedDisplayRevision">
    : never
  : never;

export function MatchPicker({
  draft,
  display,
  token,
  onActivated,
}: {
  draft: DraftState;
  display: DisplayState;
  token: string;
  onActivated: (draft: DraftState, display: DisplayState) => void;
}) {
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [quick, setQuick] = useState(false);
  const [blueTeamId, setBlueTeamId] = useState(display.teams[0]?.id ?? "");
  const [redTeamId, setRedTeamId] = useState(display.teams[1]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (command: SeriesCommandInput) => {
    setBusy(true);
    setError("");
    try {
      const result = await sendSeriesCommand(
        {
          ...command,
          expectedDraftRevision: draft.revision,
          expectedDisplayRevision: display.revision,
        },
        token,
      );
      onActivated(result.draft, result.display);
      if (
        command.type === "start-series" ||
        command.type === "start-quick-series"
      ) {
        setQuick(false);
        setSelectedMatchId("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  };
  const activeMatch = display.schedule.find(
    (match) => match.id === display.activeMatchId,
  );
  const selectedMatch = display.schedule.find(
    (match) => match.id === selectedMatchId,
  );
  const teamName = (id: string) =>
    display.teams.find((team) => team.id === id)?.name ?? "Unknown team";
  return (
    <section className="match-picker">
      <div className="series-status">
        <small>
          {activeMatch?.status === "live" ? "Live series" : "Series status"}
        </small>
        <strong>
          {activeMatch
            ? `${teamName(activeMatch.blueTeamId)} vs ${teamName(activeMatch.redTeamId)}`
            : "No active series"}
        </strong>
        {activeMatch && (
          <span>
            Game {display.scoreboard.gameNumber} ·{" "}
            {draft.scoreboard.scores.blue}–{draft.scoreboard.scores.red} · Best
            of {activeMatch.bestOf}
          </span>
        )}
        {activeMatch?.status === "live" && (
          <div className="series-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run({ type: "next-game" })}
            >
              Next Game
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Complete this series and keep its final result?",
                  )
                )
                  void run({ type: "complete-series" });
              }}
            >
              Complete Series
            </button>
          </div>
        )}
      </div>
      <div className="series-starter">
        <label>
          Planned match
          <select
            disabled={busy}
            value={selectedMatchId}
            onChange={(event) => {
              setSelectedMatchId(event.target.value);
              setQuick(false);
            }}
          >
            <option value="">Select a planned match</option>
            {display.schedule
              .filter((match) => match.status !== "complete")
              .map((match, index) => (
                <option value={match.id} key={match.id}>
                  {index + 1}. {teamName(match.blueTeamId)} vs{" "}
                  {teamName(match.redTeamId)} · {match.stage} {match.round}
                </option>
              ))}
          </select>
        </label>
        {selectedMatch && (
          <div className="series-review">
            <span>
              Review: {teamName(selectedMatch.blueTeamId)} vs{" "}
              {teamName(selectedMatch.redTeamId)}, best of{" "}
              {selectedMatch.bestOf}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run({ type: "start-series", matchId: selectedMatch.id })
              }
            >
              {busy ? "Starting…" : "Start Series"}
            </button>
          </div>
        )}
        {!quick && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setQuick(true);
              setSelectedMatchId("");
            }}
          >
            Use Quick Series instead
          </button>
        )}
      </div>
      {quick && (
        <div className="quick-match-fields">
          <TeamSelect
            label="Blue team"
            value={blueTeamId}
            display={display}
            onChange={setBlueTeamId}
          />
          <TeamSelect
            label="Red team"
            value={redTeamId}
            display={display}
            onChange={setRedTeamId}
          />
          <button
            type="button"
            disabled={
              busy || !blueTeamId || !redTeamId || blueTeamId === redTeamId
            }
            onClick={() =>
              void run({ type: "start-quick-series", blueTeamId, redTeamId })
            }
          >
            {busy ? "Starting…" : "Start Quick Series"}
          </button>
          <button type="button" disabled={busy} onClick={() => setQuick(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && <span className="match-picker-error">{error}</span>}
    </section>
  );
}

function TeamSelect({
  label,
  value,
  display,
  onChange,
}: {
  label: string;
  value: string;
  display: DisplayState;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {display.teams.map((team) => (
          <option value={team.id} key={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}
