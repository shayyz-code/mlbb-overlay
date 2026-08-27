import type { DisplayState, DraftState } from "@shayyz/contracts";
import { useState } from "react";
import { activateMatch } from "./api";

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
  const [quick, setQuick] = useState(false);
  const [blueTeamId, setBlueTeamId] = useState(display.teams[0]?.id ?? "");
  const [redTeamId, setRedTeamId] = useState(display.teams[1]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (
    command:
      | { type: "activate-match"; matchId: string }
      | {
          type: "activate-quick-match";
          blueTeamId: string;
          redTeamId: string;
        },
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await activateMatch(
        {
          ...command,
          expectedDraftRevision: draft.revision,
          expectedDisplayRevision: display.revision,
        },
        token,
      );
      onActivated(result.draft, result.display);
      setQuick(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="match-picker">
      <label>
        Active match
        <select
          disabled={busy}
          value={quick ? "quick" : (display.activeMatchId ?? "")}
          onChange={(event) => {
            if (event.target.value === "quick") setQuick(true);
            else if (event.target.value)
              void run({ type: "activate-match", matchId: event.target.value });
          }}
        >
          <option value="" disabled>
            Select a planned match
          </option>
          {display.schedule.map((match, index) => (
            <option value={match.id} key={match.id}>
              {index + 1}. {match.stage} · {match.round}
            </option>
          ))}
          <option value="quick">Quick Match…</option>
        </select>
      </label>
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
              void run({ type: "activate-quick-match", blueTeamId, redTeamId })
            }
          >
            Activate Quick Match
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
