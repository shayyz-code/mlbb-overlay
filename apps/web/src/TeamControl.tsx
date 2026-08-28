import type {
  DisplaySettings,
  DisplayState,
  ManagedTeam,
  PlayerRole,
} from "@shayyz/contracts";
import { useEffect, useRef, useState } from "react";
import {
  DisplayCommandError,
  fetchDisplay,
  sendDisplayCommand,
  subscribeToDisplay,
  uploadPlayerPhoto,
  uploadTeamLogo,
} from "./api";
import { OrganizerSidebar } from "./OrganizerShell";
import "./team-control.css";

const roles: PlayerRole[] = ["exp", "jungle", "mid", "gold", "roam"];
type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

function sameTeams(left: ManagedTeam[], right: ManagedTeam[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function settings(state: DisplayState): DisplaySettings {
  const { revision: _, updatedAt: __, ...value } = state;
  return value;
}

function createTeam(): ManagedTeam {
  const id = crypto.randomUUID();
  return {
    id,
    name: "New Team",
    shortName: "TEAM",
    logoUrl: "",
    starters: roles.map((role) => ({
      id: crypto.randomUUID(),
      name: role.toUpperCase(),
      role,
      photoUrl: "",
    })),
    substitutes: [],
  };
}

export function TeamControlPage() {
  const [display, setDisplay] = useState<DisplayState>();
  const [working, setWorking] = useState<DisplaySettings>();
  const [selectedId, setSelectedId] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("shayyz-control-token") ?? "",
  );
  const displayRef = useRef<DisplayState | undefined>(undefined);
  const workingRef = useRef<DisplaySettings | undefined>(undefined);
  const baselineTeamsRef = useRef<ManagedTeam[]>([]);
  const pendingTeamsRef = useRef<ManagedTeam[] | undefined>(undefined);
  const editVersionRef = useRef(0);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  useEffect(() => {
    void fetchDisplay().then((state) => {
      displayRef.current = state;
      workingRef.current = settings(state);
      baselineTeamsRef.current = state.teams;
      setDisplay(state);
      setWorking(settings(state));
      setSelectedId(state.teams[0]?.id ?? "");
    });
    return subscribeToDisplay((state) => {
      displayRef.current = state;
      setDisplay(state);
      if (!dirtyRef.current) {
        const next = settings(state);
        workingRef.current = next;
        baselineTeamsRef.current = state.teams;
        setWorking(next);
        setSelectedId((current) =>
          state.teams.some((team) => team.id === current)
            ? current
            : (state.teams[0]?.id ?? ""),
        );
      } else if (
        !sameTeams(state.teams, baselineTeamsRef.current) &&
        !(
          savingRef.current &&
          pendingTeamsRef.current &&
          sameTeams(state.teams, pendingTeamsRef.current)
        )
      ) {
        baselineTeamsRef.current = state.teams;
        conflictRef.current = true;
        setSaveState("conflict");
        setError("Teams changed in another control. Choose which version to keep.");
      }
    }, setConnected);
  }, []);
  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, []);
  useEffect(() => {
    if (
      !working ||
      !dirtyRef.current ||
      savingRef.current ||
      saveState === "error" ||
      saveState === "conflict"
    )
      return;
    const timeout = window.setTimeout(async () => {
      const currentDisplay = displayRef.current;
      const currentWorking = workingRef.current;
      if (!currentDisplay || !currentWorking) return;
      const version = editVersionRef.current;
      const teams = structuredClone(currentWorking.teams);
      savingRef.current = true;
      pendingTeamsRef.current = teams;
      setSaveState("saving");
      setError("");
      try {
        const saved = await sendDisplayCommand(
          {
            type: "set-team-directory",
            expectedRevision: currentDisplay.revision,
            teams,
          },
          token,
        );
        displayRef.current = saved;
        baselineTeamsRef.current = saved.teams;
        setDisplay(saved);
        if (conflictRef.current) setSaveState("conflict");
        else if (version === editVersionRef.current) {
          const next = settings(saved);
          workingRef.current = next;
          dirtyRef.current = false;
          conflictRef.current = false;
          setWorking(next);
          setSaveState("saved");
        } else setSaveState("dirty");
      } catch (reason) {
        if (reason instanceof DisplayCommandError && reason.status === 409) {
          const latest = await fetchDisplay();
          displayRef.current = latest;
          setDisplay(latest);
          if (sameTeams(latest.teams, baselineTeamsRef.current))
            setSaveState("dirty");
          else {
            baselineTeamsRef.current = latest.teams;
            conflictRef.current = true;
            setSaveState("conflict");
            setError(
              "Teams changed in another control. Choose which version to keep.",
            );
          }
        } else {
          setSaveState("error");
          setError(reason instanceof Error ? reason.message : "Team save failed.");
        }
      } finally {
        savingRef.current = false;
        pendingTeamsRef.current = undefined;
      }
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [saveState, token, working]);
  if (!display || !working)
    return <div className="loading-screen">Loading team directory…</div>;
  const selected = working.teams.find((team) => team.id === selectedId);
  const selectedIndex = working.teams.findIndex(
    (team) => team.id === selectedId,
  );
  const referencedMatches = selected
    ? display.schedule.filter(
        (match) =>
          match.blueTeamId === selected.id || match.redTeamId === selected.id,
      )
    : [];
  const setTeams = (teams: ManagedTeam[]) => {
    const next = {
      ...working,
      teams,
    };
    workingRef.current = next;
    dirtyRef.current = true;
    editVersionRef.current += 1;
    setWorking(next);
    if (!conflictRef.current && !savingRef.current) {
      setError("");
      setSaveState("dirty");
    }
  };
  const change = (team: ManagedTeam) =>
    setTeams(working.teams.map((item) => (item.id === team.id ? team : item)));
  const moveSelected = (offset: -1 | 1) => {
    const target = selectedIndex + offset;
    if (selectedIndex < 0 || target < 0 || target >= working.teams.length)
      return;
    const teams = [...working.teams];
    const selectedTeam = teams[selectedIndex];
    const targetTeam = teams[target];
    if (!selectedTeam || !targetTeam) return;
    teams[selectedIndex] = targetTeam;
    teams[target] = selectedTeam;
    setTeams(teams);
  };
  const retrySave = () => {
    conflictRef.current = false;
    setError("");
    setSaveState("dirty");
  };
  const useSavedTeams = () => {
    const next = settings(displayRef.current ?? display);
    workingRef.current = next;
    baselineTeamsRef.current = next.teams;
    dirtyRef.current = false;
    conflictRef.current = false;
    setWorking(next);
    setSelectedId((current) =>
      next.teams.some((team) => team.id === current)
        ? current
        : (next.teams[0]?.id ?? ""),
    );
    setError("");
    setSaveState("saved");
  };
  const saveLabel = {
    saved: "Saved",
    dirty: "Waiting to save…",
    saving: "Saving…",
    error: "Save failed",
    conflict: "Save conflict",
  }[saveState];
  return (
    <main className="control-shell">
      <OrganizerSidebar
        active="teams"
        connected={connected}
        statusLines={<small>{working.teams.length} managed teams</small>}
        token={token}
        onTokenChange={(value) => {
          setToken(value);
          sessionStorage.setItem("shayyz-control-token", value);
        }}
      />
      <section className="control-main team-control-main">
        <header className="control-header">
          <div>
            <small>Organizer setup</small>
            <h1>Team Setup</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              onClick={() => {
                const team = createTeam();
                setTeams([...working.teams, team]);
                setSelectedId(team.id);
              }}
            >
              Add team
            </button>
            <span className={`autosave-state ${saveState}`} role="status">
              {saveLabel}
            </span>
          </div>
        </header>
        {error && (
          <div className="error-banner autosave-error">
            <span>{error}</span>
            {(saveState === "error" || saveState === "conflict") && (
              <button type="button" onClick={retrySave}>
                Keep my changes
              </button>
            )}
            {saveState === "conflict" && (
              <button type="button" onClick={useSavedTeams}>
                Reload saved teams
              </button>
            )}
          </div>
        )}
        <div className="team-directory-layout">
          <nav className="team-directory-list" aria-label="Managed teams">
            {working.teams.map((team) => (
              <button
                className={team.id === selectedId ? "active" : ""}
                type="button"
                key={team.id}
                onClick={() => setSelectedId(team.id)}
              >
                <strong>{team.shortName}</strong>
                <span>{team.name}</span>
              </button>
            ))}
          </nav>
          {selected && (
            <section className="team-directory-editor">
              <div className="team-order-actions">
                <span>Roster loop position {selectedIndex + 1}</span>
                <button
                  type="button"
                  disabled={selectedIndex <= 0}
                  onClick={() => moveSelected(-1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={selectedIndex === working.teams.length - 1}
                  onClick={() => moveSelected(1)}
                >
                  Move down
                </button>
              </div>
              <div className="team-identity-fields">
                <label>
                  Team name
                  <input
                    value={selected.name}
                    maxLength={60}
                    onChange={(event) =>
                      change({ ...selected, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Tag
                  <input
                    value={selected.shortName}
                    maxLength={8}
                    onChange={(event) =>
                      change({
                        ...selected,
                        shortName: event.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
                <label className="team-logo-upload">
                  Logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const result = await uploadTeamLogo(
                        selected.id,
                        file,
                        token,
                      );
                      change({ ...selected, logoUrl: result.logoUrl });
                    }}
                  />
                </label>
              </div>
              <h2>Starting five</h2>
              <div className="managed-player-list">
                {selected.starters.map((player, index) => (
                  <div className="managed-starter" key={player.id}>
                    <span>{player.role}</span>
                    <input
                      aria-label={`${player.role} player name`}
                      value={player.name}
                      maxLength={40}
                      onChange={(event) => {
                        const starters = [...selected.starters];
                        starters[index] = {
                          ...player,
                          name: event.target.value,
                        };
                        change({ ...selected, starters });
                      }}
                    />
                    <label className="player-photo-upload">
                      {player.photoUrl ? (
                        <img src={player.photoUrl} alt="" />
                      ) : (
                        <b>{player.name.slice(0, 2).toUpperCase()}</b>
                      )}
                      <span>
                        {player.photoUrl ? "Change photo" : "Add photo"}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          setError("");
                          try {
                            const result = await uploadPlayerPhoto(
                              selected.id,
                              player.id,
                              file,
                              token,
                            );
                            const starters = [...selected.starters];
                            starters[index] = {
                              ...player,
                              photoUrl: result.photoUrl,
                            };
                            change({ ...selected, starters });
                          } catch (reason) {
                            setError(
                              reason instanceof Error
                                ? reason.message
                                : "Photo upload failed.",
                            );
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!player.photoUrl}
                      onClick={() => {
                        const starters = [...selected.starters];
                        starters[index] = { ...player, photoUrl: "" };
                        change({ ...selected, starters });
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ))}
              </div>
              <div className="substitute-heading">
                <h2>Substitutes</h2>
                <button
                  type="button"
                  disabled={selected.substitutes.length >= 5}
                  onClick={() =>
                    change({
                      ...selected,
                      substitutes: [
                        ...selected.substitutes,
                        {
                          id: crypto.randomUUID(),
                          name: `Substitute ${selected.substitutes.length + 1}`,
                          role: null,
                        },
                      ],
                    })
                  }
                >
                  Add substitute
                </button>
              </div>
              <div className="managed-player-list substitutes">
                {selected.substitutes.map((player, index) => (
                  <div key={player.id}>
                    <input
                      value={player.name}
                      maxLength={40}
                      onChange={(event) => {
                        const substitutes = [...selected.substitutes];
                        substitutes[index] = {
                          ...player,
                          name: event.target.value,
                        };
                        change({ ...selected, substitutes });
                      }}
                    />
                    <select
                      value={player.role ?? ""}
                      onChange={(event) => {
                        const substitutes = [...selected.substitutes];
                        substitutes[index] = {
                          ...player,
                          role: (event.target.value ||
                            null) as PlayerRole | null,
                        };
                        change({ ...selected, substitutes });
                      }}
                    >
                      <option value="">Any role</option>
                      {roles.map((role) => (
                        <option value={role} key={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      className="danger"
                      type="button"
                      onClick={() =>
                        change({
                          ...selected,
                          substitutes: selected.substitutes.filter(
                            (item) => item.id !== player.id,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="danger delete-team"
                type="button"
                disabled={referencedMatches.length > 0}
                onClick={() => {
                  if (!window.confirm(`Delete ${selected.name}?`)) return;
                  const teams = working.teams.filter(
                    (team) => team.id !== selected.id,
                  );
                  setTeams(teams);
                  setSelectedId(teams[0]?.id ?? "");
                }}
              >
                Delete team
              </button>
              {referencedMatches.length > 0 && (
                <p className="delete-team-note">
                  Remove this team from {referencedMatches.length} scheduled
                  {referencedMatches.length === 1 ? " match" : " matches"} before
                  deleting it.
                </p>
              )}
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
