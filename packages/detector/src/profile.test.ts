import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  DetectorProfileStore,
  isAutomaticProfileReady,
  loadReferenceDescriptors,
  validateDetectorProfile,
} from ".";

function profile() {
  return {
    schemaVersion: 1,
    id: "ranked-en-1080p",
    gameBuild: "2.1.0",
    language: "en",
    sourceName: "MLBB",
    frame: { width: 1920, height: 1080 },
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
    thresholds: {},
    validation: {
      referenceCount: 133,
      validatedAt: "2026-08-22T00:00:00.000Z",
    },
  };
}

describe("private detector profile", () => {
  test("persists validated profiles atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "shayyz-detector-profile-"));
    const store = new DetectorProfileStore(join(root, "profile.json"));
    const saved = await store.save(profile());

    expect((await store.load())?.id).toBe(saved.id);
    expect(JSON.parse(await readFile(store.filePath, "utf8"))).toMatchObject({
      id: "ranked-en-1080p",
    });
  });

  test("rejects duplicate and out-of-frame slots", () => {
    const value = profile();
    value.slots[1] = value.slots[0] as (typeof value.slots)[number];
    expect(() => validateDetectorProfile(value)).toThrow("Duplicate");
    const outside = profile();
    const first = outside.slots[0];
    if (!first) throw new Error("Expected a detector slot fixture.");
    first.rect.x = 1915;
    expect(() => validateDetectorProfile(outside)).toThrow("outside");
  });

  test("loads available PNG references and reports missing heroes", async () => {
    const root = await mkdtemp(join(tmpdir(), "shayyz-detector-refs-"));
    await sharp({
      create: { width: 16, height: 16, channels: 3, background: "blue" },
    })
      .png()
      .toFile(join(root, "miya.png"));

    const result = await loadReferenceDescriptors(root, ["miya", "layla"]);
    expect(result.references.map(({ heroId }) => heroId)).toEqual(["miya"]);
    expect(result.missing).toEqual(["layla"]);
  });

  test("requires complete validated coverage for automatic mode", () => {
    const parsed = validateDetectorProfile(profile());
    expect(isAutomaticProfileReady(parsed, 133)).toBe(true);
    expect(isAutomaticProfileReady(parsed, 132)).toBe(false);
  });
});
