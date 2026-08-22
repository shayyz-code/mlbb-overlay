import { describe, expect, test } from "bun:test";
import { DetectorProfileSchema } from "@shayyz/contracts";
import sharp from "sharp";
import {
  describeEncodedImage,
  ObsDraftRecognitionLoop,
  type DraftCandidate,
  type ScreenshotSource,
} from ".";

async function frame(filled: boolean): Promise<Uint8Array> {
  const data = new Uint8Array(100 * 100 * 3).fill(90);
  if (filled) {
    for (let y = 0; y < 10; y += 1)
      for (let x = 0; x < 10; x += 1) {
        const offset = (y * 100 + x) * 3;
        data[offset] = (x + y) % 2 ? 230 : 20;
        data[offset + 1] = x * 20;
        data[offset + 2] = y * 20;
      }
  }
  return new Uint8Array(
    await sharp(data, { raw: { width: 100, height: 100, channels: 3 } })
      .png()
      .toBuffer(),
  );
}

describe("OBS draft recognition", () => {
  test("emits the expected phase after empty and three stable frames", async () => {
    const empty = await frame(false);
    const filled = await frame(true);
    const screenshots = [empty, filled, filled, filled];
    const source: ScreenshotSource = {
      connect: async () => undefined,
      close: () => undefined,
      screenshot: async () => {
        const next = screenshots.shift();
        if (!next) throw new Error("Missing screenshot fixture.");
        return `data:image/png;base64,${Buffer.from(next).toString("base64")}`;
      },
    };
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
      validation: { referenceCount: 133, validatedAt: null },
    });
    const candidates: DraftCandidate[] = [];
    const loop = new ObsDraftRecognitionLoop({
      source,
      profile,
      references: [
        {
          heroId: "miya",
          descriptor: await describeEncodedImage(filled, {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          }),
        },
      ],
      emptyFrame: empty,
      context: () => ({
        revision: 0,
        phaseIndex: 0,
        phase: { side: "blue", kind: "ban", slot: 0 },
        usedHeroIds: [],
      }),
      candidate: (candidate) => {
        candidates.push(candidate);
      },
    });
    await loop.initialize();
    for (const time of [0, 200, 400, 600]) await loop.sampleOnce(time);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      heroId: "miya",
      side: "blue",
      kind: "ban",
      phaseIndex: 0,
      evidenceFrames: 3,
    });
  });
});
