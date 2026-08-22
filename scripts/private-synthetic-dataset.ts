import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  AssetPackManifestSchema,
  DetectorDatasetManifestSchema,
  type DetectorDatasetManifest,
  type SelectionKind,
  type Side,
} from "../packages/contracts/src/index";
import sharp from "sharp";
import { canonicalHeroIds } from "./import-assets";

export interface SyntheticDatasetOptions {
  assetManifest: string;
  output: string;
  gameBuild: string;
  attribution: string;
  seed: number;
  variants: number;
  heroIds?: readonly string[];
}

function randomFor(value: string): () => number {
  let state = Number.parseInt(
    createHash("sha256").update(value).digest("hex").slice(0, 8),
    16,
  );
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fadeMask(): Buffer {
  return Buffer.from(`<svg width="224" height="224">
    <defs><linearGradient id="fade"><stop offset="0" stop-opacity="0"/><stop offset=".16" stop-opacity="1"/><stop offset=".84" stop-opacity="1"/><stop offset="1" stop-opacity="0"/></linearGradient></defs>
    <rect width="224" height="224" fill="url(#fade)"/>
  </svg>`);
}

function background(side: Side, random: () => number): Buffer {
  const blue = side === "blue";
  const hue: [number, number, number] = blue ? [12, 45, 72] : [73, 18, 31];
  const shift = Math.round(random() * 14);
  return Buffer.from(`<svg width="224" height="224">
    <defs><radialGradient id="glow"><stop stop-color="rgb(${hue[0] + shift},${hue[1] + shift},${hue[2] + shift})"/><stop offset="1" stop-color="rgb(5,8,14)"/></radialGradient></defs>
    <rect width="224" height="224" fill="url(#glow)"/>
  </svg>`);
}

export async function renderHeroSlot(
  portrait: Buffer,
  key: string,
  kind: SelectionKind,
  side: Side,
): Promise<Buffer> {
  const random = randomFor(key);
  const width = 238 + Math.round(random() * 42);
  const left = Math.round(random() * (width - 224));
  let image = sharp(portrait, { failOn: "error" })
    .rotate()
    .resize(width, 224, { fit: "cover", position: "attention" })
    .extract({ left, top: 0, width: 224, height: 224 })
    .flop(side === "red")
    .modulate({
      brightness: 0.84 + random() * 0.28,
      saturation:
        kind === "ban" ? 0.18 + random() * 0.16 : 0.88 + random() * 0.24,
    });
  if (random() < 0.35) image = image.blur(0.3 + random() * 0.65);
  const faded = await image
    .ensureAlpha()
    .composite([{ input: fadeMask(), blend: "dest-in" }])
    .png()
    .toBuffer();
  const tint = side === "blue" ? "#176caa" : "#a72546";
  const composed = sharp(background(side, random))
    .composite([
      { input: faded, blend: "over" },
      {
        input: Buffer.from(
          `<svg width="224" height="224"><rect width="224" height="224" fill="${tint}" fill-opacity="${kind === "ban" ? 0.24 : 0.08}"/></svg>`,
        ),
        blend: "over",
      },
    ])
    .removeAlpha();
  const compressed = await composed
    .jpeg({
      quality: 72 + Math.round(random() * 24),
      chromaSubsampling: "4:2:0",
    })
    .toBuffer();
  return sharp(compressed).png({ compressionLevel: 9 }).toBuffer();
}

async function renderEmptySlot(key: string, side: Side): Promise<Buffer> {
  const random = randomFor(key);
  return sharp(background(side, random))
    .composite([
      {
        input: Buffer.from(
          `<svg width="224" height="224"><path d="M20 0V224M204 0V224" stroke="#fff" stroke-opacity=".06" stroke-width="3"/><rect x="45" width="134" height="224" fill="#000" fill-opacity="${0.08 + random() * 0.16}"/></svg>`,
        ),
      },
    ])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderUnknownSlot(
  first: Buffer,
  second: Buffer,
  key: string,
  side: Side,
): Promise<Buffer> {
  const [left, right] = await Promise.all([
    renderHeroSlot(first, `${key}-a`, "pick", side),
    renderHeroSlot(second, `${key}-b`, "ban", side),
  ]);
  return sharp(left)
    .composite([{ input: right, blend: "screen" }])
    .blur(1.4)
    .composite([
      {
        input: Buffer.from(
          '<svg width="224" height="224"><rect width="224" height="224" fill="#05070c" fill-opacity=".32"/></svg>',
        ),
      },
    ])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function portraitFiles(
  manifestPath: string,
  heroIds: readonly string[],
): Promise<Map<string, Buffer>> {
  const parsed = AssetPackManifestSchema.parse(
    JSON.parse(await readFile(resolve(manifestPath), "utf8")),
  );
  const root = await realpath(dirname(resolve(manifestPath)));
  const result = new Map<string, Buffer>();
  const hashes = new Set<string>();
  for (const heroId of heroIds) {
    const file = parsed.heroes[heroId]?.portrait;
    if (!file) throw new Error(`Missing private portrait: ${heroId}`);
    const requested = resolve(root, file.path);
    if ((await lstat(requested)).isSymbolicLink())
      throw new Error(`Symbolic links are not allowed: ${file.path}`);
    const path = await realpath(requested);
    if (relative(root, path).startsWith(".."))
      throw new Error(`Portrait escapes its asset pack: ${file.path}`);
    const buffer = Buffer.from(await Bun.file(path).arrayBuffer());
    const actual = sha256(buffer);
    if (actual !== file.sha256)
      throw new Error(`Checksum mismatch: ${file.path}`);
    if (hashes.has(actual))
      throw new Error(`Duplicate private portrait: ${heroId}`);
    hashes.add(actual);
    result.set(heroId, buffer);
  }
  return result;
}

function metadata(
  label: string,
  index: number,
  options: SyntheticDatasetOptions,
) {
  const side: Side = index % 2 === 0 ? "blue" : "red";
  const kind: SelectionKind = index % 4 < 2 ? "pick" : "ban";
  const split =
    index % 10 < 8 ? "train" : index % 10 === 8 ? "validation" : "test";
  return {
    side,
    kind,
    split,
    slot: index % 5,
    sessionId: `synthetic-${options.seed}-${label}-${index}`,
  } as const;
}

export async function generateSyntheticDataset(
  options: SyntheticDatasetOptions,
) {
  if (!Number.isSafeInteger(options.seed))
    throw new Error("Seed must be a safe integer.");
  if (
    !Number.isInteger(options.variants) ||
    options.variants < 10 ||
    options.variants > 1_000
  )
    throw new Error("Variants must be an integer from 10 through 1000.");
  if (!options.gameBuild.trim() || !options.attribution.trim())
    throw new Error("Game build and portrait attribution are required.");
  const heroIds = [...(options.heroIds ?? canonicalHeroIds)];
  if (
    new Set(heroIds).size !== heroIds.length ||
    heroIds.some((id) => !canonicalHeroIds.includes(id))
  )
    throw new Error("Hero IDs must be unique canonical heroes.");
  const portraits = await portraitFiles(options.assetManifest, heroIds);
  const output = resolve(options.output);
  if (await Bun.file(resolve(output, "manifest.json")).exists())
    throw new Error("Dataset already exists; choose a new output directory.");
  const staging = `${output}.staging-${crypto.randomUUID()}`;
  const samples: DetectorDatasetManifest["samples"] = [];
  const hashes = new Set<string>();
  try {
    for (const label of [...heroIds, "empty", "unknown"]) {
      for (let index = 0; index < options.variants; index += 1) {
        const meta = metadata(label, index, options);
        const key = `${options.seed}:${label}:${index}`;
        const first = portraits.get(heroIds[index % heroIds.length] as string);
        const second = portraits.get(
          heroIds[(index + 1) % heroIds.length] as string,
        );
        if (!first || !second)
          throw new Error("At least one hero portrait is required.");
        const png =
          label === "empty"
            ? await renderEmptySlot(key, meta.side)
            : label === "unknown"
              ? await renderUnknownSlot(first, second, key, meta.side)
              : await renderHeroSlot(
                  portraits.get(label) as Buffer,
                  key,
                  meta.kind,
                  meta.side,
                );
        const hash = sha256(png);
        if (hashes.has(hash)) throw new Error(`Duplicate generated sample: ${label}`);
        hashes.add(hash);
        const path = `samples/${label}/${hash}.png`;
        await mkdir(dirname(resolve(staging, path)), { recursive: true });
        await Bun.write(resolve(staging, path), png);
        samples.push({
          heroId: label,
          ...meta,
          gameBuild: options.gameBuild,
          source: {
            kind: "synthetic",
            license: "personal-local-no-redistribution",
            attribution: options.attribution,
          },
          file: { path, sha256: hash },
        });
      }
    }
    const manifest = DetectorDatasetManifestSchema.parse({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      samples,
    });
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
  const output = argument("--output") ?? "captures/detector-synthetic";
  const captureRoot = resolve("captures");
  if (relative(captureRoot, resolve(output)).startsWith(".."))
    throw new Error("Synthetic datasets must be written under captures/.");
  const manifest = await generateSyntheticDataset({
    assetManifest:
      argument("--asset-pack") ?? "vendor-assets/mlbb-personal/manifest.json",
    output,
    gameBuild: required("--game-build"),
    attribution: required("--attribution"),
    seed: Number(argument("--seed") ?? "20260822"),
    variants: Number(argument("--variants") ?? "24"),
  });
  console.log(
    JSON.stringify({ samples: manifest.samples.length, output }, null, 2),
  );
}
