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
});
