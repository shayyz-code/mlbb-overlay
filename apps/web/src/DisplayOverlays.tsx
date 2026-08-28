import type {
  DisplayState,
  DraftState,
  ManagedTeam,
  NativeHudFrame,
  PlayerRole,
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
import {
  advanceRosterFrame,
  type RosterFrame,
  rosterPhaseDuration,
} from "./roster-loop";
import { formatMatchTime } from "./match-time";
import "./overlay-theme.css";
import "./display-overlays.css";

export type DisplaySurface =
  | "scoreboard"
  | "match"
  | "schedule"
  | "countdown"
  | "ticker"
  | "roster"
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
  const time = formatMatchTime(match.scheduledAt, "UP NEXT");
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
                <time>{formatMatchTime(match.scheduledAt, "TBD")}</time>
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
  const copyStyle = {
    "--ticker-duration": `${display.ticker.speedSeconds}s`,
  } as CSSProperties;
  return (
    <div className="ticker-surface">
      <strong>UPDATE</strong>
      <div className="ticker-copy-window">
        <span
          className="ticker-copy"
          key={`${display.cueRevision}-${index}`}
          style={copyStyle}
        >
          {display.ticker.messages[index]}
        </span>
      </div>
    </div>
  );
}

const rosterRoles: PlayerRole[] = ["exp", "jungle", "mid", "gold", "roam"];
const roleLabels: Record<PlayerRole, string> = {
  exp: "EXP Lane",
  jungle: "Jungle",
  mid: "Mid Lane",
  gold: "Gold Lane",
  roam: "Roam",
};
const roleFallbacks: Record<PlayerRole, string> = {
  exp: "EXP",
  jungle: "JGL",
  mid: "MID",
  gold: "GOLD",
  roam: "ROAM",
};

function RoleIcon({
  role,
  variant,
}: {
  role: PlayerRole;
  variant: "hero" | "badge";
}) {
  return (
    <span className={`roster-role-icon is-${variant}`} aria-hidden="true">
      <b>{roleFallbacks[role]}</b>
      <img
        src={`/api/v1/media/roles/${role}`}
        alt=""
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
    </span>
  );
}

function RosterCycle({ display }: { display: DisplayState }) {
  const [frame, setFrame] = useState<RosterFrame>({
    phase: "entering",
    teamIndex: 0,
  });
  const { holdSeconds, transitionSeconds } = display.rosterLoop;
  useEffect(() => {
    if (display.teams.length === 0) return;
    const timer = window.setTimeout(
      () =>
        setFrame((current) =>
          advanceRosterFrame(current, display.teams.length),
        ),
      rosterPhaseDuration(frame.phase, holdSeconds, transitionSeconds),
    );
    return () => window.clearTimeout(timer);
  }, [display.teams.length, frame, holdSeconds, transitionSeconds]);
  if (display.teams.length === 0) return null;
  const team = display.teams[
    frame.teamIndex % display.teams.length
  ] as ManagedTeam;
  const starters = rosterRoles.map((role) =>
    team.starters.find((player) => player.role === role),
  );
  const style = {
    "--roster-transition": `${transitionSeconds * 0.6}s`,
  } as CSSProperties;
  return (
    <section
      className={`roster-surface phase-${frame.phase}`}
      style={style}
      data-team-id={team.id}
    >
      <header className="roster-team">
        <Logo team={team} side="blue" />
        <div>
          <small>Team roster</small>
          <strong>{team.name}</strong>
        </div>
      </header>
      <div className="roster-cards">
        {starters.map((player, index) => {
          if (!player) return null;
          const cardStyle = {
            "--roster-delay": `${index * transitionSeconds * 0.1}s`,
            "--roster-exit-delay": `${(4 - index) * transitionSeconds * 0.1}s`,
          } as CSSProperties;
          return (
            <article key={player.id} style={cardStyle}>
              <div className="roster-photo">
                {player.photoUrl ? (
                  <>
                    <img src={player.photoUrl} alt={player.name} />
                    <RoleIcon role={player.role} variant="badge" />
                  </>
                ) : (
                  <RoleIcon role={player.role} variant="hero" />
                )}
              </div>
              <small>{roleLabels[player.role]}</small>
              <strong>{player.name}</strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RosterOverlay({ display }: { display: DisplayState }) {
  const resetKey = JSON.stringify([display.teams, display.rosterLoop]);
  return <RosterCycle key={resetKey} display={display} />;
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
  else if (surface === "roster") content = <RosterOverlay display={display} />;
  else content = <ResultOverlay draft={draft} display={display} />;
  return (
    <main key={cueKey} className={`display-canvas display-${surface}`}>
      {content}
    </main>
  );
}
