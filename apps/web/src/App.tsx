import {
  type AssetPackStatus,
  currentPhase,
  type DetectorMode,
  type DetectorStatus,
  type DraftCommand,
  type DraftSelection,
  type DraftState,
  type Hero,
  type Side,
  selectedHeroIds,
} from "@shayyz/contracts";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchAssetStatus,
  fetchDetectorStatus,
  fetchDraft,
  fetchHeroes,
  reviewDetectorProposal,
  sendCommand,
  setDetectorMode,
  setDetectorRunning,
  subscribeToDraft,
  uploadTeamLogo,
} from "./api";
import { CalibrationWizard } from "./CalibrationWizard";
import { CompactDraftOverlay } from "./CompactDraftOverlay";
import { operatorPhaseLabel } from "./draft-turn";
import { HeroMedia } from "./HeroMedia";
import { newestAddedHeroId } from "./voice";

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

function useDraft(loadCatalog = true) {
  const [state, setState] = useState<DraftState>();
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [assets, setAssets] = useState<AssetPackStatus>();
  const [connected, setConnected] = useState(false);
  const [draftEvent, setDraftEvent] = useState<{
    revision: number;
    source: "snapshot" | "update";
  }>();
  const [error, setError] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("shayyz-control-token") ?? "",
  );

  useEffect(() => {
    void fetchDraft()
      .then(setState)
      .catch((reason: Error) => setError(reason.message));
    if (loadCatalog)
      void Promise.all([fetchHeroes(), fetchAssetStatus()])
        .then(([catalog, assetStatus]) => {
          setHeroes(catalog);
          setAssets(assetStatus);
        })
        .catch((reason: Error) => setError(reason.message));
    return subscribeToDraft((draft, source) => {
      setState(draft);
      setDraftEvent({ revision: draft.revision, source });
    }, setConnected);
  }, [loadCatalog]);

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
    draftEvent,
    connected,
    error,
    token,
    saveToken,
    dispatch,
  };
}

function useHeroVoice(
  state: DraftState | undefined,
  heroes: Hero[],
  event: { revision: number; source: "snapshot" | "update" } | undefined,
) {
  const previous = useRef<DraftState | undefined>(undefined);
  const activeAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!state) return;
    const prior = previous.current;
    previous.current = state;
    if (
      !prior ||
      event?.source !== "update" ||
      event.revision !== state.revision ||
      !state.presentation.voiceEnabled
    )
      return;
    const heroId = newestAddedHeroId(prior, state);
    const voiceUrl = heroes.find((hero) => hero.id === heroId)?.voiceUrl;
    if (!voiceUrl) return;
    activeAudio.current?.pause();
    const audio = new Audio(voiceUrl);
    activeAudio.current = audio;
    void audio.play().catch(() => undefined);
  }, [event, heroes, state]);
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

function TeamLogo({ side, state }: { side: Side; state: DraftState }) {
  const team = state.teams[side];
  return (
    <div className={`scoreboard-logo scoreboard-logo-${side}`}>
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

function ScoreboardTeamEditor({
  state,
  side,
  token,
  dispatch,
}: {
  state: DraftState;
  side: Side;
  token: string;
  dispatch: (command: DraftCommandInput) => Promise<void>;
}) {
  const team = state.teams[side];
  const score = state.scoreboard.scores[side];
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.shortName);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    setName(team.name);
    setShortName(team.shortName);
  }, [team.name, team.shortName]);

  const saveTeam = () => {
    const nextName = name.trim();
    const nextShortName = shortName.trim();
    if (!nextName || !nextShortName) return;
    if (nextName === team.name && nextShortName === team.shortName) return;
    void dispatch({
      type: "set-team",
      side,
      team: { ...team, name: nextName, shortName: nextShortName },
    });
  };
  const setScore = (nextScore: number) =>
    dispatch({
      type: "set-scoreboard-score",
      side,
      score: Math.min(99, Math.max(0, nextScore)),
    });
  const selectLogo = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const result = await uploadTeamLogo(side, file, token);
      await dispatch({
        type: "set-team",
        side,
        team: { ...team, logoUrl: result.logoUrl },
      });
    } catch (reason) {
      setUploadError(
        reason instanceof Error ? reason.message : "Logo upload failed.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className={`scoreboard-team-card team-${side}`}>
      <header>
        <TeamLogo side={side} state={state} />
        <div>
          <small>{side} side</small>
          <strong>{team.shortName}</strong>
        </div>
      </header>
      <div className="scoreboard-team-fields">
        <label>
          Team name
          <input
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveTeam}
          />
        </label>
        <label>
          Tag
          <input
            value={shortName}
            maxLength={8}
            onChange={(event) => setShortName(event.target.value.toUpperCase())}
            onBlur={saveTeam}
          />
        </label>
      </div>
      <label className="logo-upload">
        <span>{uploading ? "Uploading…" : "Upload local logo"}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) => void selectLogo(event.target.files?.[0])}
        />
      </label>
      {uploadError && <p className="scoreboard-card-error">{uploadError}</p>}
      <div className="score-editor">
        <button
          type="button"
          aria-label={`Decrease ${team.name} score`}
          disabled={score === 0}
          onClick={() => void setScore(score - 1)}
        >
          −
        </button>
        <label>
          Series score
          <input
            type="number"
            min="0"
            max="99"
            value={score}
            onChange={(event) => void setScore(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          aria-label={`Increase ${team.name} score`}
          disabled={score === 99}
          onClick={() => void setScore(score + 1)}
        >
          +
        </button>
      </div>
    </section>
  );
}

function DetectorPanel({ heroes, token }: { heroes: Hero[]; token: string }) {
  const [status, setStatus] = useState<DetectorStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  useEffect(() => {
    const refresh = () =>
      fetchDetectorStatus()
        .then(setStatus)
        .catch((reason: Error) => setError(reason.message));
    refresh();
    const timer = window.setInterval(refresh, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setStatus(await fetchDetectorStatus());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Detector action failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!status) return null;
  const proposal = status.pendingProposal;
  const hero = heroes.find((item) => item.id === proposal?.heroId);
  return (
    <section className="detector-panel">
      <div className="detector-heading">
        <div>
          <small>Opt-in visual beta</small>
          <h2>OBS Draft Detector</h2>
        </div>
        <span className={`detector-state ${status.running ? "online" : ""}`}>
          {status.running ? "Scanning" : "Stopped"}
        </span>
      </div>
      <div className="detector-controls">
        <label>
          Detection mode
          <select
            value={status.mode}
            disabled={busy}
            onChange={(event) =>
              run(async () => {
                setStatus(
                  await setDetectorMode(
                    event.target.value as DetectorMode,
                    token,
                  ),
                );
              })
            }
          >
            <option value="off">Off</option>
            <option value="proposal">Proposals only</option>
            <option value="confidence-tiered">Confidence-tiered</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || status.mode === "off" || !status.profileConfigured}
          onClick={() => run(() => setDetectorRunning(!status.running, token))}
        >
          {status.running ? "Stop detector" : "Start detector"}
        </button>
        <button
          type="button"
          disabled={busy || status.running}
          onClick={() => setCalibrating(!calibrating)}
        >
          {calibrating ? "Hide calibration" : "Calibrate"}
        </button>
        <div className="detector-readiness">
          <small>References</small>
          <strong>
            {status.referenceCount} / {status.expectedReferenceCount}
          </strong>
          <span className={status.automaticReady ? "ready" : ""}>
            {status.automaticReady ? "Automatic ready" : "Proposal fallback"}
          </span>
        </div>
      </div>
      {(error || status.lastError) && (
        <p className="detector-error">{error || status.lastError}</p>
      )}
      {!status.profileConfigured && (
        <p className="detector-hint">
          Calibrate a local profile before starting. Automatic application stays
          locked until all 133 references are validated.
        </p>
      )}
      {proposal && (
        <div className="detector-proposal">
          <HeroMark hero={hero} />
          <div>
            <small>Recognition proposal</small>
            <strong>{hero?.name ?? proposal.heroId}</strong>
            <span>
              {proposal.side} {proposal.kind} {proposal.slot + 1} · confidence{" "}
              {(proposal.confidence * 100).toFixed(1)}% · margin{" "}
              {(proposal.runnerUpMargin * 100).toFixed(1)}% ·{" "}
              {proposal.evidenceFrames} frames
            </span>
          </div>
          <div className="proposal-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => reviewDetectorProposal(proposal.id, "reject", token))
              }
            >
              Reject
            </button>
            <button
              type="button"
              className="accept"
              disabled={busy}
              onClick={() =>
                run(() => reviewDetectorProposal(proposal.id, "accept", token))
              }
            >
              Accept hero
            </button>
          </div>
        </div>
      )}
      {calibrating && (
        <CalibrationWizard
          token={token}
          referenceCount={status.referenceCount}
          onClose={() => setCalibrating(false)}
        />
      )}
    </section>
  );
}

function ControlPage() {
  const {
    state,
    heroes,
    assets,
    connected,
    error,
    token,
    saveToken,
    dispatch,
  } = useDraft();
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
          <a href="/control/scoreboard">Scoreboard control</a>
          <a href="/overlay/draft" target="_blank" rel="noreferrer">
            Open draft view
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
        <label className="voice-setting">
          <input
            type="checkbox"
            checked={state.presentation.voiceEnabled}
            onChange={(event) =>
              dispatch({
                type: "set-presentation",
                presentation: { voiceEnabled: event.target.checked },
              })
            }
          />
          <span>
            <strong>Hero voice lines</strong>
            <small>Off by default · OBS only</small>
          </span>
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
              {operatorPhaseLabel(state.format, state.phaseIndex)}
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

        <DetectorPanel heroes={heroes} token={token} />

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

function ScoreboardControlPage() {
  const { state, connected, error, token, saveToken, dispatch } =
    useDraft(false);
  if (!state)
    return <div className="loading-screen">Loading scoreboard system…</div>;

  return (
    <main className="control-shell scoreboard-control-shell">
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
          <a className="active" href="/control/scoreboard">
            Scoreboard control
          </a>
          <a href="/overlay/scoreboard" target="_blank" rel="noreferrer">
            Open scoreboard view
          </a>
        </nav>
        <div className="system-card">
          <span className={`status-light ${connected ? "online" : ""}`} />
          <div>
            <strong>{connected ? "Live sync" : "Reconnecting"}</strong>
            <small>Revision {state.revision}</small>
            <small>Manual scoreboard control</small>
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
          Team logos stay in local runtime storage and are not committed.
        </p>
      </aside>

      <section className="control-main scoreboard-control-main">
        <header className="control-header">
          <div>
            <small>Live operations</small>
            <h1>Scoreboard Control</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              onClick={() => void dispatch({ type: "undo" })}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => void dispatch({ type: "swap-sides" })}
            >
              Swap sides
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => void dispatch({ type: "reset-scoreboard" })}
            >
              Reset scores
            </button>
          </div>
        </header>
        {error && <div className="error-banner">{error}</div>}
        <p className="scoreboard-instruction">
          Changes update the browser source immediately. OBS visibility remains
          fully manual.
        </p>
        <div className="scoreboard-team-grid">
          <ScoreboardTeamEditor
            state={state}
            side="blue"
            token={token}
            dispatch={dispatch}
          />
          <ScoreboardTeamEditor
            state={state}
            side="red"
            token={token}
            dispatch={dispatch}
          />
        </div>
        <section className="scoreboard-obs-card">
          <div>
            <small>Browser source</small>
            <strong>/overlay/scoreboard</strong>
            <span>1920 × 1080 · transparent background</span>
          </div>
          <a href="/overlay/scoreboard" target="_blank" rel="noreferrer">
            Open local preview
          </a>
        </section>
      </section>
    </main>
  );
}

function ScoreboardOverlayPage() {
  const { state } = useDraft(false);
  if (!state) return null;
  return (
    <main className="scoreboard-canvas" aria-label="Match scoreboard">
      <div className="scoreboard-top-rail" />
      <TeamLogo side="blue" state={state} />
      <div className="scoreboard-name scoreboard-name-blue">
        <span>{state.teams.blue.name}</span>
      </div>
      <div className="scoreboard-score scoreboard-score-blue">
        {state.scoreboard.scores.blue}
      </div>
      <div className="scoreboard-center">
        <span>S</span>
        <strong>SHAYYZ</strong>
      </div>
      <div className="scoreboard-score scoreboard-score-red">
        {state.scoreboard.scores.red}
      </div>
      <div className="scoreboard-name scoreboard-name-red">
        <span>{state.teams.red.name}</span>
      </div>
      <TeamLogo side="red" state={state} />
    </main>
  );
}

function OverlayPage() {
  const { state, heroes, connected, draftEvent } = useDraft();
  const [, rerender] = useState(0);
  useHeroVoice(state, heroes, draftEvent);
  useEffect(() => {
    const timer = window.setInterval(() => rerender((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  if (!state) return null;

  return (
    <CompactDraftOverlay
      state={state}
      heroes={heroes}
      connected={connected}
      remainingSeconds={effectiveTimer(state)}
    />
  );
}

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/overlay/scoreboard")) return <ScoreboardOverlayPage />;
  if (path.startsWith("/overlay")) return <OverlayPage />;
  if (path.startsWith("/control/scoreboard")) return <ScoreboardControlPage />;
  return <ControlPage />;
}
