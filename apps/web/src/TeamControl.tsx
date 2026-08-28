import type {
  DisplayCommand,
  DisplayState,
  ManagedTeam,
  PlayerRole,
} from "@shayyz/contracts";
import { useEffect, useState } from "react";
import {
  uploadPlayerPhoto,
  uploadTeamLogo,
} from "./api";
import { OrganizerSidebar } from "./OrganizerShell";
import "./team-control.css";
import {
  autosaveLabel,
  useDisplaySectionAutosave,
} from "./useDisplaySectionAutosave";

const roles: PlayerRole[] = ["exp", "jungle", "mid", "gold", "roam"];
type TeamDirectory = DisplayState["teams"];

const selectTeams = (state: DisplayState): TeamDirectory => state.teams;
const teamDirectoryCommand = (
  expectedRevision: number,
  teams: TeamDirectory,
): DisplayCommand => ({ type: "set-team-directory", expectedRevision, teams });

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
  const [selectedId, setSelectedId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("shayyz-control-token") ?? "",
  );
  const autosave = useDisplaySectionAutosave({
    token,
    select: selectTeams,
    command: teamDirectoryCommand,
    failureMessage: "Team save failed.",
  });
  const { display, value: teams } = autosave;
  useEffect(() => {
    if (!teams) return;
    setSelectedId((current) =>
      teams.some((team) => team.id === current)
        ? current
        : (teams[0]?.id ?? ""),
    );
  }, [teams]);
  if (!display || !teams)
    return <div className="loading-screen">Loading team directory…</div>;
  const selected = teams.find((team) => team.id === selectedId);
  const selectedIndex = teams.findIndex((team) => team.id === selectedId);
  const referencedMatches = selected
    ? display.schedule.filter(
        (match) =>
          match.blueTeamId === selected.id || match.redTeamId === selected.id,
      )
    : [];
  const setTeams = (next: ManagedTeam[]) => {
    setUploadError("");
    autosave.edit(next);
  };
  const change = (team: ManagedTeam) =>
    setTeams(teams.map((item) => (item.id === team.id ? team : item)));
  const moveSelected = (offset: -1 | 1) => {
    const target = selectedIndex + offset;
    if (selectedIndex < 0 || target < 0 || target >= teams.length) return;
    const reordered = [...teams];
    const selectedTeam = reordered[selectedIndex];
    const targetTeam = reordered[target];
    if (!selectedTeam || !targetTeam) return;
    reordered[selectedIndex] = targetTeam;
    reordered[target] = selectedTeam;
    setTeams(reordered);
  };
  const visibleError = uploadError || autosave.error;
  return (
    <main className="control-shell">
      <OrganizerSidebar
        active="teams"
        connected={autosave.connected}
        statusLines={<small>{teams.length} managed teams</small>}
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
                setTeams([...teams, team]);
                setSelectedId(team.id);
              }}
            >
              Add team
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
                Reload saved teams
              </button>
            )}
          </div>
        )}
        <div className="team-directory-layout">
          <nav className="team-directory-list" aria-label="Managed teams">
            {teams.map((team) => (
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
                  disabled={selectedIndex === teams.length - 1}
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
                          setUploadError("");
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
                            setUploadError(
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
                  const remaining = teams.filter(
                    (team) => team.id !== selected.id,
                  );
                  setTeams(remaining);
                  setSelectedId(remaining[0]?.id ?? "");
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
