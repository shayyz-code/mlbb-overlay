import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  DetectorModelManifestSchema,
  type DetectorModelManifest,
} from "../packages/contracts/src/index";
import { canonicalHeroIds } from "./import-assets";

interface TrainingMetrics {
  test: {
    top1Accuracy: number;
    macroRecall: number;
    unknownFalseAcceptRate: number;
  };
  onnxMaximumAbsoluteDifference: number;
}

export interface ReleaseDetectorModelOptions {
  model: string;
  metrics: string;
  output: string;
  validatedAt?: string;
}

function finiteMetric(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Missing finite training metric: ${name}`);
  return value;
}

export function parseTrainingMetrics(value: unknown): TrainingMetrics {
  if (!value || typeof value !== "object")
    throw new Error("Training metrics must be an object.");
  const root = value as Record<string, unknown>;
  const test = root.test;
  if (!test || typeof test !== "object")
    throw new Error("Training metrics must include test results.");
  const result = test as Record<string, unknown>;
  return {
    test: {
      top1Accuracy: finiteMetric(result.top1Accuracy, "test.top1Accuracy"),
      macroRecall: finiteMetric(result.macroRecall, "test.macroRecall"),
      unknownFalseAcceptRate: finiteMetric(
        result.unknownFalseAcceptRate,
        "test.unknownFalseAcceptRate",
      ),
    },
    onnxMaximumAbsoluteDifference: finiteMetric(
      root.onnxMaximumAbsoluteDifference,
      "onnxMaximumAbsoluteDifference",
    ),
  };
}

export function assertReleaseGates(metrics: TrainingMetrics): void {
  if (metrics.test.top1Accuracy < 0.985)
    throw new Error("Top-1 accuracy is below the 98.5% release gate.");
  if (metrics.test.macroRecall < 0.97)
    throw new Error("Macro recall is below the 97% release gate.");
  if (metrics.test.unknownFalseAcceptRate > 0.005)
    throw new Error("Unknown false-accept rate exceeds the 0.5% release gate.");
  if (metrics.onnxMaximumAbsoluteDifference > 0.001)
    throw new Error("ONNX parity difference exceeds 0.001.");
}

export async function releaseDetectorModel(
  options: ReleaseDetectorModelOptions,
): Promise<DetectorModelManifest> {
  const model = resolve(options.model);
  const metrics = parseTrainingMetrics(
    JSON.parse(await readFile(resolve(options.metrics), "utf8")),
  );
  assertReleaseGates(metrics);
  const bytes = await readFile(model);
  const sizeBytes = (await stat(model)).size;
  if (sizeBytes > 16 * 1024 * 1024)
    throw new Error("Detector model exceeds the 16 MB release limit.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const output = resolve(options.output);
  if (await Bun.file(resolve(output, "manifest.json")).exists())
    throw new Error(
      "Model release already exists; choose a new output directory.",
    );
  const manifest = DetectorModelManifestSchema.parse({
    schemaVersion: 1,
    id: "shayyz-mlbb-draft-classifier",
    revision: sha256.slice(0, 12),
    architecture: "mobilenet-v3-small",
    model: {
      path: "model.onnx",
      sha256,
      sizeBytes,
      precision: "fp32",
      inputName: "input",
      outputName: "logits",
    },
    input: {
      width: 224,
      height: 224,
      channels: 3,
      layout: "nchw",
      colorSpace: "rgb",
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
    },
    labels: [...canonicalHeroIds, "empty", "unknown"],
    validation: {
      validatedAt: options.validatedAt ?? new Date().toISOString(),
      top1Accuracy: metrics.test.top1Accuracy,
      macroRecall: metrics.test.macroRecall,
      unknownFalseAcceptRate: metrics.test.unknownFalseAcceptRate,
    },
  });
  const staging = `${output}.staging-${crypto.randomUUID()}`;
  try {
    await mkdir(staging, { recursive: true });
    await copyFile(model, resolve(staging, "model.onnx"));
    await Bun.write(
      resolve(staging, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await mkdir(dirname(output), { recursive: true });
    await rename(staging, output);
    return manifest;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

if (import.meta.main) {
  const required = (name: string) => {
    const value = argument(name);
    if (!value) throw new Error(`Missing ${name}.`);
    return value;
  };
  const output = argument("--output") ?? "captures/model-release";
  if (relative(resolve("captures"), resolve(output)).startsWith(".."))
    throw new Error("Private model releases must be written under captures/.");
  const manifest = await releaseDetectorModel({
    model: required("--model"),
    metrics: required("--metrics"),
    output,
  });
  console.log(
    JSON.stringify(
      { revision: manifest.revision, metrics: manifest.validation, output },
      null,
      2,
    ),
  );
}
