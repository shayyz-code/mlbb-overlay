import type {
  DisplaySettings,
  DisplayState,
  ManagedTeam,
  PlayerRole,
} from "@shayyz/contracts";
import { useEffect, useState } from "react";
import {
  fetchDisplay,
  sendDisplayCommand,
  subscribeToDisplay,
  uploadTeamLogo,
} from "./api";
import "./team-control.css";

const roles: PlayerRole[] = ["exp", "jungle", "mid", "gold", "roam"];

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
  const [token, setToken] = useState(
    () => sessionStorage.getItem("shayyz-control-token") ?? "",
  );
  useEffect(() => {
    void fetchDisplay().then((state) => {
      setDisplay(state);
      setWorking(settings(state));
      setSelectedId(state.teams[0]?.id ?? "");
    });
    return subscribeToDisplay((state) => {
      setDisplay(state);
      setWorking(settings(state));
    }, setConnected);
  }, []);
  if (!display || !working)
    return <div className="loading-screen">Loading team directory…</div>;
  const selected = working.teams.find((team) => team.id === selectedId);
  const change = (team: ManagedTeam) =>
    setWorking({
      ...working,
      teams: working.teams.map((item) => (item.id === team.id ? team : item)),
    });
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
      setError(reason instanceof Error ? reason.message : "Team save failed.");
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
          <a className="active" href="/control/teams">
            Team control
          </a>
        </nav>
        <div className="system-card">
          <span className={`status-light ${connected ? "online" : ""}`} />
          <div>
            <strong>{connected ? "Live sync" : "Reconnecting"}</strong>
            <small>{working.teams.length} managed teams</small>
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
      <section className="control-main team-control-main">
        <header className="control-header">
          <div>
            <small>Organizer setup</small>
            <h1>Team Control</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              onClick={() => {
                const team = createTeam();
                setWorking({ ...working, teams: [...working.teams, team] });
                setSelectedId(team.id);
              }}
            >
              Add team
            </button>
            <button
              className="primary"
              type="button"
              onClick={() => void persist()}
            >
              Save teams
            </button>
          </div>
        </header>
        {error && <div className="error-banner">{error}</div>}
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
                  <label key={player.id}>
                    <span>{player.role}</span>
                    <input
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
                  </label>
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
                onClick={() => {
                  const teams = working.teams.filter(
                    (team) => team.id !== selected.id,
                  );
                  setWorking({ ...working, teams });
                  setSelectedId(teams[0]?.id ?? "");
                }}
              >
                Delete team
              </button>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
