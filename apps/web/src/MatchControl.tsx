import type {
  DisplayCommand,
  DisplaySettings,
  DisplayState,
  ScheduledMatch,
  Side,
} from "@shayyz/contracts";
import { useState } from "react";
import "./match-control.css";
import { matchTimeFromInput, matchTimeInputValue } from "./match-time";
import { OrganizerSidebar } from "./OrganizerShell";
import {
  autosaveLabel,
  useDisplaySectionAutosave,
} from "./useDisplaySectionAutosave";

type MatchSchedule = DisplayState["schedule"];

const selectSchedule = (state: DisplayState): MatchSchedule => state.schedule;
const matchScheduleCommand = (
  expectedRevision: number,
  schedule: MatchSchedule,
): DisplayCommand => ({
  type: "set-match-schedule",
  expectedRevision,
  schedule,
});

export function MatchControlPage() {
  const [localError, setLocalError] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("shayyz-control-token") ?? "",
  );
  const autosave = useDisplaySectionAutosave({
    token,
    select: selectSchedule,
    command: matchScheduleCommand,
    failureMessage: "Match save failed.",
  });
  const { display, value: schedule } = autosave;
  if (!display || !schedule)
    return <div className="loading-screen">Loading match control…</div>;
  const setSchedule = (next: MatchSchedule) => {
    setLocalError("");
    autosave.edit(next);
  };
  const change = (index: number, patch: Partial<ScheduledMatch>) => {
    const next = [...schedule];
    const match = next[index];
    if (!match) return;
    next[index] = { ...match, ...patch };
    setSchedule(next);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= schedule.length) return;
    const next = [...schedule];
    [next[index], next[target]] = [next[target], next[index]] as [
      ScheduledMatch,
      ScheduledMatch,
    ];
    setSchedule(next);
  };
  const add = () => {
    const blue = display.teams[0];
    const red = display.teams.find((team) => team.id !== blue?.id);
    if (!blue || !red) {
      setLocalError("Create at least two teams before adding a match.");
      return;
    }
    setSchedule([
      ...schedule,
      {
        id: crypto.randomUUID(),
        scheduledAt: null,
        stage: display.scoreboard.stage,
        round: `Round ${schedule.length + 1}`,
        bestOf: display.scoreboard.bestOf,
        blueTeamId: blue.id,
        redTeamId: red.id,
        scores: { blue: 0, red: 0 },
        status: "scheduled",
      },
    ]);
  };
  const visibleError = localError || autosave.error;
  return (
    <main className="control-shell">
      <OrganizerSidebar
        active="matches"
        connected={autosave.connected}
        statusLines={<small>{schedule.length} planned matches</small>}
        token={token}
        onTokenChange={(value) => {
          setToken(value);
          sessionStorage.setItem("shayyz-control-token", value);
        }}
      />
      <section className="control-main match-control-main">
        <header className="control-header">
          <div>
            <small>Organizer setup</small>
            <h1>Match Setup</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              disabled={schedule.length >= 32}
              onClick={add}
            >
              Add match
            </button>
            <span className={`autosave-state ${autosave.status}`} role="status">
              {autosaveLabel[autosave.status]}
            </span>
          </div>
        </header>
        {visibleError && (
          <div className="error-banner autosave-error">
            <span>{visibleError}</span>
            {autosave.error &&
              (autosave.status === "error" ||
                autosave.status === "conflict") && (
                <button type="button" onClick={autosave.retry}>
                  Keep my changes
                </button>
              )}
            {autosave.status === "conflict" && (
              <button type="button" onClick={autosave.reload}>
                Reload saved matches
              </button>
            )}
          </div>
        )}
        <div className="managed-match-list">
          {schedule.map((match, index) => (
            <article
              key={match.id}
              className={display.activeMatchId === match.id ? "active" : ""}
            >
              <div className="match-row-heading">
                <strong>Match {index + 1}</strong>
                <span>
                  {display.activeMatchId === match.id ? "Active" : match.status}
                </span>
              </div>
              <div className="managed-match-fields">
                <TeamSelect
                  label="Blue team"
                  side="blue"
                  match={match}
                  teams={display.teams}
                  change={(patch) => change(index, patch)}
                />
                <TeamSelect
                  label="Red team"
                  side="red"
                  match={match}
                  teams={display.teams}
                  change={(patch) => change(index, patch)}
                />
                <label>
                  Stage
                  <input
                    value={match.stage}
                    onChange={(event) =>
                      change(index, { stage: event.target.value })
                    }
                  />
                </label>
                <label>
                  Round
                  <input
                    value={match.round}
                    onChange={(event) =>
                      change(index, { round: event.target.value })
                    }
                  />
                </label>
                <label>
                  Time
                  <input
                    type="datetime-local"
                    value={matchTimeInputValue(match.scheduledAt)}
                    onChange={(event) =>
                      change(index, {
                        scheduledAt: matchTimeFromInput(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Best of
                  <input
                    type="number"
                    min="1"
                    max="9"
                    value={match.bestOf}
                    onChange={(event) =>
                      change(index, { bestOf: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={match.status}
                    onChange={(event) =>
                      change(index, {
                        status: event.target.value as ScheduledMatch["status"],
                      })
                    }
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="live">Live</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>
                {(["blue", "red"] as const).map((side) => (
                  <label key={side}>
                    {side} score
                    <input
                      type="number"
                      min="0"
                      max="9"
                      value={match.scores[side]}
                      onChange={(event) =>
                        change(index, {
                          scores: {
                            ...match.scores,
                            [side]: Math.max(
                              0,
                              Math.min(9, Number(event.target.value)),
                            ),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="match-row-actions">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === schedule.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={display.activeMatchId === match.id}
                  onClick={() =>
                    setSchedule(schedule.filter((item) => item.id !== match.id))
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!schedule.length && (
            <p className="control-empty">
              Create a match and select two managed teams.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function TeamSelect({
  label,
  side,
  match,
  teams,
  change,
}: {
  label: string;
  side: Side;
  match: ScheduledMatch;
  teams: DisplaySettings["teams"];
  change: (patch: Partial<ScheduledMatch>) => void;
}) {
  const field = side === "blue" ? "blueTeamId" : "redTeamId";
  return (
    <label>
      {label}
      <select
        value={match[field]}
        onChange={(event) => change({ [field]: event.target.value })}
      >
        {teams.map((team) => (
          <option value={team.id} key={team.id}>
            {team.name} ({team.shortName})
          </option>
        ))}
      </select>
    </label>
  );
}
