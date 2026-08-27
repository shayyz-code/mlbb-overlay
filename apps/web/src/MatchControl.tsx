import type {
  DisplaySettings,
  DisplayState,
  ScheduledMatch,
  Side,
} from "@shayyz/contracts";
import { useEffect, useState } from "react";
import { fetchDisplay, sendDisplayCommand, subscribeToDisplay } from "./api";
import "./match-control.css";

function settings(state: DisplayState): DisplaySettings {
  const { revision: _, updatedAt: __, ...value } = state;
  return value;
}

export function MatchControlPage() {
  const [display, setDisplay] = useState<DisplayState>();
  const [working, setWorking] = useState<DisplaySettings>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("shayyz-control-token") ?? "",
  );
  useEffect(() => {
    void fetchDisplay().then((state) => {
      setDisplay(state);
      setWorking(settings(state));
    });
    return subscribeToDisplay((state) => {
      setDisplay(state);
      setWorking(settings(state));
    }, setConnected);
  }, []);
  if (!display || !working)
    return <div className="loading-screen">Loading match control…</div>;
  const change = (index: number, patch: Partial<ScheduledMatch>) => {
    const schedule = [...working.schedule];
    const match = schedule[index];
    if (!match) return;
    schedule[index] = { ...match, ...patch };
    setWorking({ ...working, schedule });
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= working.schedule.length) return;
    const schedule = [...working.schedule];
    [schedule[index], schedule[target]] = [
      schedule[target],
      schedule[index],
    ] as [ScheduledMatch, ScheduledMatch];
    setWorking({ ...working, schedule });
  };
  const add = () => {
    const blue = working.teams[0];
    const red = working.teams.find((team) => team.id !== blue?.id);
    if (!blue || !red) {
      setError("Create at least two teams before adding a match.");
      return;
    }
    setWorking({
      ...working,
      schedule: [
        ...working.schedule,
        {
          id: crypto.randomUUID(),
          scheduledAt: null,
          stage: working.scoreboard.stage,
          round: `Round ${working.schedule.length + 1}`,
          bestOf: working.scoreboard.bestOf,
          blueTeamId: blue.id,
          redTeamId: red.id,
          scores: { blue: 0, red: 0 },
          status: "scheduled",
        },
      ],
    });
  };
  const persist = async () => {
    setError("");
    try {
      const state = await sendDisplayCommand(
        {
          type: "set-display",
          expectedRevision: display.revision,
          display: working,
        },
        token,
      );
      setDisplay(state);
      setWorking(settings(state));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Match save failed.");
      const state = await fetchDisplay();
      setDisplay(state);
      setWorking(settings(state));
    }
  };
  return (
    <main className="control-shell">
      <aside className="control-sidebar">
        <div className="brand-lockup">
          <span className="brand-rune">S</span>
          <div>
            <strong>SHAYYZ</strong>
            <small>MLBB OVERLAY</small>
          </div>
        </div>
        <nav>
          <a href="/control/draft">Draft control</a>
          <a href="/control/displays">Display console</a>
          <a href="/control/teams">Team control</a>
          <a className="active" href="/control/matches">
            Match control
          </a>
        </nav>
        <div className="system-card">
          <span className={`status-light ${connected ? "online" : ""}`} />
          <div>
            <strong>{connected ? "Live sync" : "Reconnecting"}</strong>
            <small>{working.schedule.length} planned matches</small>
          </div>
        </div>
        <label className="token-field">
          LAN control token
          <input
            type="password"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              sessionStorage.setItem(
                "shayyz-control-token",
                event.target.value,
              );
            }}
          />
        </label>
      </aside>
      <section className="control-main match-control-main">
        <header className="control-header">
          <div>
            <small>Organizer setup</small>
            <h1>Match Control</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              disabled={working.schedule.length >= 32}
              onClick={add}
            >
              Add match
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void persist()}
            >
              Save matches
            </button>
          </div>
        </header>
        {error && <div className="error-banner">{error}</div>}
        <div className="managed-match-list">
          {working.schedule.map((match, index) => (
            <article
              key={match.id}
              className={working.activeMatchId === match.id ? "active" : ""}
            >
              <div className="match-row-heading">
                <strong>Match {index + 1}</strong>
                <span>
                  {working.activeMatchId === match.id ? "Active" : match.status}
                </span>
              </div>
              <div className="managed-match-fields">
                <TeamSelect
                  label="Blue team"
                  side="blue"
                  match={match}
                  state={working}
                  change={(patch) => change(index, patch)}
                />
                <TeamSelect
                  label="Red team"
                  side="red"
                  match={match}
                  state={working}
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
                    value={match.scheduledAt?.slice(0, 16) ?? ""}
                    onChange={(event) =>
                      change(index, {
                        scheduledAt: event.target.value
                          ? new Date(event.target.value).toISOString()
                          : null,
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
                  disabled={index === working.schedule.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={working.activeMatchId === match.id}
                  onClick={() =>
                    setWorking({
                      ...working,
                      schedule: working.schedule.filter(
                        (item) => item.id !== match.id,
                      ),
                    })
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!working.schedule.length && (
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
  state,
  change,
}: {
  label: string;
  side: Side;
  match: ScheduledMatch;
  state: DisplaySettings;
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
        {state.teams.map((team) => (
          <option value={team.id} key={team.id}>
            {team.name} ({team.shortName})
          </option>
        ))}
      </select>
    </label>
  );
}
