import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { canonicalHeroIds } from "./import-assets";
import {
  assertReleaseGates,
  parseTrainingMetrics,
  releaseDetectorModel,
} from "./private-model-release";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

const passing = {
  test: {
    top1Accuracy: 0.99,
    macroRecall: 0.98,
    unknownFalseAcceptRate: 0.004,
  },
  onnxMaximumAbsoluteDifference: 0.0001,
};

test("rejects metrics below every detector release gate", () => {
  expect(() => assertReleaseGates(parseTrainingMetrics(passing))).not.toThrow();
  for (const metrics of [
    { ...passing, test: { ...passing.test, top1Accuracy: 0.98 } },
    { ...passing, test: { ...passing.test, macroRecall: 0.96 } },
    { ...passing, test: { ...passing.test, unknownFalseAcceptRate: 0.006 } },
    { ...passing, onnxMaximumAbsoluteDifference: 0.002 },
  ])
    expect(() => assertReleaseGates(parseTrainingMetrics(metrics))).toThrow();
});

test("packages a checksummed model with canonical labels atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "shayyz-model-release-"));
  directories.push(root);
  const model = join(root, "trained.onnx");
  const metrics = join(root, "metrics.json");
  const output = join(root, "release");
  await Bun.write(model, new Uint8Array([1, 2, 3]));
  await Bun.write(metrics, JSON.stringify(passing));
  const manifest = await releaseDetectorModel({
    model,
    metrics,
    output,
    validatedAt: "2026-08-22T00:00:00.000Z",
  });
  expect(manifest.labels).toEqual([...canonicalHeroIds, "empty", "unknown"]);
  expect(manifest.model).toMatchObject({
    path: "model.onnx",
    sizeBytes: 3,
    precision: "fp32",
  });
  expect(
    JSON.parse(await readFile(join(output, "manifest.json"), "utf8")),
  ).toEqual(manifest);
  expect(await Bun.file(join(output, "model.onnx")).bytes()).toEqual(
    new Uint8Array([1, 2, 3]),
  );
});
