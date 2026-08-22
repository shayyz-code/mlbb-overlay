import { createHash } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  classifyLogits,
  loadDetectorModelBundle,
  prepareClassifierInput,
} from "./model";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

const heroIds = Array.from(
  { length: 133 },
  (_, index) => `hero-${String(index).padStart(3, "0")}`,
);
const input = {
  width: 224 as const,
  height: 224 as const,
  channels: 3 as const,
  layout: "nchw" as const,
  colorSpace: "rgb" as const,
  mean: [0, 0, 0] as [number, number, number],
  std: [1, 1, 1] as [number, number, number],
};

describe("ONNX slot classifier", () => {
  test("verifies local model metadata and canonical label order", async () => {
    const root = await mkdtemp(join(tmpdir(), "shayyz-model-"));
    directories.push(root);
    const model = new Uint8Array([1, 2, 3]);
    await Bun.write(join(root, "model.onnx"), model);
    await Bun.write(
      join(root, "manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "shayyz-mlbb-draft-classifier",
        revision: "abcdef1",
        architecture: "mobilenet-v3-small",
        model: {
          path: "model.onnx",
          sha256: createHash("sha256").update(model).digest("hex"),
          sizeBytes: model.length,
          precision: "fp32",
          inputName: "input",
          outputName: "logits",
        },
        input,
        labels: [...heroIds, "empty", "unknown"],
        validation: {
          validatedAt: null,
          top1Accuracy: null,
          macroRecall: null,
          unknownFalseAcceptRate: null,
        },
      }),
    );

    const bundle = await loadDetectorModelBundle(
      join(root, "manifest.json"),
      heroIds,
    );
    expect(bundle.modelPath).toBe(await realpath(join(root, "model.onnx")));
    await expect(
      loadDetectorModelBundle(
        join(root, "manifest.json"),
        [...heroIds].reverse(),
      ),
    ).rejects.toThrow("canonical hero order");
  });

  test("prepares normalized NCHW RGB input", async () => {
    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const tensor = await prepareClassifierInput(
      new Uint8Array(image),
      { x: 0, y: 0, width: 2, height: 2 },
      input,
    );
    const pixels = 224 * 224;
    expect(tensor).toHaveLength(pixels * 3);
    expect(tensor[0]).toBe(1);
    expect(tensor[pixels]).toBe(0);
    expect(tensor[pixels * 2]).toBe(0);
  });

  test("converts logits to a normalized top-two result", () => {
    const result = classifyLogits(new Float32Array([3, 1, 0]), [
      "miya",
      "empty",
      "unknown",
    ]);
    expect(result.label).toBe("miya");
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.margin).toBeGreaterThan(0.7);
  });
});
