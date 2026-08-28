import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultDisplayState } from "@shayyz/contracts";
import { DisplayStore } from "./display-store";
import { RevisionConflictError } from "./store";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

async function createStore(directory?: string) {
  const runtime =
    directory ?? (await mkdtemp(join(tmpdir(), "shayyz-display-")));
  if (!directory) directories.push(runtime);
  const store = new DisplayStore(runtime);
  await store.initialize();
  return store;
}

describe("DisplayStore", () => {
  test("persists validated display state in SQLite", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "shayyz-display-"));
    directories.push(runtime);
    const store = await createStore(runtime);
    const next = createDefaultDisplayState();
    next.event.name = "Yangon Invitational";
    const saved = store.dispatch({
      type: "set-display",
      expectedRevision: 0,
      display: {
        event: next.event,
        scoreboard: next.scoreboard,
        teams: next.teams,
        lineups: next.lineups,
        rosters: next.rosters,
        schedule: next.schedule,
        activeMatchId: next.activeMatchId,
        countdown: next.countdown,
        ticker: next.ticker,
        rosterLoop: next.rosterLoop,
        cueRevision: next.cueRevision,
      },
    });
    expect(saved.event.name).toBe("Yangon Invitational");
    store.close();

    const restored = await createStore(runtime);
    expect(restored.state.event.name).toBe("Yangon Invitational");
    expect(restored.state.revision).toBe(1);
    restored.close();
  });

  test("increments cue revisions and rejects stale mutations", async () => {
    const store = await createStore();
    expect(
      store.dispatch({ type: "cue", expectedRevision: 0 }).cueRevision,
    ).toBe(1);
    expect(() => store.dispatch({ type: "cue", expectedRevision: 0 })).toThrow(
      RevisionConflictError,
    );
    store.close();
  });

  test("preserves scheduled team references when teams are reordered", async () => {
    const store = await createStore();
    const next = store.state;
    const [blue, red] = next.teams;
    if (!blue || !red) throw new Error("Default teams are missing.");
    next.schedule = [
      {
        id: "match-1",
        scheduledAt: null,
        stage: "Group Stage",
        round: "Round 1",
        bestOf: 3,
        blueTeamId: blue.id,
        redTeamId: red.id,
        scores: { blue: 0, red: 0 },
        status: "scheduled",
      },
    ];
    next.teams.reverse();
    const { revision: _, updatedAt: __, ...display } = next;
    const saved = store.dispatch({
      type: "set-display",
      expectedRevision: 0,
      display,
    });
    expect(saved.schedule[0]).toMatchObject({
      blueTeamId: blue.id,
      redTeamId: red.id,
    });
    store.close();
  });

  test("merges focused organizer sections without replacing unrelated data", async () => {
    const store = await createStore();
    const initial = store.state;
    const teams = structuredClone(initial.teams);
    if (!teams[0] || !teams[1]) throw new Error("Default teams are missing.");
    teams[0].name = "Yangon Ravens";
    const teamState = store.dispatch({
      type: "set-team-directory",
      expectedRevision: 0,
      teams,
    });
    expect(teamState.event).toEqual(initial.event);

    const schedule = [
      {
        id: "final",
        scheduledAt: null,
        stage: "Finals",
        round: "Grand Final",
        bestOf: 7,
        blueTeamId: teams[0].id,
        redTeamId: teams[1].id,
        scores: { blue: 0, red: 0 },
        status: "scheduled" as const,
      },
    ];
    const matchState = store.dispatch({
      type: "set-match-schedule",
      expectedRevision: teamState.revision,
      schedule,
    });
    expect(matchState.teams[0]?.name).toBe("Yangon Ravens");

    const overlayState = store.dispatch({
      type: "set-overlay-config",
      expectedRevision: matchState.revision,
      config: {
        event: { ...matchState.event, name: "MSC Yangon" },
        scoreboard: matchState.scoreboard,
        countdown: matchState.countdown,
        ticker: matchState.ticker,
        rosterLoop: matchState.rosterLoop,
      },
    });
    expect(overlayState.schedule).toEqual(schedule);
    expect(overlayState.teams[0]?.name).toBe("Yangon Ravens");
    expect(overlayState.event.name).toBe("MSC Yangon");
    store.close();
  });

  test("validates cross-section references after focused updates", async () => {
    const store = await createStore();
    const state = store.state;
    const [blue, red] = state.teams;
    if (!blue || !red) throw new Error("Default teams are missing.");
    store.dispatch({
      type: "set-match-schedule",
      expectedRevision: 0,
      schedule: [
        {
          id: "match-1",
          scheduledAt: null,
          stage: "Groups",
          round: "Round 1",
          bestOf: 3,
          blueTeamId: blue.id,
          redTeamId: red.id,
          scores: { blue: 0, red: 0 },
          status: "scheduled",
        },
      ],
    });
    expect(() =>
      store.dispatch({
        type: "set-team-directory",
        expectedRevision: 1,
        teams: [blue],
      }),
    ).toThrow();
    store.close();
  });

  test("migrates display documents created before native HUD frames", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "shayyz-display-"));
    directories.push(runtime);
    const store = await createStore(runtime);
    const legacy = store.state as unknown as Record<string, unknown>;
    const scoreboard = legacy.scoreboard as Record<string, unknown>;
    delete scoreboard.frames;
    store.close();
    const database = new Database(join(runtime, "overlay.sqlite"));
    database
      .query("UPDATE display_state SET document = ?1 WHERE id = 1")
      .run(JSON.stringify(legacy));
    database.close();

    const migrated = await createStore(runtime);
    expect(migrated.state.scoreboard.frames.blue).toEqual({
      x: 0,
      y: 360,
      width: 142,
      height: 430,
      rowGap: 4,
    });
    migrated.close();
  });

  test("migrates display documents created before roster loop settings", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "shayyz-display-"));
    directories.push(runtime);
    const store = await createStore(runtime);
    const legacy = store.state as unknown as Record<string, unknown>;
    delete legacy.rosterLoop;
    store.close();
    const database = new Database(join(runtime, "overlay.sqlite"));
    database
      .query("UPDATE display_state SET document = ?1 WHERE id = 1")
      .run(JSON.stringify(legacy));
    database.close();

    const migrated = await createStore(runtime);
    expect(migrated.state.rosterLoop).toEqual({
      holdSeconds: 8,
      transitionSeconds: 0.8,
    });
    migrated.close();
  });

  test("removes obsolete event media settings from saved displays", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "shayyz-display-"));
    directories.push(runtime);
    const store = await createStore(runtime);
    const legacy = store.state as unknown as Record<string, unknown>;
    legacy.backgrounds = { match: "/match.png" };
    Object.assign(legacy.event as object, {
      logoUrl: "/event.png",
      defaultBackgroundUrl: "/background.png",
    });
    store.close();
    const database = new Database(join(runtime, "overlay.sqlite"));
    database
      .query("UPDATE display_state SET document = ?1 WHERE id = 1")
      .run(JSON.stringify(legacy));
    database.close();

    const migrated = await createStore(runtime);
    expect(migrated.state.event).toEqual({
      name: "MLBB Tournament",
      timezone: "Asia/Yangon",
    });
    expect("backgrounds" in migrated.state).toBe(false);
    migrated.close();
  });

  test("adds blank photos to existing managed starters", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "shayyz-display-"));
    directories.push(runtime);
    const store = await createStore(runtime);
    const legacy = store.state as unknown as Record<string, unknown>;
    const teams = legacy.teams as Array<{
      starters: Array<Record<string, unknown>>;
    }>;
    for (const team of teams)
      for (const starter of team.starters) delete starter.photoUrl;
    store.close();
    const database = new Database(join(runtime, "overlay.sqlite"));
    database
      .query("UPDATE display_state SET document = ?1 WHERE id = 1")
      .run(JSON.stringify(legacy));
    database.close();

    const migrated = await createStore(runtime);
    expect(
      migrated.state.teams.every((team) =>
        team.starters.every((player) => player.photoUrl === ""),
      ),
    ).toBe(true);
    migrated.close();
  });

  test("migrates current teams and roster roles into the team directory", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "shayyz-display-"));
    directories.push(runtime);
    const store = await createStore(runtime);
    const legacy = store.state as unknown as Record<string, unknown>;
    delete legacy.teams;
    store.close();
    const database = new Database(join(runtime, "overlay.sqlite"));
    database
      .query("UPDATE display_state SET document = ?1 WHERE id = 1")
      .run(JSON.stringify(legacy));
    database.close();

    const migrated = new DisplayStore(runtime);
    await migrated.initialize({
      blue: { name: "Ravens", shortName: "RVN", logoUrl: "/blue.png" },
      red: { name: "Titans", shortName: "TTN", logoUrl: "/red.png" },
    });
    expect(migrated.state.teams.map((team) => team.name)).toEqual([
      "Ravens",
      "Titans",
    ]);
    expect(
      migrated.state.teams[0]?.starters.map((player) => player.role),
    ).toEqual(["exp", "jungle", "mid", "gold", "roam"]);
    migrated.close();
  });

  test("migrates embedded schedule teams to managed team references", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "shayyz-display-"));
    directories.push(runtime);
    const store = await createStore(runtime);
    const legacy = store.state as unknown as Record<string, unknown>;
    legacy.schedule = [
      {
        id: "legacy-match",
        scheduledAt: null,
        stage: "Finals",
        round: "Grand Final",
        bestOf: 7,
        blue: { name: "Ravens", shortName: "RVN", logoUrl: "" },
        red: { name: "Titans", shortName: "TTN", logoUrl: "" },
        scores: { blue: 2, red: 1 },
        status: "live",
      },
    ];
    legacy.activeMatchId = "legacy-match";
    store.close();
    const database = new Database(join(runtime, "overlay.sqlite"));
    database
      .query("UPDATE display_state SET document = ?1 WHERE id = 1")
      .run(JSON.stringify(legacy));
    database.close();

    const migrated = await createStore(runtime);
    const match = migrated.state.schedule[0];
    expect(
      migrated.state.teams.find((team) => team.id === match?.blueTeamId)?.name,
    ).toBe("Ravens");
    expect(
      migrated.state.teams.find((team) => team.id === match?.redTeamId)?.name,
    ).toBe("Titans");
    expect(match?.scores).toEqual({ blue: 2, red: 1 });
    migrated.close();
  });
});
