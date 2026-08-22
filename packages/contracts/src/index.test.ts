import { describe, expect, test } from "bun:test";
import {
  AssetPackManifestSchema,
  DetectorProfileSchema,
  DraftReferenceMapSchema,
  IdlePosterJobsSchema,
  STANDARD_TEN_BAN_FORMAT,
  applySelection,
  createDefaultDraftState,
  currentPhase,
  selectedHeroIds,
} from "./index";

describe("standard draft contract", () => {
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
    for (let index = 0; index < 20; index += 1) {
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
