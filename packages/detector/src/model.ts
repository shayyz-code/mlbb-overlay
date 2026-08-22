import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  DetectorModelManifestSchema,
  type DetectorModelManifest,
  type PixelRect,
} from "@shayyz/contracts";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

export interface DetectorModelBundle {
  manifest: DetectorModelManifest;
  modelPath: string;
}

export interface ClassifierResult {
  label: string;
  confidence: number;
  runnerUpConfidence: number;
  margin: number;
}

export async function loadDetectorModelBundle(
  manifestPath: string,
  expectedHeroIds: string[],
): Promise<DetectorModelBundle> {
  const manifest = DetectorModelManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  if (
    expectedHeroIds.length !== 133 ||
    !expectedHeroIds.every((heroId, index) => manifest.labels[index] === heroId)
  )
    throw new Error(
      "Detector model labels do not match the canonical hero order.",
    );

  const root = await realpath(dirname(resolve(manifestPath)));
  const candidate = resolve(root, manifest.model.path);
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot))
    throw new Error("Detector model path escapes its manifest directory.");
  const modelPath = await realpath(candidate);
  const realPathFromRoot = relative(root, modelPath);
  if (realPathFromRoot.startsWith("..") || isAbsolute(realPathFromRoot))
    throw new Error("Detector model symlink escapes its manifest directory.");

  const modelBytes = await readFile(modelPath);
  if ((await stat(modelPath)).size !== manifest.model.sizeBytes)
    throw new Error("Detector model size does not match its manifest.");
  const sha256 = createHash("sha256").update(modelBytes).digest("hex");
  if (sha256 !== manifest.model.sha256)
    throw new Error("Detector model checksum does not match its manifest.");
  return { manifest, modelPath };
}

export async function prepareClassifierInput(
  image: Uint8Array,
  rect: PixelRect,
  input: DetectorModelManifest["input"],
): Promise<Float32Array> {
  const { data, info } = await sharp(image, { failOn: "error" })
    .extract({
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
    })
    .resize(input.width, input.height, { fit: "fill" })
    .toColorspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== input.channels)
    throw new Error("Classifier input must contain packed RGB pixels.");
  const pixels = input.width * input.height;
  const tensor = new Float32Array(pixels * input.channels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    for (let channel = 0; channel < input.channels; channel += 1) {
      const value = (data[pixel * input.channels + channel] ?? 0) / 255;
      tensor[channel * pixels + pixel] =
        (value - (input.mean[channel] ?? 0)) / (input.std[channel] ?? 1);
    }
  }
  return tensor;
}

export function classifyLogits(
  logits: Float32Array,
  labels: string[],
): ClassifierResult {
  if (logits.length !== labels.length)
    throw new Error("Classifier output length does not match its labels.");
  const maximum = Math.max(...logits);
  const probabilities = logits.map((value) => Math.exp(value - maximum));
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  const ranked = [...probabilities.keys()]
    .map((index) => ({
      index,
      confidence: (probabilities[index] ?? 0) / total,
    }))
    .sort((left, right) => right.confidence - left.confidence);
  const best = ranked[0];
  if (!best) throw new Error("Classifier returned no predictions.");
  const runnerUpConfidence = ranked[1]?.confidence ?? 0;
  return {
    label: labels[best.index] ?? "unknown",
    confidence: best.confidence,
    runnerUpConfidence,
    margin: best.confidence - runnerUpConfidence,
  };
}

export class OnnxSlotClassifier {
  private constructor(
    readonly manifest: DetectorModelManifest,
    private readonly session: ort.InferenceSession,
  ) {}

  static async create(
    bundle: DetectorModelBundle,
  ): Promise<OnnxSlotClassifier> {
    const session = await ort.InferenceSession.create(bundle.modelPath, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });
    return new OnnxSlotClassifier(bundle.manifest, session);
  }

  async classify(
    image: Uint8Array,
    rect: PixelRect,
  ): Promise<ClassifierResult> {
    const input = await prepareClassifierInput(
      image,
      rect,
      this.manifest.input,
    );
    const tensor = new ort.Tensor("float32", input, [
      1,
      this.manifest.input.channels,
      this.manifest.input.height,
      this.manifest.input.width,
    ]);
    const result = await this.session.run({
      [this.manifest.model.inputName]: tensor,
    });
    const output = result[this.manifest.model.outputName];
    if (!output || !(output.data instanceof Float32Array))
      throw new Error("Classifier returned an invalid logits tensor.");
    return classifyLogits(output.data, this.manifest.labels);
  }
}
