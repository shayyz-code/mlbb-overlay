import type {
  DisplayState,
  DraftState,
  NativeHudFrame,
  ScheduledMatch,
  Side,
  Team,
} from "@shayyz/contracts";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchDisplay,
  fetchDraft,
  subscribeToDisplay,
  subscribeToDraft,
} from "./api";
import "./display-overlays.css";

export type DisplaySurface =
  | "scoreboard"
  | "match"
  | "schedule"
  | "countdown"
  | "ticker"
  | "result";

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function useBroadcastState() {
  const [draft, setDraft] = useState<DraftState>();
  const [display, setDisplay] = useState<DisplayState>();
  const [, tick] = useState(0);
  useEffect(() => {
    void Promise.all([fetchDraft(), fetchDisplay()]).then(
      ([draftState, displayState]) => {
        setDraft(draftState);
        setDisplay(displayState);
      },
    );
    const unsubscribeDraft = subscribeToDraft(setDraft, () => undefined);
    const unsubscribeDisplay = subscribeToDisplay(setDisplay, () => undefined);
    const timer = window.setInterval(() => tick((value) => value + 1), 250);
    return () => {
      unsubscribeDraft();
      unsubscribeDisplay();
      window.clearInterval(timer);
    };
  }, []);
  return { draft, display };
}

function Logo({ team, side }: { team: Team; side: Side }) {
  return (
    <span className={`broadcast-logo side-${side}`}>
      <b>{initials(team.shortName)}</b>
      {team.logoUrl && <img src={team.logoUrl} alt="" />}
    </span>
  );
}

function CompactScoreboard({ draft }: { draft: DraftState }) {
  return (
    <div className="display-compact-scoreboard">
      <Logo team={draft.teams.blue} side="blue" />
      <span className="compact-team blue">{draft.teams.blue.name}</span>
      <b className="compact-score blue">{draft.scoreboard.scores.blue}</b>
      <span className="compact-timer-gap" aria-hidden="true" />
      <b className="compact-score red">{draft.scoreboard.scores.red}</b>
      <span className="compact-team red">{draft.teams.red.name}</span>
      <Logo team={draft.teams.red} side="red" />
      <span className="compact-right-extension" aria-hidden="true" />
    </div>
  );
}

function NativeHudWrapper({
  side,
  frame,
  calibrating,
}: {
  side: Side;
  frame: NativeHudFrame;
  calibrating: boolean;
}) {
  const style = {
    left: frame.x,
    top: frame.y,
    width: frame.width,
    height: frame.height,
    "--native-row-gap": `${frame.rowGap}px`,
  } as CSSProperties;
  return (
    <aside
      className={`native-hud-wrapper side-${side} ${calibrating ? "is-calibrating" : ""}`}
      style={style}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span key={`${side}-native-row-${index}`}>
          {calibrating && <b>{index + 1}</b>}
        </span>
      ))}
      {calibrating && (
        <output>
          {frame.x}, {frame.y} · {frame.width} × {frame.height}
        </output>
      )}
    </aside>
  );
}

function TournamentScoreboard({
  draft,
  display,
  calibrating,
}: {
  draft: DraftState;
  display: DisplayState;
  calibrating: boolean;
}) {
  return (
    <>
      <CompactScoreboard draft={draft} />
      <NativeHudWrapper
        side="blue"
        frame={display.scoreboard.frames.blue}
        calibrating={calibrating}
      />
      <NativeHudWrapper
        side="red"
        frame={display.scoreboard.frames.red}
        calibrating={calibrating}
      />
    </>
  );
}

type ResolvedMatch = ScheduledMatch & { blue: Team; red: Team };

function activeMatch(draft: DraftState, display: DisplayState): ResolvedMatch {
  const selected = display.schedule.find(
    (match) => match.id === display.activeMatchId,
  );
  const blue = display.teams.find((team) => team.id === selected?.blueTeamId);
  const red = display.teams.find((team) => team.id === selected?.redTeamId);
  return {
    id: selected?.id ?? "current-match",
    scheduledAt: selected?.scheduledAt ?? null,
    stage: selected?.stage || display.scoreboard.stage,
    round: selected?.round || display.scoreboard.round,
    bestOf: selected?.bestOf ?? display.scoreboard.bestOf,
    blue: blue ?? draft.teams.blue,
    red: red ?? draft.teams.red,
    scores:
      selected?.status === "complete"
        ? selected.scores
        : draft.scoreboard.scores,
    status: selected?.status ?? "live",
  } as ScheduledMatch & { blue: Team; red: Team };
}

function MatchOverlay({
  draft,
  display,
}: {
  draft: DraftState;
  display: DisplayState;
}) {
  const match = activeMatch(draft, display);
  const time = match.scheduledAt
    ? new Intl.DateTimeFormat("en", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: display.event.timezone,
      }).format(new Date(match.scheduledAt))
    : "UP NEXT";
  return (
    <section className="break-surface match-surface">
      <div className="match-heading">
        <small>{match.stage}</small>
        <strong>{match.round}</strong>
      </div>
      <div className="match-team side-blue">
        <Logo team={match.blue} side="blue" />
        <strong>{match.blue.name}</strong>
        <small>BLUE</small>
      </div>
      <div className="match-center">
        <span>{time}</span>
        <b>VS</b>
        <small>BEST OF {match.bestOf}</small>
      </div>
      <div className="match-team side-red">
        <Logo team={match.red} side="red" />
        <strong>{match.red.name}</strong>
        <small>RED</small>
      </div>
    </section>
  );
}

function ScheduleOverlay({ display }: { display: DisplayState }) {
  const matches = display.schedule.slice(0, 4);
  return (
    <section className="break-surface schedule-surface">
      <header className="schedule-heading">
        <small>Match programme</small>
        <strong>Schedule</strong>
      </header>
      <div className="schedule-list">
        {matches.length ? (
          matches.map((match) => {
            const blue = display.teams.find(
              (team) => team.id === match.blueTeamId,
            );
            const red = display.teams.find(
              (team) => team.id === match.redTeamId,
            );
            if (!blue || !red) return null;
            return (
              <article
                className={
                  match.id === display.activeMatchId ? "is-active" : ""
                }
                key={match.id}
              >
                <time>
                  {match.scheduledAt
                    ? new Intl.DateTimeFormat("en", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: display.event.timezone,
                      }).format(new Date(match.scheduledAt))
                    : "TBD"}
                </time>
                <span>
                  <Logo team={blue} side="blue" />
                  <strong>{blue.shortName}</strong>
                </span>
                <b>
                  {match.status === "complete"
                    ? `${match.scores.blue} — ${match.scores.red}`
                    : "VS"}
                </b>
                <span>
                  <strong>{red.shortName}</strong>
                  <Logo team={red} side="red" />
                </span>
                <small>{match.round}</small>
              </article>
            );
          })
        ) : (
          <div className="display-empty">Schedule will be announced soon</div>
        )}
      </div>
    </section>
  );
}

function remainingCountdown(display: DisplayState) {
  const timer = display.countdown;
  if (!timer.running || timer.startedAt === null) return timer.remainingSeconds;
  return Math.max(
    0,
    timer.remainingSeconds - Math.floor((Date.now() - timer.startedAt) / 1000),
  );
}

function CountdownOverlay({ display }: { display: DisplayState }) {
  const remaining = remainingCountdown(display);
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  return (
    <section className="break-surface countdown-surface">
      <div className="countdown-card">
        <small>Broadcast begins in</small>
        <strong>
          {[hours, minutes, seconds]
            .map((part) => String(part).padStart(2, "0"))
            .join(" : ")}
        </strong>
        <span>Stay with us</span>
      </div>
    </section>
  );
}

function ResultOverlay({
  draft,
  display,
}: {
  draft: DraftState;
  display: DisplayState;
}) {
  const match = activeMatch(draft, display);
  const winner =
    match.scores.blue === match.scores.red
      ? null
      : match.scores.blue > match.scores.red
        ? match.blue
        : match.red;
  return (
    <section className="break-surface result-surface">
      <div className="result-heading">
        <small>
          {match.stage} · {match.round}
        </small>
        <strong>{winner ? `${winner.name} wins` : "Series result"}</strong>
      </div>
      <div className="result-teams">
        <span>
          <Logo team={match.blue} side="blue" />
          <strong>{match.blue.name}</strong>
        </span>
        <b>
          {match.scores.blue}
          <i>—</i>
          {match.scores.red}
        </b>
        <span>
          <Logo team={match.red} side="red" />
          <strong>{match.red.name}</strong>
        </span>
      </div>
    </section>
  );
}

function TickerOverlay({ display }: { display: DisplayState }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!display.ticker.enabled || display.ticker.messages.length < 2) return;
    const timer = window.setInterval(
      () => setOffset((value) => value + 1),
      display.ticker.speedSeconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [
    display.ticker.enabled,
    display.ticker.messages.length,
    display.ticker.speedSeconds,
  ]);
  if (!display.ticker.enabled || display.ticker.messages.length === 0)
    return null;
  const index =
    (display.ticker.activeIndex + offset) % display.ticker.messages.length;
  return (
    <div className="ticker-surface">
      <strong>LIVE UPDATE</strong>
      <span key={`${display.cueRevision}-${index}`}>
        {display.ticker.messages[index]}
      </span>
    </div>
  );
}

export function DisplayOverlay({ surface }: { surface: DisplaySurface }) {
  const { draft, display } = useBroadcastState();
  const cueKey = useMemo(
    () => `${surface}-${display?.cueRevision ?? 0}`,
    [display?.cueRevision, surface],
  );
  if (!draft || !display) return null;
  let content: ReactNode;
  if (surface === "scoreboard")
    content =
      display.scoreboard.preset === "compact" ? (
        <CompactScoreboard draft={draft} />
      ) : (
        <TournamentScoreboard
          draft={draft}
          display={display}
          calibrating={
            new URLSearchParams(window.location.search).get("calibrate") === "1"
          }
        />
      );
  else if (surface === "match")
    content = <MatchOverlay draft={draft} display={display} />;
  else if (surface === "schedule")
    content = <ScheduleOverlay display={display} />;
  else if (surface === "countdown")
    content = <CountdownOverlay display={display} />;
  else if (surface === "ticker") content = <TickerOverlay display={display} />;
  else content = <ResultOverlay draft={draft} display={display} />;
  return (
    <main key={cueKey} className={`display-canvas display-${surface}`}>
      {content}
    </main>
  );
}
