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
        backgrounds: next.backgrounds,
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
});
