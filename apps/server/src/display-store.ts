import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createDefaultDisplayState,
  type DisplayCommand,
  DisplayCommandSchema,
  type DisplayState,
  DisplayStateSchema,
  type DraftState,
  type ManagedTeam,
  type ScheduledMatch,
  type Side,
  type Team,
} from "@shayyz/contracts";
import { RevisionConflictError } from "./store";

export class DisplayStore {
  readonly filePath: string;
  #database?: Database;
  #state = createDefaultDisplayState();

  constructor(runtimeDirectory: string) {
    this.filePath = join(runtimeDirectory, "overlay.sqlite");
  }

  async initialize(seedTeams?: DraftState["teams"]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    this.#database = new Database(this.filePath, { create: true });
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS display_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        document TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const saved = this.#database
      .query<{ document: string }, []>(
        "SELECT document FROM display_state WHERE id = 1",
      )
      .get();
    if (saved) {
      try {
        const document = JSON.parse(saved.document) as Record<string, unknown>;
        const event = document.event as Record<string, unknown> | undefined;
        const migratedPresentation =
          document.backgrounds !== undefined ||
          event?.logoUrl !== undefined ||
          event?.defaultBackgroundUrl !== undefined;
        delete document.backgrounds;
        if (event) {
          delete event.logoUrl;
          delete event.defaultBackgroundUrl;
        }
        const scoreboard = document.scoreboard as
          | Record<string, unknown>
          | undefined;
        const migratedFrames = scoreboard?.frames === undefined;
        if (scoreboard && migratedFrames)
          scoreboard.frames = createDefaultDisplayState().scoreboard.frames;
        const migratedTeams = document.teams === undefined;
        if (migratedTeams)
          document.teams = migrateManagedTeams(document, seedTeams);
        const managedTeams = document.teams as Array<{
          starters?: Array<Record<string, unknown>>;
        }>;
        const migratedPlayerPhotos = managedTeams.some((team) =>
          (team.starters ?? []).some((player) => {
            if (player.photoUrl !== undefined) return false;
            player.photoUrl = "";
            return true;
          }),
        );
        const migratedRosterLoop = document.rosterLoop === undefined;
        if (migratedRosterLoop)
          document.rosterLoop = createDefaultDisplayState().rosterLoop;
        const schedule = document.schedule as Array<Record<string, unknown>>;
        const migratedMatches = schedule.some(
          (match) => match.blueTeamId === undefined,
        );
        if (migratedMatches)
          document.schedule = migrateLegacySchedule(document);
        this.#state = DisplayStateSchema.parse(document);
        if (
          migratedPresentation ||
          migratedFrames ||
          migratedTeams ||
          migratedPlayerPhotos ||
          migratedRosterLoop ||
          migratedMatches
        )
          this.persist();
        return;
      } catch {
        this.#database.exec("DELETE FROM display_state WHERE id = 1");
      }
    }
    this.persist();
  }

  get state(): DisplayState {
    return structuredClone(this.#state);
  }

  dispatch(input: DisplayCommand): DisplayState {
    const command = DisplayCommandSchema.parse(input);
    if (command.expectedRevision !== this.#state.revision)
      throw new RevisionConflictError(this.#state.revision);
    const now = new Date().toISOString();
    const next = this.nextSettings(command);
    this.#state = DisplayStateSchema.parse({
      ...next,
      cueRevision:
        command.type === "cue"
          ? this.#state.cueRevision + 1
          : next.cueRevision,
      revision: this.#state.revision + 1,
      updatedAt: now,
    });
    this.persist();
    return this.state;
  }

  private nextSettings(command: DisplayCommand): DisplayState {
    switch (command.type) {
      case "set-display":
        return { ...this.#state, ...command.display };
      case "set-team-directory":
        return { ...this.#state, teams: command.teams };
      case "set-match-schedule":
        return { ...this.#state, schedule: command.schedule };
      case "set-overlay-config":
        return { ...this.#state, ...command.config };
      case "cue":
        return this.#state;
    }
  }

  syncActiveScores(
    scores: DisplayState["schedule"][number]["scores"],
  ): DisplayState {
    if (!this.#state.activeMatchId) return this.state;
    const next = this.state;
    const match = next.schedule.find((item) => item.id === next.activeMatchId);
    if (!match) return this.state;
    match.scores = structuredClone(scores);
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    this.#state = DisplayStateSchema.parse(next);
    this.persist();
    return this.state;
  }

  close(): void {
    this.#database?.close();
  }

  private persist(): void {
    if (!this.#database) throw new Error("Display store is not initialized.");
    const document = JSON.stringify(this.#state);
    this.#database.transaction(() => {
      this.#database
        ?.query(
          `INSERT INTO display_state (id, document, updated_at)
           VALUES (1, ?1, ?2)
           ON CONFLICT(id) DO UPDATE SET
             document = excluded.document,
             updated_at = excluded.updated_at`,
        )
        .run(document, this.#state.updatedAt);
    })();
  }
}

function migrateLegacySchedule(
  document: Record<string, unknown>,
): ScheduledMatch[] {
  const teams = document.teams as ManagedTeam[];
  const schedule = document.schedule as Array<
    Omit<ScheduledMatch, "blueTeamId" | "redTeamId"> & {
      blue: Team;
      red: Team;
    }
  >;
  const teamId = (legacy: Team, side: Side) => {
    const existing = teams.find(
      (team) =>
        team.name === legacy.name && team.shortName === legacy.shortName,
    );
    if (existing) return existing.id;
    const template = createDefaultDisplayState().teams.find(
      (team) => team.id === `${side}-team`,
    );
    if (!template) throw new Error("Default managed team is missing.");
    const id = randomUUID();
    teams.push({
      ...template,
      ...legacy,
      id,
      starters: template.starters.map((player) => ({
        ...player,
        id: randomUUID(),
      })),
    });
    return id;
  };
  return schedule.map(({ blue, red, ...match }) => ({
    ...match,
    blueTeamId: teamId(blue, "blue"),
    redTeamId: teamId(red, "red"),
  }));
}

function migrateManagedTeams(
  document: Record<string, unknown>,
  seedTeams?: DraftState["teams"],
): ManagedTeam[] {
  const defaults = createDefaultDisplayState();
  const lineups = document.lineups as
    | Record<
        Side,
        Array<{
          id: string;
          name: string;
          role: ManagedTeam["starters"][number]["role"];
        }>
      >
    | undefined;
  const rosters = document.rosters as
    | Record<Side, Array<{ id: string; name: string }>>
    | undefined;
  return (["blue", "red"] as const).map((side) => {
    const fallback = defaults.teams.find((team) => team.id === `${side}-team`);
    if (!fallback) throw new Error("Default managed team is missing.");
    const starters =
      lineups?.[side]?.map(({ id, name, role }) => ({
        id,
        name,
        role,
        photoUrl: "",
      })) ?? fallback.starters;
    const starterIds = new Set(starters.map((player) => player.id));
    return {
      ...fallback,
      ...(seedTeams?.[side] ?? {}),
      starters,
      substitutes: (rosters?.[side] ?? [])
        .filter((player) => !starterIds.has(player.id))
        .slice(0, 5)
        .map((player) => ({ ...player, role: null })),
    };
  });
}
