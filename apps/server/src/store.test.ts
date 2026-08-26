import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultDraftState } from "@shayyz/contracts";
import { DraftStore, RevisionConflictError } from "./store";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

async function createStore(): Promise<DraftStore> {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-store-"));
  directories.push(directory);
  const store = new DraftStore(directory);
  await store.initialize();
  return store;
}

describe("DraftStore", () => {
  test("persists commands atomically and supports undo", async () => {
    const store = await createStore();
    await store.dispatch({
      expectedRevision: 0,
      type: "select-hero",
      heroId: "miya",
      source: "manual",
    });
    expect(store.state.selections.blue.bans[0]?.heroId).toBe("miya");

    await store.dispatch({ expectedRevision: 1, type: "undo" });
    expect(store.state.selections.blue.bans[0]).toBeNull();
    expect(JSON.parse(await readFile(store.filePath, "utf8")).revision).toBe(2);
  });

  test("rejects stale revisions", async () => {
    const store = await createStore();
    await store.dispatch({
      expectedRevision: 0,
      type: "select-hero",
      heroId: "miya",
      source: "manual",
    });
    await expect(
      store.dispatch({ expectedRevision: 0, type: "undo" }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
  });

  test("backs up malformed persisted state", async () => {
    const store = await createStore();
    await writeFile(store.filePath, "not-json");
    await store.initialize();
    expect(store.state.revision).toBe(0);
  });

  test("migrates saved state and persists default settings", async () => {
    const store = await createStore();
    const legacy = createDefaultDraftState() as Partial<
      ReturnType<typeof createDefaultDraftState>
    >;
    delete legacy.presentation;
    delete legacy.scoreboard;
    await writeFile(store.filePath, JSON.stringify(legacy));
    await store.initialize();
    expect(store.state.presentation.voiceEnabled).toBe(false);
    expect(store.state.scoreboard.scores).toEqual({ blue: 0, red: 0 });
    expect(
      JSON.parse(await readFile(store.filePath, "utf8")).presentation,
    ).toEqual({ voiceEnabled: false });

    await store.dispatch({
      type: "set-presentation",
      expectedRevision: 0,
      presentation: { voiceEnabled: true },
    });
    await store.dispatch({ type: "reset", expectedRevision: 1 });
    expect(store.state.presentation.voiceEnabled).toBe(true);
  });

  test("updates, swaps, resets, and undoes scoreboard scores", async () => {
    const store = await createStore();
    await store.dispatch({
      type: "set-scoreboard-score",
      expectedRevision: 0,
      side: "blue",
      score: 2,
    });
    await store.dispatch({ type: "swap-sides", expectedRevision: 1 });
    expect(store.state.scoreboard.scores).toEqual({ blue: 0, red: 2 });

    await store.dispatch({ type: "reset-scoreboard", expectedRevision: 2 });
    expect(store.state.scoreboard.scores).toEqual({ blue: 0, red: 0 });
    await store.dispatch({ type: "undo", expectedRevision: 3 });
    expect(store.state.scoreboard.scores).toEqual({ blue: 0, red: 2 });
  });

  test("preserves scoreboard scores when the draft resets", async () => {
    const store = await createStore();
    await store.dispatch({
      type: "set-scoreboard-score",
      expectedRevision: 0,
      side: "red",
      score: 3,
    });
    await store.dispatch({ type: "reset", expectedRevision: 1 });
    expect(store.state.scoreboard.scores).toEqual({ blue: 0, red: 3 });
  });
});
