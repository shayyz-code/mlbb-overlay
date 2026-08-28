import {
  currentPhase,
  type DraftSelection,
  type DraftState,
  type Hero,
  type Side,
} from "@shayyz/contracts";
import { HeroMedia } from "./HeroMedia";
import "./overlay-theme.css";
import "./compact-draft-overlay.css";

interface CompactDraftOverlayProps {
  state: DraftState;
  heroes: Hero[];
  eventName: string;
  connected: boolean;
  remainingSeconds: number;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timerLabel(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function orderedSlots(selections: Array<DraftSelection | null>, side: Side) {
  const slots = selections.map((selection, slot) => ({ selection, slot }));
  return side === "red" ? slots.reverse() : slots;
}

function TeamLogo({ state, side }: { state: DraftState; side: Side }) {
  const team = state.teams[side];
  return (
    <div className={`compact-team-logo compact-team-logo-${side}`}>
      <span>{initials(team.shortName)}</span>
      {team.logoUrl && (
        <img
          src={team.logoUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
    </div>
  );
}

function BanSlot({
  state,
  side,
  slot,
  selection,
  heroes,
}: {
  state: DraftState;
  side: Side;
  slot: number;
  selection: DraftSelection | null;
  heroes: Map<string, Hero>;
}) {
  const phase = currentPhase(state);
  const active =
    phase?.side === side && phase.kind === "ban" && phase.slot === slot;
  const hero = selection ? heroes.get(selection.heroId) : undefined;
  return (
    <div
      className={`compact-ban-slot ${selection ? "is-locked" : ""} ${active ? "is-active" : ""}`}
      role="img"
      aria-label={hero ? `${hero.name} banned` : `${side} ban ${slot + 1}`}
    >
      <HeroMedia
        hero={hero}
        fallback={hero ? initials(hero.name) : String(slot + 1)}
      />
      <span>{slot + 1}</span>
    </div>
  );
}

function TeamHeader({
  state,
  side,
  heroes,
}: {
  state: DraftState;
  side: Side;
  heroes: Map<string, Hero>;
}) {
  const bans = (
    <div className="compact-ban-grid">
      {orderedSlots(state.selections[side].bans, side).map(
        ({ selection, slot }) => (
          <BanSlot
            key={`${side}-ban-${slot}`}
            state={state}
            side={side}
            slot={slot}
            selection={selection}
            heroes={heroes}
          />
        ),
      )}
    </div>
  );
  const name = (
    <div className="compact-team-name">
      <small>{side === "blue" ? "First pick" : "Second pick"}</small>
      <strong>{state.teams[side].name}</strong>
    </div>
  );
  return (
    <section className={`compact-team-header compact-${side}`}>
      {side === "blue" ? (
        <>
          {bans}
          {name}
        </>
      ) : (
        <>
          {name}
          {bans}
        </>
      )}
    </section>
  );
}

function PickSlot({
  state,
  side,
  slot,
  selection,
  heroes,
}: {
  state: DraftState;
  side: Side;
  slot: number;
  selection: DraftSelection | null;
  heroes: Map<string, Hero>;
}) {
  const phase = currentPhase(state);
  const active =
    phase?.side === side && phase.kind === "pick" && phase.slot === slot;
  const hero = selection ? heroes.get(selection.heroId) : undefined;
  return (
    <div
      className={`compact-pick-slot compact-${side} ${selection ? "is-locked" : ""} ${active ? "is-active" : ""}`}
    >
      <div className="compact-pick-media">
        <HeroMedia
          hero={hero}
          fallback={hero ? initials(hero.name) : String(slot + 1)}
        />
        {selection?.source === "detector" && <small>AI</small>}
      </div>
      <div className="compact-pick-name">
        {hero?.name ?? `Open slot ${slot + 1}`}
      </div>
    </div>
  );
}

function TeamPicks({
  state,
  side,
  heroes,
}: {
  state: DraftState;
  side: Side;
  heroes: Map<string, Hero>;
}) {
  return (
    <section className={`compact-team-picks compact-${side}`}>
      {orderedSlots(state.selections[side].picks, side).map(
        ({ selection, slot }) => (
          <PickSlot
            key={`${side}-pick-${slot}`}
            state={state}
            side={side}
            slot={slot}
            selection={selection}
            heroes={heroes}
          />
        ),
      )}
    </section>
  );
}

function DraftCenter({
  state,
  connected,
  remainingSeconds,
}: Omit<CompactDraftOverlayProps, "heroes" | "eventName">) {
  const phase = currentPhase(state);
  const timerProgress = Math.max(
    0,
    Math.min(1, remainingSeconds / state.timer.durationSeconds),
  );
  const phaseLabel = phase
    ? `${phase.side} ${phase.kind} ${phase.slot + 1}`
    : "Draft complete";
  return (
    <section className="compact-draft-center">
      <div className="compact-center-score">
        <TeamLogo state={state} side="blue" />
        <strong className="compact-score compact-score-blue">
          {state.scoreboard.scores.blue}
        </strong>
        <span className="compact-versus">VS</span>
        <strong className="compact-score compact-score-red">
          {state.scoreboard.scores.red}
        </strong>
        <TeamLogo state={state} side="red" />
      </div>
      <div className="compact-phase-row">
        <strong>{phaseLabel}</strong>
        <span className={connected ? "is-online" : ""}>
          {connected ? "Connected" : "Sync"}
        </span>
      </div>
      <div className="compact-timer">
        <div className="compact-timer-track">
          <span style={{ width: `${timerProgress * 100}%` }} />
        </div>
        <div>
          <small>{state.timer.running ? "Draft timer" : "Timer paused"}</small>
          <strong>{timerLabel(remainingSeconds)}</strong>
        </div>
      </div>
    </section>
  );
}

export function CompactDraftOverlay({
  state,
  heroes,
  eventName,
  connected,
  remainingSeconds,
}: CompactDraftOverlayProps) {
  const catalog = new Map(heroes.map((hero) => [hero.id, hero]));
  return (
    <main className="compact-draft-canvas" aria-label="Draft overlay">
      <div className="compact-draft-strip">
        <header className="compact-draft-header">
          <TeamHeader state={state} side="blue" heroes={catalog} />
          <div className="compact-draft-title">
            <strong>{eventName}</strong>
          </div>
          <TeamHeader state={state} side="red" heroes={catalog} />
        </header>
        <div className="compact-draft-lower">
          <TeamPicks state={state} side="blue" heroes={catalog} />
          <DraftCenter
            state={state}
            connected={connected}
            remainingSeconds={remainingSeconds}
          />
          <TeamPicks state={state} side="red" heroes={catalog} />
        </div>
      </div>
    </main>
  );
}
