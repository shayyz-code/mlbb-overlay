import type {
  DisplayCommand,
  DisplaySettings,
  DisplayState,
  DraftCommand,
  DraftState,
  NativeHudFrame,
  OverlayConfig,
  Side,
} from "@shayyz/contracts";
import { type CSSProperties, useEffect, useState } from "react";
import {
  fetchDraft,
  sendCommand,
  sendDisplayCommand,
  subscribeToDraft,
} from "./api";
import "./display-control.css";
import { MatchPicker } from "./MatchPicker";
import { OrganizerSidebar } from "./OrganizerShell";
import {
  autosaveLabel,
  useDisplaySectionAutosave,
} from "./useDisplaySectionAutosave";

const surfaces = [
  "scoreboard",
  "match",
  "schedule",
  "countdown",
  "ticker",
  "roster",
  "result",
] as const;
type WithoutRevision<T> = T extends unknown
  ? Omit<T, "expectedRevision">
  : never;
type DraftCommandInput = WithoutRevision<DraftCommand>;

const selectOverlayConfig = (state: DisplayState): OverlayConfig => ({
  event: state.event,
  scoreboard: state.scoreboard,
  countdown: state.countdown,
  ticker: state.ticker,
  rosterLoop: state.rosterLoop,
});
const overlayConfigCommand = (
  expectedRevision: number,
  config: OverlayConfig,
): DisplayCommand => ({ type: "set-overlay-config", expectedRevision, config });

function useDisplayControl() {
  const [draft, setDraft] = useState<DraftState>();
  const [draftConnected, setDraftConnected] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("shayyz-control-token") ?? "",
  );
  const autosave = useDisplaySectionAutosave({
    token,
    select: selectOverlayConfig,
    command: overlayConfigCommand,
    failureMessage: "Overlay save failed.",
  });

  useEffect(() => {
    void fetchDraft().then(setDraft);
    return subscribeToDraft(setDraft, setDraftConnected);
  }, []);

  const cue = async () => {
    const display = autosave.display;
    if (!display) return;
    try {
      setLiveError("");
      await sendDisplayCommand(
        { type: "cue", expectedRevision: display.revision },
        token,
      );
    } catch (reason) {
      setLiveError(reason instanceof Error ? reason.message : "Cue failed.");
    }
  };

  const draftCommand = async (command: DraftCommandInput) => {
    if (!draft) return;
    try {
      setLiveError("");
      setDraft(
        await sendCommand(
          { ...command, expectedRevision: draft.revision } as DraftCommand,
          token,
        ),
      );
    } catch (reason) {
      setLiveError(
        reason instanceof Error ? reason.message : "Live score update failed.",
      );
      setDraft(await fetchDraft());
    }
  };

  const saveToken = (value: string) => {
    setToken(value);
    sessionStorage.setItem("shayyz-control-token", value);
  };
  return {
    autosave,
    draft,
    connected: autosave.connected && draftConnected,
    error: liveError || autosave.error,
    token,
    saveToken,
    cue,
    draftCommand,
    setDraft,
  };
}

function TeamLiveControl({
  side,
  draft,
  command,
}: {
  side: Side;
  draft: DraftState;
  command: (command: DraftCommandInput) => Promise<void>;
}) {
  const team = draft.teams[side];
  const score = draft.scoreboard.scores[side];
  return (
    <article className={`display-team-control side-${side}`}>
      <span className="display-team-side">{side}</span>
      <div className="display-team-summary">
        {team.logoUrl && <img src={team.logoUrl} alt="" />}
        <span>
          <small>{team.shortName}</small>
          <strong>{team.name}</strong>
        </span>
      </div>
      <div className="live-score">
        <button
          type="button"
          disabled={score === 0}
          onClick={() =>
            void command({
              type: "set-scoreboard-score",
              side,
              score: score - 1,
            })
          }
        >
          −
        </button>
        <strong>{score}</strong>
        <button
          type="button"
          onClick={() =>
            void command({
              type: "set-scoreboard-score",
              side,
              score: score + 1,
            })
          }
        >
          +
        </button>
      </div>
    </article>
  );
}

const frameFields = ["x", "y", "width", "height", "rowGap"] as const;

function FrameGeometryEditor({
  side,
  frame,
  update,
}: {
  side: Side;
  frame: NativeHudFrame;
  update: (frame: NativeHudFrame) => void;
}) {
  return (
    <fieldset className={`frame-geometry side-${side}`}>
      <legend>{side} native HUD column</legend>
      {frameFields.map((field) => (
        <label key={`${side}-${field}`}>
          {field === "rowGap" ? "Row gap" : field}
          <input
            type="number"
            min={
              field === "rowGap" || field === "x" || field === "y"
                ? 0
                : field === "height"
                  ? 100
                  : 40
            }
            max={
              field === "x"
                ? 1919
                : field === "y"
                  ? 1079
                  : field === "width"
                    ? 500
                    : field === "height"
                      ? 900
                      : 12
            }
            value={frame[field]}
            onChange={(event) =>
              update({ ...frame, [field]: Number(event.target.value) })
            }
          />
        </label>
      ))}
    </fieldset>
  );
}

function FramePreview({
  frames,
}: {
  frames: DisplaySettings["scoreboard"]["frames"];
}) {
  const frameStyle = (frame: NativeHudFrame) =>
    ({
      left: `${(frame.x / 1920) * 100}%`,
      top: `${(frame.y / 1080) * 100}%`,
      width: `${(frame.width / 1920) * 100}%`,
      height: `${(frame.height / 1080) * 100}%`,
      "--preview-row-gap": `${(frame.rowGap / 1080) * 100}%`,
    }) as CSSProperties;
  return (
    <div
      className="native-frame-preview"
      role="img"
      aria-label="Native HUD frame preview"
    >
      <div className="preview-top-scoreboard">
        <span>Blue</span>
        <i>Timer</i>
        <span>Red</span>
        <b aria-hidden="true" />
      </div>
      {(["blue", "red"] as const).map((side) => (
        <div
          className={`preview-native-frame side-${side}`}
          style={frameStyle(frames[side])}
          key={side}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <span key={`${side}-preview-${index}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DisplayControlPage() {
  const control = useDisplayControl();
  const { draft, autosave } = control;
  const { display, value: working } = autosave;
  if (!draft || !display || !working)
    return <div className="loading-screen">Loading display console…</div>;
  const updateFrame = (side: Side, frame: NativeHudFrame) => {
    const next = structuredClone(working);
    next.scoreboard.frames[side] = frame;
    autosave.edit(next);
  };
  const effectiveRemaining =
    working.countdown.running && working.countdown.startedAt !== null
      ? Math.max(
          0,
          working.countdown.remainingSeconds -
            Math.floor((Date.now() - working.countdown.startedAt) / 1000),
        )
      : working.countdown.remainingSeconds;
  return (
    <main className="control-shell display-control-shell">
      <OrganizerSidebar
        active="overlays"
        connected={control.connected}
        token={control.token}
        onTokenChange={control.saveToken}
        statusLines={
          <>
            <small>Display revision {display.revision}</small>
            <small>Native HUD framing</small>
          </>
        }
        extra={
          <div className="surface-links">
            {surfaces.map((surface) => (
              <a
                key={surface}
                href={`/overlay/${surface}`}
                target="_blank"
                rel="noreferrer"
              >
                {surface}
              </a>
            ))}
          </div>
        }
      />
      <section className="control-main display-control-main">
        <header className="control-header">
          <div>
            <small>Organizer setup</small>
            <h1>Overlay Setup</h1>
          </div>
          <div className="header-actions">
            <button type="button" onClick={() => void control.cue()}>
              Replay entrance
            </button>
            <span className={`autosave-state ${autosave.status}`} role="status">
              {autosaveLabel[autosave.status]}
            </span>
          </div>
        </header>
        {control.error && (
          <div className="error-banner autosave-error">
            <span>{control.error}</span>
            {autosave.error &&
              (autosave.status === "error" ||
                autosave.status === "conflict") && (
                <button type="button" onClick={autosave.retry}>
                  Keep my changes
                </button>
              )}
            {autosave.status === "conflict" && (
              <button type="button" onClick={autosave.reload}>
                Reload saved overlay settings
              </button>
            )}
          </div>
        )}
        <MatchPicker
          draft={draft}
          display={display}
          token={control.token}
          onActivated={(nextDraft) => {
            control.setDraft(nextDraft);
          }}
        />
        <p className="scoreboard-instruction">
          Every browser source stays at a stable URL. OBS scene visibility
          remains fully manual.
        </p>

        <section className="display-panel">
          <header>
            <div>
              <small>Transparent gameplay HUD</small>
              <h2>Live scoreboard</h2>
            </div>
            <label>
              Layout
              <select
                value={working.scoreboard.preset}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    scoreboard: {
                      ...working.scoreboard,
                      preset: event.target.value as "tournament" | "compact",
                    },
                  })
                }
              >
                <option value="tournament">Gameplay frame</option>
                <option value="compact">Top scoreboard only</option>
              </select>
            </label>
          </header>
          <div className="live-team-grid">
            <TeamLiveControl
              side="blue"
              draft={draft}
              command={control.draftCommand}
            />
            <TeamLiveControl
              side="red"
              draft={draft}
              command={control.draftCommand}
            />
          </div>
          <div className="metadata-grid">
            <label>
              Stage
              <input
                value={working.scoreboard.stage}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    scoreboard: {
                      ...working.scoreboard,
                      stage: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              Round
              <input
                value={working.scoreboard.round}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    scoreboard: {
                      ...working.scoreboard,
                      round: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              Game
              <input
                type="number"
                min="1"
                max="9"
                value={working.scoreboard.gameNumber}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    scoreboard: {
                      ...working.scoreboard,
                      gameNumber: Number(event.target.value),
                    },
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
                value={working.scoreboard.bestOf}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    scoreboard: {
                      ...working.scoreboard,
                      bestOf: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
        </section>

        <section className="display-panel native-frame-panel">
          <header>
            <div>
              <small>Transparent native spectator alignment</small>
              <h2>Hero column wrappers</h2>
            </div>
            <a
              className="calibration-link"
              href="/overlay/scoreboard?calibrate=1"
              target="_blank"
              rel="noreferrer"
            >
              Open calibration view
            </a>
          </header>
          <p className="frame-help">
            These frames surround the player information already rendered by
            MLBB. They never draw replacement portraits, names, or statistics.
          </p>
          <FramePreview frames={working.scoreboard.frames} />
          <div className="frame-geometry-grid">
            <FrameGeometryEditor
              side="blue"
              frame={working.scoreboard.frames.blue}
              update={(frame) => updateFrame("blue", frame)}
            />
            <FrameGeometryEditor
              side="red"
              frame={working.scoreboard.frames.red}
              update={(frame) => updateFrame("red", frame)}
            />
          </div>
        </section>

        <section className="display-panel">
          <header>
            <div>
              <small>Reusable planned fixtures</small>
              <h2>Matches</h2>
            </div>
            <a className="calibration-link" href="/control/matches">
              Open match control
            </a>
          </header>
        </section>

        <section className="display-panel roster-loop-panel">
          <header>
            <div>
              <small>Transparent team introductions</small>
              <h2>Team roster loop</h2>
            </div>
            <a
              className="calibration-link"
              href="/overlay/roster"
              target="_blank"
              rel="noreferrer"
            >
              Open roster overlay
            </a>
          </header>
          <p className="frame-help">
            Loops every team in Team Control order. Replay entrance restarts
            from the first team.
          </p>
          <div className="metadata-grid roster-loop-fields">
            <label>
              Hold per team (seconds)
              <input
                type="number"
                min="3"
                max="30"
                step="1"
                value={working.rosterLoop.holdSeconds}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    rosterLoop: {
                      ...working.rosterLoop,
                      holdSeconds: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Transition (seconds)
              <input
                type="number"
                min="0.3"
                max="2"
                step="0.1"
                value={working.rosterLoop.transitionSeconds}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    rosterLoop: {
                      ...working.rosterLoop,
                      transitionSeconds: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
        </section>

        <section className="display-panel utility-grid">
          <div>
            <small>Broadcast begins in</small>
            <h2>Countdown</h2>
            <label>
              Duration in minutes
              <input
                type="number"
                min="0"
                max="10080"
                value={Math.ceil(working.countdown.durationSeconds / 60)}
                onChange={(event) => {
                  const seconds = Number(event.target.value) * 60;
                  autosave.edit({
                    ...working,
                    countdown: {
                      durationSeconds: seconds,
                      remainingSeconds: seconds,
                      running: false,
                      startedAt: null,
                    },
                  });
                }}
              />
            </label>
            <div className="countdown-actions">
              <strong>
                {Math.floor(effectiveRemaining / 60)}:
                {String(effectiveRemaining % 60).padStart(2, "0")}
              </strong>
              <button
                type="button"
                onClick={() => {
                  const next = {
                    ...working,
                    countdown: working.countdown.running
                      ? {
                          ...working.countdown,
                          remainingSeconds: effectiveRemaining,
                          running: false,
                          startedAt: null,
                        }
                      : {
                          ...working.countdown,
                          remainingSeconds: effectiveRemaining,
                          running: true,
                          startedAt: Date.now(),
                        },
                  };
                  autosave.saveNow(next);
                }}
              >
                {working.countdown.running ? "Pause" : "Start"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = {
                    ...working,
                    countdown: {
                      ...working.countdown,
                      remainingSeconds: working.countdown.durationSeconds,
                      running: false,
                      startedAt: null,
                    },
                  };
                  autosave.saveNow(next);
                }}
              >
                Reset
              </button>
            </div>
          </div>
          <div>
            <small>Transparent lower third</small>
            <h2>Ticker</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={working.ticker.enabled}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    ticker: {
                      ...working.ticker,
                      enabled: event.target.checked,
                    },
                  })
                }
              />
              Show ticker
            </label>
            <label>
              Messages, one per line
              <textarea
                rows={5}
                value={working.ticker.messages.join("\n")}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    ticker: {
                      ...working.ticker,
                      messages: event.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .slice(0, 20),
                      activeIndex: 0,
                    },
                  })
                }
              />
            </label>
            <label>
              Change every {working.ticker.speedSeconds}s
              <input
                type="range"
                min="5"
                max="120"
                value={working.ticker.speedSeconds}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    ticker: {
                      ...working.ticker,
                      speedSeconds: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
        </section>

        <section className="display-panel">
          <header>
            <div>
              <small>Broadcast metadata</small>
              <h2>Event settings</h2>
            </div>
          </header>
          <div className="metadata-grid event-fields">
            <label>
              Event name
              <input
                value={working.event.name}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    event: { ...working.event, name: event.target.value },
                  })
                }
              />
            </label>
            <label>
              Timezone
              <input
                value={working.event.timezone}
                onChange={(event) =>
                  autosave.edit({
                    ...working,
                    event: { ...working.event, timezone: event.target.value },
                  })
                }
              />
            </label>
          </div>
        </section>
      </section>
    </main>
  );
}
