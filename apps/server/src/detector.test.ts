import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DetectorProfileSchema } from "@shayyz/contracts";
import type { DraftCandidate } from "@shayyz/detector";
import { DetectorCoordinator } from "./detector";
import { DraftStore } from "./store";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

const profile = DetectorProfileSchema.parse({
  schemaVersion: 1,
  id: "test-profile",
  gameBuild: "test",
  language: "en",
  sourceName: "MLBB",
  frame: { width: 100, height: 100 },
  slots: ["blue", "red"].flatMap((side) =>
    ["pick", "ban"].flatMap((kind) =>
      Array.from({ length: 5 }, (_, slot) => ({
        side,
        kind,
        slot,
        rect: { x: slot * 10, y: 0, width: 10, height: 10 },
      })),
    ),
  ),
  thresholds: {
    proposal: 0.9,
    automatic: 0.98,
    proposalMargin: 0.01,
    automaticMargin: 0.02,
    empty: 0.98,
  },
  validation: { referenceCount: 133, validatedAt: new Date(0).toISOString() },
});

const candidate: DraftCandidate = {
  heroId: "miya",
  side: "blue",
  kind: "ban",
  slot: 0,
  phaseIndex: 0,
  draftRevision: 0,
  confidence: 0.99,
  runnerUpMargin: 0.03,
  evidenceFrames: 3,
  observedAt: 1,
};

async function setup(automaticReady: boolean) {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-detector-"));
  directories.push(directory);
  const store = new DraftStore(directory);
  await store.initialize();
  return {
    store,
    coordinator: new DetectorCoordinator({
      store,
      profile,
      referenceCount: 133,
      automaticReady,
    }),
  };
}

describe("DetectorCoordinator", () => {
  test("keeps candidates pending until an operator accepts them", async () => {
    const { coordinator, store } = await setup(false);
    coordinator.setMode("proposal");
    const proposal = await coordinator.observe(candidate);

    expect(proposal?.status).toBe("pending");
    expect(store.state.revision).toBe(0);
    expect((await coordinator.accept(proposal?.id ?? "")).status).toBe(
      "accepted",
    );
    expect(store.state.selections.blue.bans[0]).toMatchObject({
      heroId: "miya",
      source: "detector",
    });
  });

  test("auto-applies only when the validated pack and thresholds qualify", async () => {
    const unready = await setup(false);
    unready.coordinator.setMode("confidence-tiered");
    expect((await unready.coordinator.observe(candidate))?.status).toBe(
      "pending",
    );

    const ready = await setup(true);
    ready.coordinator.setMode("confidence-tiered");
    expect((await ready.coordinator.observe(candidate))?.status).toBe(
      "auto-applied",
    );
    expect(ready.store.state.revision).toBe(1);
  });

  test("supersedes a proposal when the draft advances elsewhere", async () => {
    const { coordinator, store } = await setup(false);
    coordinator.setMode("proposal");
    const proposal = await coordinator.observe(candidate);
    await store.dispatch({
      type: "select-hero",
      expectedRevision: 0,
      heroId: "layla",
      source: "manual",
    });

    expect(coordinator.status().pendingProposal).toBeNull();
    expect(() => coordinator.reject(proposal?.id ?? "")).toThrow("not pending");
  });
});
