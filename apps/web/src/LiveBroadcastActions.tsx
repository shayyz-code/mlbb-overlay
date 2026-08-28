import type {
  DisplayState,
  DraftState,
  OverlayConfig,
  Side,
} from "@shayyz/contracts";
import { useState } from "react";
import { sendDisplayCommand } from "./api";

const overlayConfig = (display: DisplayState): OverlayConfig => ({
  event: display.event,
  scoreboard: display.scoreboard,
  countdown: display.countdown,
  ticker: display.ticker,
  rosterLoop: display.rosterLoop,
});

export function LiveBroadcastActions({
  draft,
  display,
  token,
  onScore,
  onDisplayChange,
}: {
  draft: DraftState;
  display: DisplayState;
  token: string;
  onScore: (side: Side, score: number) => Promise<void>;
  onDisplayChange: (display: DisplayState) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const runDisplay = async (
    action: string,
    command: { type: "cue" } | { type: "config"; config: OverlayConfig },
  ) => {
    setBusy(action);
    setError("");
    try {
      onDisplayChange(
        await sendDisplayCommand(
          command.type === "cue"
            ? { type: "cue", expectedRevision: display.revision }
            : {
                type: "set-overlay-config",
                expectedRevision: display.revision,
                config: command.config,
              },
          token,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Live action failed.",
      );
    } finally {
      setBusy("");
    }
  };
  const changeGame = (gameNumber: number) => {
    const config = overlayConfig(display);
    config.scoreboard = { ...config.scoreboard, gameNumber };
    void runDisplay("game", { type: "config", config });
  };
  const toggleTicker = () => {
    const config = overlayConfig(display);
    config.ticker = { ...config.ticker, enabled: !config.ticker.enabled };
    void runDisplay("ticker", { type: "config", config });
  };
  return (
    <section
      className="live-broadcast-actions"
      aria-label="Live broadcast actions"
    >
      <header>
        <div>
          <small>On-air corrections</small>
          <h2>Broadcast Actions</h2>
        </div>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void runDisplay("cue", { type: "cue" })}
        >
          {busy === "cue" ? "Replaying…" : "Replay Entrance"}
        </button>
      </header>
      <div className="live-action-grid">
        {(["blue", "red"] as const).map((side) => {
          const score = draft.scoreboard.scores[side];
          return (
            <div className={`live-score-correction side-${side}`} key={side}>
              <span>{draft.teams[side].shortName}</span>
              <button
                type="button"
                aria-label={`Decrease ${draft.teams[side].name} score`}
                disabled={score === 0}
                onClick={() => void onScore(side, score - 1)}
              >
                −
              </button>
              <strong>{score}</strong>
              <button
                type="button"
                aria-label={`Increase ${draft.teams[side].name} score`}
                disabled={score === 9}
                onClick={() => void onScore(side, score + 1)}
              >
                +
              </button>
            </div>
          );
        })}
        <div className="live-game-correction">
          <span>Game</span>
          <button
            type="button"
            aria-label="Previous game number"
            disabled={Boolean(busy) || display.scoreboard.gameNumber === 1}
            onClick={() => changeGame(display.scoreboard.gameNumber - 1)}
          >
            −
          </button>
          <strong>{display.scoreboard.gameNumber}</strong>
          <button
            type="button"
            aria-label="Next game number"
            disabled={
              Boolean(busy) ||
              display.scoreboard.gameNumber === display.scoreboard.bestOf
            }
            onClick={() => changeGame(display.scoreboard.gameNumber + 1)}
          >
            +
          </button>
        </div>
        <label className="live-ticker-toggle">
          <input
            type="checkbox"
            checked={display.ticker.enabled}
            disabled={Boolean(busy) || display.ticker.messages.length === 0}
            onChange={toggleTicker}
          />
          <span>
            <strong>Show ticker</strong>
            <small>Edit messages in Overlay Setup</small>
          </span>
        </label>
      </div>
      {error && <div className="match-picker-error">{error}</div>}
    </section>
  );
}
