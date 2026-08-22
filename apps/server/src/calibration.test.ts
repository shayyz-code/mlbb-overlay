import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DetectorProfileSchema } from "@shayyz/contracts";
import { DetectorProfileStore, type ScreenshotSource } from "@shayyz/detector";
import { DetectorCalibrationService } from "./calibration";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

function profile() {
  return DetectorProfileSchema.parse({
    schemaVersion: 1 as const,
    id: "local-profile",
    gameBuild: "test-build",
    language: "en",
    sourceName: "MLBB Capture",
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
      proposal: 0.94,
      automatic: 0.985,
      proposalMargin: 0.015,
      automaticMargin: 0.025,
      empty: 0.98,
    },
    validation: { referenceCount: 0, validatedAt: null },
  });
}

describe("DetectorCalibrationService", () => {
  test("captures PNG and closes the OBS source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shayyz-calibration-"));
    directories.push(directory);
    const calls: string[] = [];
    const imageData = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    const source: ScreenshotSource = {
      connect: async () => {
        calls.push("connect");
      },
      screenshot: async () => imageData,
      close: () => {
        calls.push("close");
      },
    };
    const service = new DetectorCalibrationService({
      profileStore: new DetectorProfileStore(join(directory, "profile.json")),
      emptyFramePath: join(directory, "empty-frame.png"),
      screenshotSource: () => source,
    });

    expect(await service.capture("MLBB Capture")).toBe(imageData);
    expect(calls).toEqual(["connect", "close"]);
  });

  test("persists a validated profile and private empty frame", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shayyz-calibration-"));
    directories.push(directory);
    const profileStore = new DetectorProfileStore(
      join(directory, "detector/profile.json"),
    );
    const emptyFramePath = join(directory, "detector/empty-frame.png");
    const service = new DetectorCalibrationService({
      profileStore,
      emptyFramePath,
      screenshotSource: () => {
        throw new Error("Not used.");
      },
    });
    const bytes = Buffer.from("private-empty-frame");

    const saved = await service.save({
      profile: profile(),
      emptyFrameData: `data:image/png;base64,${bytes.toString("base64")}`,
    });
    expect(saved.slots).toHaveLength(20);
    expect(await profileStore.load()).toEqual(saved);
    expect(await readFile(emptyFramePath)).toEqual(bytes);
  });
});
