import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  DetectorDatasetManifestSchema,
  PixelRectSchema,
  type DetectorDatasetManifest,
  type PixelRect,
  type SelectionKind,
  type Side,
} from "../packages/contracts/src/index";
import sharp from "sharp";
import { canonicalHeroIds } from "./import-assets";

export interface AddDetectorSampleOptions {
  root: string;
  input: string;
  crop: PixelRect;
  heroId: string;
  kind: SelectionKind;
  side: Side;
  slot: number;
  gameBuild: string;
  sessionId: string;
  sourceKind?: "local-capture" | "roboflow-seed" | "synthetic";
  sourceLicense?: string;
  attribution?: string;
}

function splitForSession(sessionId: string): "train" | "validation" | "test" {
  const bucket =
    Number.parseInt(
      createHash("sha256").update(sessionId).digest("hex").slice(0, 8),
      16,
    ) % 100;
  if (bucket < 80) return "train";
  if (bucket < 90) return "validation";
  return "test";
}

async function loadManifest(path: string): Promise<DetectorDatasetManifest> {
  try {
    return DetectorDatasetManifestSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        samples: [],
      };
    throw error;
  }
}

export async function addDetectorSample(
  options: AddDetectorSampleOptions,
): Promise<DetectorDatasetManifest["samples"][number]> {
  if (!canonicalHeroIds.includes(options.heroId))
    throw new Error(`Unknown hero ID: ${options.heroId}`);
  const crop = PixelRectSchema.parse(options.crop);
  if (!/^[a-zA-Z0-9-]+$/.test(options.sessionId))
    throw new Error(
      "Session ID must contain only letters, numbers, and hyphens.",
    );
  if (!Number.isInteger(options.slot) || options.slot < 0 || options.slot > 4)
    throw new Error("Slot must be an integer from zero through four.");

  const root = resolve(options.root);
  const manifestPath = resolve(root, "manifest.json");
  const manifest = await loadManifest(manifestPath);
  const png = await sharp(resolve(options.input), { failOn: "error" })
    .extract({
      left: crop.x,
      top: crop.y,
      width: crop.width,
      height: crop.height,
    })
    .resize(224, 224, { fit: "fill" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const sha256 = createHash("sha256").update(png).digest("hex");
  if (manifest.samples.some((sample) => sample.file.sha256 === sha256))
    throw new Error(`Duplicate detector sample: ${sha256}`);

  const target = resolve(root, "samples", options.heroId, `${sha256}.png`);
  const pathFromRoot = relative(root, target).replaceAll("\\", "/");
  const sourceKind = options.sourceKind ?? "local-capture";
  const sample = DetectorDatasetManifestSchema.shape.samples.element.parse({
    heroId: options.heroId,
    kind: options.kind,
    side: options.side,
    slot: options.slot,
    gameBuild: options.gameBuild,
    sessionId: options.sessionId,
    split: splitForSession(options.sessionId),
    source: {
      kind: sourceKind,
      license:
        options.sourceLicense ??
        (sourceKind === "roboflow-seed"
          ? "CC-BY-4.0"
          : "personal-local-no-redistribution"),
      ...(options.attribution ? { attribution: options.attribution } : {}),
    },
    file: { path: pathFromRoot, sha256 },
  });
  await mkdir(dirname(target), { recursive: true });
  const temporaryImage = `${target}.tmp-${crypto.randomUUID()}`;
  const temporaryManifest = `${manifestPath}.tmp`;
  try {
    await Bun.write(temporaryImage, png);
    await rename(temporaryImage, target);
    await Bun.write(
      temporaryManifest,
      `${JSON.stringify(
        DetectorDatasetManifestSchema.parse({
          ...manifest,
          samples: [...manifest.samples, sample],
        }),
        null,
        2,
      )}\n`,
    );
    await rename(temporaryManifest, manifestPath);
  } catch (error) {
    await Promise.all([
      rm(temporaryImage, { force: true }),
      rm(temporaryManifest, { force: true }),
      rm(target, { force: true }),
    ]);
    throw error;
  }
  return sample;
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

if (import.meta.main) {
  const cropValues = (argument("--crop") ?? "").split(",").map(Number);
  if (cropValues.length !== 4 || cropValues.some((value) => !Number.isFinite(value)))
    throw new Error("--crop must contain x,y,width,height.");
  const [x = 0, y = 0, width = 0, height = 0] = cropValues;
  const required = (name: string) => {
    const value = argument(name);
    if (!value) throw new Error(`Missing ${name}.`);
    return value;
  };
  const sample = await addDetectorSample({
    root: argument("--output") ?? "captures/detector-dataset",
    input: required("--input"),
    crop: { x, y, width, height },
    heroId: required("--hero"),
    kind: required("--kind") as SelectionKind,
    side: required("--side") as Side,
    slot: Number(required("--slot")),
    gameBuild: required("--game-build"),
    sessionId: required("--session"),
  });
  console.log(JSON.stringify(sample, null, 2));
}
