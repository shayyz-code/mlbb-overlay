import {
  currentPhase,
  selectedHeroIds,
  type AssetPackStatus,
  type DraftCommand,
  type DraftSelection,
  type DraftState,
  type Hero,
  type Side,
} from "@shayyz/contracts";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  fetchAssetStatus,
  fetchDraft,
  fetchHeroes,
  sendCommand,
  subscribeToDraft,
} from "./api";
import { HeroMedia } from "./HeroMedia";

type WithoutRevision<T> = T extends unknown
  ? Omit<T, "expectedRevision">
  : never;
type DraftCommandInput = WithoutRevision<DraftCommand>;

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function effectiveTimer(state: DraftState): number {
  if (!state.timer.running || state.timer.startedAt === null)
    return state.timer.remainingSeconds;
  return Math.max(
    0,
    state.timer.remainingSeconds -
      Math.floor((Date.now() - state.timer.startedAt) / 1000),
  );
}

function useDraft() {
  const [state, setState] = useState<DraftState>();
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [assets, setAssets] = useState<AssetPackStatus>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("shayyz-control-token") ?? "",
  );

  useEffect(() => {
    Promise.all([fetchDraft(), fetchHeroes(), fetchAssetStatus()])
      .then(([draft, catalog, assetStatus]) => {
        setState(draft);
        setHeroes(catalog);
        setAssets(assetStatus);
      })
      .catch((reason: Error) => setError(reason.message));
    return subscribeToDraft(setState, setConnected);
  }, []);

  const dispatch = async (command: DraftCommandInput) => {
    if (!state) return;
    setError("");
    try {
      setState(
        await sendCommand(
          { ...command, expectedRevision: state.revision } as DraftCommand,
          token,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Command failed.");
      setState(await fetchDraft());
    }
  };

  const saveToken = (value: string) => {
    setToken(value);
    sessionStorage.setItem("shayyz-control-token", value);
  };

  return {
    state,
    heroes,
    assets,
    connected,
    error,
    token,
    saveToken,
    dispatch,
  };
}

function HeroMark({
  hero,
  selection,
}: {
  hero?: Hero | undefined;
  selection?: DraftSelection | null | undefined;
}) {
  const name = hero?.name ?? "Open";
  return (
    <div
      className={`hero-mark ${selection ? "is-locked" : ""}`}
      style={{ "--hero-seed": hero?.id.length ?? 1 } as CSSProperties}
    >
      <HeroMedia
        key={hero?.id ?? "empty"}
        hero={hero}
        fallback={hero ? initials(hero.name) : "+"}
      />
      {selection?.source === "detector" && <small>AI</small>}
      <strong>{name}</strong>
    </div>
  );
}

function TeamDraft({
  state,
  side,
  heroes,
  cueUrls,
}: {
  state: DraftState;
  side: Side;
  heroes: Map<string, Hero>;
  cueUrls?: Record<string, string> | undefined;
}) {
  const team = state.teams[side];
  const phase = currentPhase(state);
  const active = phase?.side === side;
  const cueId = phase
    ? `${side}${phase.kind === "pick" ? "Pick" : "Ban"}`
    : undefined;
  const cueUrl = active && cueId ? cueUrls?.[cueId] : undefined;
  return (
    <section className={`team-draft team-${side} ${active ? "is-active" : ""}`}>
      {cueUrl && <img className="phase-cue" src={cueUrl} alt="" />}
      <header>
        <div className="team-emblem">{initials(team.shortName)}</div>
        <div>
          <small>{side === "blue" ? "First pick" : "Second pick"}</small>
          <h2>{team.name}</h2>
        </div>
      </header>
      <div className="ban-row">
        {state.selections[side].bans.map((selection, index) => (
          <HeroMark
            key={`ban-${side}-${index}`}
            selection={selection}
            hero={selection ? heroes.get(selection.heroId) : undefined}
          />
        ))}
      </div>
      <div className="pick-row">
        {state.selections[side].picks.map((selection, index) => (
          <HeroMark
            key={`pick-${side}-${index}`}
            selection={selection}
            hero={selection ? heroes.get(selection.heroId) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function TeamEditor({
  state,
  side,
  dispatch,
}: {
  state: DraftState;
  side: Side;
  dispatch: (command: DraftCommandInput) => void;
}) {
  const team = state.teams[side];
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.shortName);
  useEffect(() => {
    setName(team.name);
    setShortName(team.shortName);
  }, [team]);

  const save = () =>
    dispatch({ type: "set-team", side, team: { ...team, name, shortName } });
  return (
    <div className={`team-editor team-${side}`}>
      <span className="team-dot" />
      <label>
        Team name
        <input
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          onBlur={save}
        />
      </label>
      <label>
        Tag
        <input
          value={shortName}
          maxLength={8}
          onChange={(event) => setShortName(event.target.value.toUpperCase())}
          onBlur={save}
        />
      </label>
    </div>
  );
}

function ControlPage() {
  const { state, heroes, assets, connected, error, token, saveToken, dispatch } =
    useDraft();
  const [query, setQuery] = useState("");
  const used = useMemo(
    () => (state ? selectedHeroIds(state) : new Set<string>()),
    [state],
  );
  const visibleHeroes = heroes.filter((hero) =>
    hero.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  if (!state)
    return <div className="loading-screen">Loading broadcast system…</div>;
  const phase = currentPhase(state);
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
          <a className="active" href="/control/draft">
            Draft control
          </a>
          <a href="/overlay/draft" target="_blank" rel="noreferrer">
            Open OBS view
          </a>
        </nav>
        <div className="system-card">
          <span className={`status-light ${connected ? "online" : ""}`} />
          <div>
            <strong>{connected ? "Live sync" : "Reconnecting"}</strong>
            <small>Revision {state.revision}</small>
            <small>
              {assets?.enabled
                ? `${assets.displayName}: ${assets.coverage.portraits}/${assets.coverage.heroes} portraits · ${assets.coverage.posters} posters · ${assets.coverage.voices} voices`
                : "Private media pack not loaded"}
            </small>
          </div>
        </div>
        <label className="token-field">
          LAN control token
          <input
            type="password"
            value={token}
            placeholder="Only required on LAN"
            onChange={(event) => saveToken(event.target.value)}
          />
        </label>
        <p className="legal-note">
          Unofficial community project. Game media requires separate permission.
        </p>
      </aside>

      <section className="control-main">
        <header className="control-header">
          <div>
            <small>Live operations</small>
            <h1>Draft Command Center</h1>
          </div>
          <div className="header-actions">
            <button type="button" onClick={() => dispatch({ type: "undo" })}>
              Undo
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "swap-sides" })}
            >
              Swap sides
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => dispatch({ type: "reset" })}
            >
              Reset draft
            </button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}
        <div className="team-editors">
          <TeamEditor state={state} side="blue" dispatch={dispatch} />
          <TeamEditor state={state} side="red" dispatch={dispatch} />
        </div>

        <div className="phase-strip">
          <div>
            <small>Current phase</small>
            <strong>
              {phase
                ? `${phase.side.toUpperCase()} ${phase.kind.toUpperCase()} ${phase.slot + 1}`
                : "DRAFT COMPLETE"}
            </strong>
          </div>
          <div className="progress-track">
            <span
              style={{
                width: `${(state.phaseIndex / state.format.phases.length) * 100}%`,
              }}
            />
          </div>
          <div className="timer-controls">
            <strong>{effectiveTimer(state)}s</strong>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: state.timer.running ? "pause-timer" : "start-timer",
                })
              }
            >
              {state.timer.running ? "Pause" : "Start"}
            </button>
            <select
              value={state.timer.durationSeconds}
              onChange={(event) =>
                dispatch({
                  type: "set-timer",
                  durationSeconds: Number(event.target.value),
                })
              }
            >
              <option value="30">30 sec</option>
              <option value="45">45 sec</option>
              <option value="60">60 sec</option>
              <option value="90">90 sec</option>
            </select>
          </div>
        </div>

        <div className="workspace-grid">
          <section className="hero-library">
            <div className="panel-heading">
              <div>
                <small>Selection pool</small>
                <h2>Heroes</h2>
              </div>
              <input
                type="search"
                value={query}
                placeholder="Search heroes"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="hero-grid">
              {visibleHeroes.map((hero) => (
                <button
                  type="button"
                  key={hero.id}
                  disabled={!phase || used.has(hero.id)}
                  onClick={() =>
                    dispatch({
                      type: "select-hero",
                      heroId: hero.id,
                      source: "manual",
                    })
                  }
                >
                  <HeroMark hero={hero} />
                  <span>{used.has(hero.id) ? "Locked" : "Select"}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="draft-preview">
            <div className="panel-heading">
              <div>
                <small>Operator preview</small>
                <h2>Draft state</h2>
              </div>
            </div>
            <TeamDraft
              state={state}
              side="blue"
              heroes={new Map(heroes.map((hero) => [hero.id, hero]))}
              cueUrls={assets?.cueUrls}
            />
            <div className="versus-divider">
              <span>VS</span>
              <small>
                {state.phaseIndex} / {state.format.phases.length}
              </small>
            </div>
            <TeamDraft
              state={state}
              side="red"
              heroes={new Map(heroes.map((hero) => [hero.id, hero]))}
              cueUrls={assets?.cueUrls}
            />
          </section>
        </div>
      </section>
    </main>
  );
}

function OverlayPage() {
  const { state, heroes, assets, connected } = useDraft();
  const [, rerender] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => rerender((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  if (!state) return null;

  const catalog = new Map(heroes.map((hero) => [hero.id, hero]));
  const phase = currentPhase(state);
  return (
    <main className="overlay-canvas">
      <div className="overlay-grid" />
      <header className="overlay-header">
        <div className="overlay-brand">
          <span>S</span>
          <div>
            <strong>SHAYYZ</strong>
            <small>MLBB OVERLAY</small>
          </div>
        </div>
        <div className="phase-display">
          <small>
            {state.status === "complete"
              ? "Draft locked"
              : `${phase?.side ?? ""} ${phase?.kind ?? ""}`}
          </small>
          <strong>{String(effectiveTimer(state)).padStart(2, "0")}</strong>
          <span className={connected ? "online" : ""}>
            {connected ? "LIVE" : "SYNC"}
          </span>
        </div>
        <div className="format-label">
          <small>Competitive draft</small>
          <strong>{state.format.name}</strong>
        </div>
      </header>
      <div className="overlay-teams">
        <TeamDraft
          state={state}
          side="blue"
          heroes={catalog}
          cueUrls={assets?.cueUrls}
        />
        <div className="overlay-versus">
          <span>VS</span>
          <small>
            {state.phaseIndex + 1 > state.format.phases.length
              ? state.format.phases.length
              : state.phaseIndex + 1}
          </small>
        </div>
        <TeamDraft
          state={state}
          side="red"
          heroes={catalog}
          cueUrls={assets?.cueUrls}
        />
      </div>
      <footer className="overlay-footer">
        <span>UNOFFICIAL COMMUNITY BROADCAST</span>
        <strong>
          {phase
            ? `${phase.side.toUpperCase()} ${phase.kind.toUpperCase()}`
            : "READY FOR BATTLE"}
        </strong>
        <span>SHAYYZ.GG / LOCAL</span>
      </footer>
    </main>
  );
}

export function App() {
  return window.location.pathname.startsWith("/overlay") ? (
    <OverlayPage />
  ) : (
    <ControlPage />
  );
}
