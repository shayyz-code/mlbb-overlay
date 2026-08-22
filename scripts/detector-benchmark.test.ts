import { describe, expect, test } from "bun:test";
import { DetectorReplayManifestSchema } from "../packages/contracts/src/index";
import {
  summarizeBenchmark,
  type BenchmarkOutcome,
} from "./detector-benchmark";

function outcomes(count = 1_000): BenchmarkOutcome[] {
  return Array.from({ length: count }, (_, index) => ({
    expectedHeroId: `hero-${index}`,
    detectedHeroId: `hero-${index}`,
    latencyMs: 600,
  }));
}

describe("detector replay benchmark", () => {
  test("promotes only complete, accurate, low-latency coverage", () => {
    const passing = summarizeBenchmark(
      "profile",
      50,
      133,
      outcomes(),
      new Date(0),
    );
    expect(passing).toMatchObject({
      eligible: true,
      precision: 1,
      recall: 1,
      p95LatencyMs: 600,
    });

    const inaccurate = outcomes();
    for (let index = 0; index < 21; index += 1) {
      const outcome = inaccurate[index];
      if (outcome) outcome.detectedHeroId = "wrong";
    }
    const failing = summarizeBenchmark("profile", 49, 132, inaccurate);
    expect(failing.eligible).toBe(false);
    expect(failing.failures).toEqual([
      "At least 50 complete drafts are required.",
      "All 133 hero references are required.",
      "Precision must be at least 99.5%.",
      "Recall must be at least 98%.",
    ]);
  });

  test("requires 20 selections and safe local frame paths", () => {
    const selection = {
      expectedHeroId: "miya",
      transitionAtMs: 100,
      frames: Array.from({ length: 4 }, (_, observedAtMs) => ({
        path: "draft-01/frame.png",
        observedAtMs,
      })),
    };
    expect(() =>
      DetectorReplayManifestSchema.parse({
        schemaVersion: 1,
        drafts: [{ id: "draft-01", selections: [selection] }],
      }),
    ).toThrow();
    expect(() =>
      DetectorReplayManifestSchema.parse({
        schemaVersion: 1,
        drafts: [
          {
            id: "draft-01",
            selections: Array.from({ length: 20 }, () => ({
              ...selection,
              frames: Array.from({ length: 4 }, (_, observedAtMs) => ({
                path: "../private.png",
                observedAtMs,
              })),
            })),
          },
        ],
      }),
    ).toThrow();
  });
});
