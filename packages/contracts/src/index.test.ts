import { describe, expect, test } from "bun:test";
import {
  AssetPackManifestSchema,
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
