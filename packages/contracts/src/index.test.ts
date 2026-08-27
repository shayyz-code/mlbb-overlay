import { describe, expect, test } from "bun:test";
import {
  AssetPackManifestSchema,
  applySelection,
  createDefaultDisplayState,
  createDefaultDraftState,
  currentPhase,
  DetectorProfileSchema,
  DisplayStateSchema,
  DraftCommandSchema,
  type DraftPhase,
  DraftReferenceMapSchema,
  IdlePosterJobsSchema,
  STANDARD_TEN_BAN_FORMAT,
  selectedHeroIds,
} from "./index";

const tournamentPhases: DraftPhase[] = [
  { side: "blue", kind: "ban", slot: 0 },
  { side: "red", kind: "ban", slot: 0 },
  { side: "blue", kind: "ban", slot: 1 },
  { side: "red", kind: "ban", slot: 1 },
  { side: "blue", kind: "ban", slot: 2 },
  { side: "red", kind: "ban", slot: 2 },
  { side: "blue", kind: "pick", slot: 0 },
  { side: "red", kind: "pick", slot: 0 },
  { side: "red", kind: "pick", slot: 1 },
  { side: "blue", kind: "pick", slot: 1 },
  { side: "blue", kind: "pick", slot: 2 },
  { side: "red", kind: "pick", slot: 2 },
  { side: "red", kind: "ban", slot: 3 },
  { side: "blue", kind: "ban", slot: 3 },
  { side: "red", kind: "ban", slot: 4 },
  { side: "blue", kind: "ban", slot: 4 },
  { side: "red", kind: "pick", slot: 3 },
  { side: "blue", kind: "pick", slot: 3 },
  { side: "blue", kind: "pick", slot: 4 },
  { side: "red", kind: "pick", slot: 4 },
];

describe("standard draft contract", () => {
  test("uses the verified MLBB tournament phase order", () => {
    expect(STANDARD_TEN_BAN_FORMAT.phases).toEqual(tournamentPhases);
  });

  test("contains five bans and five picks per side", () => {
    for (const side of ["blue", "red"] as const) {
      expect(
        STANDARD_TEN_BAN_FORMAT.phases.filter(
          (phase) => phase.side === side && phase.kind === "ban",
        ),
      ).toHaveLength(5);
      expect(
        STANDARD_TEN_BAN_FORMAT.phases.filter(
          (phase) => phase.side === side && phase.kind === "pick",
        ),
      ).toHaveLength(5);
    }
  });

  test("advances phases and completes after twenty selections", () => {
    let state = createDefaultDraftState(new Date("2026-08-21T00:00:00.000Z"));
    for (const [index, expectedPhase] of tournamentPhases.entries()) {
      expect(currentPhase(state)).toEqual(expectedPhase);
      state = applySelection(state, {
        heroId: `hero-${index}`,
        source: "manual",
      });
    }

    expect(state.phaseIndex).toBe(20);
    expect(state.status).toBe("complete");
    expect(currentPhase(state)).toBeNull();
    expect(selectedHeroIds(state)).toHaveLength(20);
  });

  test("rejects duplicate heroes", () => {
    const state = applySelection(createDefaultDraftState(), {
      heroId: "miya",
      source: "manual",
    });
    expect(() =>
      applySelection(state, { heroId: "miya", source: "manual" }),
    ).toThrow("already selected");
  });

  test("keeps hero voice playback off by default", () => {
    expect(createDefaultDraftState().presentation.voiceEnabled).toBe(false);
  });

  test("starts with a zero-zero scoreboard and validates score commands", () => {
    expect(createDefaultDraftState().scoreboard.scores).toEqual({
      blue: 0,
      red: 0,
    });
    expect(
      DraftCommandSchema.safeParse({
        type: "set-scoreboard-score",
        expectedRevision: 0,
        side: "blue",
        score: 100,
      }).success,
    ).toBe(false);
  });
});

describe("display contracts", () => {
  test("creates five unique role starters for each side", () => {
    const state = createDefaultDisplayState(
      new Date("2026-08-27T00:00:00.000Z"),
    );
    for (const side of ["blue", "red"] as const) {
      expect(state.lineups[side]).toHaveLength(5);
      expect(state.rosters[side]).toHaveLength(5);
      expect(
        new Set(state.lineups[side].map((player) => player.role)).size,
      ).toBe(5);
    }
    expect(state.scoreboard.preset).toBe("tournament");
    expect(state.scoreboard.frames).toEqual({
      blue: { x: 0, y: 360, width: 142, height: 430, rowGap: 4 },
      red: { x: 1792, y: 360, width: 128, height: 430, rowGap: 4 },
    });
  });

  test("creates a reusable team directory with unique starter roles", () => {
    const state = createDefaultDisplayState();
    expect(state.teams).toHaveLength(2);
    expect(state.teams[0]?.starters.map((player) => player.role)).toEqual([
      "exp",
      "jungle",
      "mid",
      "gold",
      "roam",
    ]);
  });

  test("rejects duplicate lineup roles", () => {
    const state = createDefaultDisplayState();
    const secondStarter = state.lineups.blue[1];
    if (!secondStarter) throw new Error("Default lineup is incomplete.");
    secondStarter.role = "exp";
    expect(DisplayStateSchema.safeParse(state).success).toBe(false);
  });

  test("rejects invalid event timezones", () => {
    const state = createDefaultDisplayState();
    state.event.timezone = "Moon/Sea-of-Tranquility";
    expect(DisplayStateSchema.safeParse(state).success).toBe(false);
  });

  test("requires scheduled matches to reference two managed teams", () => {
    const state = createDefaultDisplayState();
    state.schedule.push({
      id: "match-1",
      scheduledAt: null,
      stage: "Finals",
      round: "Grand Final",
      bestOf: 7,
      blueTeamId: state.teams[0]?.id ?? "",
      redTeamId: state.teams[0]?.id ?? "",
      scores: { blue: 0, red: 0 },
      status: "scheduled",
    });
    expect(DisplayStateSchema.safeParse(state).success).toBe(false);
  });

  test("rejects native HUD frames outside the OBS canvas", () => {
    const state = createDefaultDisplayState();
    state.scoreboard.frames.red.x = 1900;
    expect(DisplayStateSchema.safeParse(state).success).toBe(false);
  });
});

test("asset manifests reject unsafe paths", () => {
  const base = {
    schemaVersion: 1,
    pack: {
      id: "mlbb-personal",
      displayName: "Personal MLBB media",
      usage: "personal-local-no-redistribution",
      createdAt: new Date().toISOString(),
    },
    heroes: {},
    cues: {},
  };
  expect(AssetPackManifestSchema.safeParse(base).success).toBe(true);
  expect(
    AssetPackManifestSchema.safeParse({
      ...base,
      heroes: {
        miya: {
          portrait: {
            path: "../private.png",
            sha256: "a".repeat(64),
            mimeType: "image/png",
          },
        },
      },
    }).success,
  ).toBe(false);
});

test("draft reference maps require a positive crop when configured", () => {
  const base = {
    schemaVersion: 1,
    gameBuild: "2.1.95.12065",
    crop: null,
    output: { width: 256, height: 256 },
    clips: [],
  };
  expect(DraftReferenceMapSchema.safeParse(base).success).toBe(true);
  expect(
    DraftReferenceMapSchema.safeParse({
      ...base,
      crop: { x: 0, y: 0, width: 0, height: 100 },
    }).success,
  ).toBe(false);
});

test("detector profiles require all twenty draft slots", () => {
  const slots = ["blue", "red"].flatMap((side) =>
    ["pick", "ban"].flatMap((kind) =>
      Array.from({ length: 5 }, (_, slot) => ({
        side,
        kind,
        slot,
        rect: { x: slot * 10, y: 0, width: 10, height: 10 },
      })),
    ),
  );
  expect(
    DetectorProfileSchema.parse({
      schemaVersion: 1,
      id: "ranked-en-1080p",
      gameBuild: "2.1.0",
      language: "en",
      sourceName: "MLBB",
      frame: { width: 1920, height: 1080 },
      slots,
      thresholds: {},
      validation: { referenceCount: 133, validatedAt: null },
    }).slots,
  ).toHaveLength(20);
});

test("idle poster jobs cap identity-changing augmentation", () => {
  const base = {
    schemaVersion: 1,
    model: { checkpoint: "svd_xt_1_1.safetensors", revision: "1.1" },
    parameters: {
      width: 576,
      height: 1024,
      frames: 25,
      sourceFps: 6,
      motionBucketId: 40,
      augmentationLevel: 0.02,
    },
    jobs: [],
  };
  expect(IdlePosterJobsSchema.safeParse(base).success).toBe(true);
  expect(
    IdlePosterJobsSchema.safeParse({
      ...base,
      parameters: { ...base.parameters, augmentationLevel: 0.04 },
    }).success,
  ).toBe(false);
});
