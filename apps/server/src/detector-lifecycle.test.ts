import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DetectorProfileSchema } from "@shayyz/contracts";
import { DetectorCoordinator } from "./detector";
import {
  DetectorLifecycle,
  type RecognitionLoop,
  validateObsUrl,
} from "./detector-lifecycle";
import { DraftStore } from "./store";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

async function coordinator(configured = true): Promise<DetectorCoordinator> {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-lifecycle-"));
  directories.push(directory);
  const store = new DraftStore(directory);
  await store.initialize();
  const profile = configured
    ? DetectorProfileSchema.parse({
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
        thresholds: {},
        validation: { referenceCount: 0, validatedAt: null },
      })
    : null;
  return new DetectorCoordinator({
    store,
    profile,
    referenceCount: configured ? 1 : 0,
    automaticReady: false,
  });
}

describe("DetectorLifecycle", () => {
  test("starts and stops a configured recognition loop", async () => {
    const detector = await coordinator();
    detector.setMode("proposal");
    const calls: string[] = [];
    const loop: RecognitionLoop = {
      start: async () => {
        calls.push("start");
      },
      stop: () => {
        calls.push("stop");
      },
    };
    const lifecycle = new DetectorLifecycle(detector, async () => loop);

    await lifecycle.start();
    expect(detector.status().running).toBe(true);
    lifecycle.stop();
    expect(detector.status().running).toBe(false);
    expect(calls).toEqual(["start", "stop"]);
  });

  test("reports startup failures without marking the detector running", async () => {
    const detector = await coordinator();
    detector.setMode("proposal");
    const lifecycle = new DetectorLifecycle(detector, async () => {
      throw new Error("OBS unavailable");
    });

    await expect(lifecycle.start()).rejects.toThrow("OBS unavailable");
    expect(detector.status()).toMatchObject({
      running: false,
      lastError: "OBS unavailable",
    });
  });

  test("rejects unconfigured startup and non-loopback OBS URLs", async () => {
    const detector = await coordinator(false);
    detector.setMode("proposal");
    const lifecycle = new DetectorLifecycle(detector, async () => ({
      start: async () => undefined,
      stop: () => undefined,
    }));

    await expect(lifecycle.start()).rejects.toThrow("profile");
    expect(() => validateObsUrl("ws://192.168.1.5:4455")).toThrow("loopback");
    expect(validateObsUrl("ws://127.0.0.1:4455")).toStartWith("ws://127.0.0.1");
  });
});
