import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  AssetPackManifestSchema,
  type AssetFile,
} from "../packages/contracts/src/index";
import heroCatalog from "../config/heroes.json";
import { canonicalHeroIds, verifyAssetPack } from "./import-assets";

export interface PosterMap {
  schemaVersion: 1;
  crop: { x: number; y: number; width: number; height: number };
  output: { width: number; height: number; fps: number };
  clips: Array<{
    heroId: string;
    name?: string;
    input: string;
    startSeconds: number | null;
    durationSeconds: number;
  }>;
}

interface ProcessResult {
  code: number;
  stderr: string;
}

type Runner = (command: string[]) => Promise<ProcessResult>;

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${name} must be a finite number.`);
  return value;
}

export function parsePosterMap(value: unknown, complete = false): PosterMap {
  if (!value || typeof value !== "object") throw new Error("Invalid poster map.");
  const map = value as Partial<PosterMap>;
  if (map.schemaVersion !== 1 || !map.crop || !map.output || !Array.isArray(map.clips))
    throw new Error("Poster map schemaVersion, crop, output, and clips are required.");
  const crop = {
    x: finiteNumber(map.crop.x, "crop.x"),
    y: finiteNumber(map.crop.y, "crop.y"),
    width: finiteNumber(map.crop.width, "crop.width"),
    height: finiteNumber(map.crop.height, "crop.height"),
  };
  const output = {
    width: finiteNumber(map.output.width, "output.width"),
    height: finiteNumber(map.output.height, "output.height"),
    fps: finiteNumber(map.output.fps, "output.fps"),
  };
  if (crop.x < 0 || crop.y < 0 || crop.width < 2 || crop.height < 2)
    throw new Error("Crop values must define a positive rectangle.");
  if (output.width < 2 || output.height < 2 || output.fps < 1 || output.fps > 60)
    throw new Error("Output dimensions and FPS are outside supported limits.");

  const known = new Set(canonicalHeroIds);
  const seen = new Set<string>();
  const clips = map.clips.map((clip, index) => {
    if (!clip || typeof clip !== "object") throw new Error(`Invalid clip ${index}.`);
    if (!known.has(clip.heroId)) throw new Error(`Unknown hero ID: ${clip.heroId}`);
    if (seen.has(clip.heroId)) throw new Error(`Duplicate hero ID: ${clip.heroId}`);
    seen.add(clip.heroId);
    const durationSeconds = finiteNumber(
      clip.durationSeconds,
      `${clip.heroId}.durationSeconds`,
    );
    if (durationSeconds < 1 || durationSeconds > 15)
      throw new Error(`${clip.heroId} duration must be between 1 and 15 seconds.`);
    const startSeconds =
      clip.startSeconds === null
        ? null
        : finiteNumber(clip.startSeconds, `${clip.heroId}.startSeconds`);
    if (startSeconds !== null && startSeconds < 0)
      throw new Error(`${clip.heroId} start must not be negative.`);
    return {
      heroId: clip.heroId,
      ...(clip.name ? { name: clip.name } : {}),
      input: String(clip.input ?? ""),
      startSeconds,
      durationSeconds,
    };
  });
  if (complete) {
    const ready = clips.filter((clip) => clip.input && clip.startSeconds !== null);
    if (seen.size !== canonicalHeroIds.length || ready.length !== canonicalHeroIds.length)
      throw new Error(`Complete rendering requires all ${canonicalHeroIds.length} heroes.`);
  }
  return { schemaVersion: 1, crop, output, clips };
}

export function createPosterMap(): PosterMap {
  return {
    schemaVersion: 1,
    crop: { x: 555, y: 0, width: 810, height: 1080 },
    output: { width: 540, height: 720, fps: 30 },
    clips: heroCatalog.map((hero, index) => ({
      heroId: canonicalHeroIds[index] as string,
      name: hero.name,
      input: "",
      startSeconds: null,
      durationSeconds: 4,
    })),
  };
}

export function ffmpegArguments(
  input: string,
  outputPath: string,
  map: PosterMap,
  clip: PosterMap["clips"][number],
): string[] {
  const { crop, output } = map;
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(clip.startSeconds),
    "-i",
    input,
    "-t",
    String(clip.durationSeconds),
    "-vf",
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${output.width}:${output.height}:flags=lanczos,fps=${output.fps}`,
    "-an",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "34",
    "-b:v",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-y",
    outputPath,
  ];
}

async function sha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(path).arrayBuffer());
  return hasher.digest("hex");
}

export async function renderPosters(options: {
  mapPath: string;
  manifestPath: string;
  ffmpeg: string;
  complete: boolean;
  force: boolean;
  run: Runner;
}) {
  const mapPath = resolve(options.mapPath);
  const map = parsePosterMap(
    JSON.parse(await readFile(mapPath, "utf8")),
    options.complete,
  );
  const manifestPath = resolve(options.manifestPath);
  const packRoot = dirname(manifestPath);
  const manifest = AssetPackManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const staged: Array<{ heroId: string; temporary: string; target: string }> = [];
  for (const clip of map.clips) {
    if (!clip.input || clip.startSeconds === null) continue;
    const target = resolve(packRoot, "heroes", clip.heroId, "poster.webm");
    const pathFromPack = relative(packRoot, target);
    if (pathFromPack.startsWith("..")) throw new Error("Poster target escapes its pack.");
    if ((await Bun.file(target).exists()) && !options.force) continue;
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${crypto.randomUUID()}.webm`;
    const input = resolve(dirname(mapPath), clip.input);
    if (!(await Bun.file(input).exists())) throw new Error(`Missing recording: ${clip.input}`);
    const result = await options.run([
      options.ffmpeg,
      ...ffmpegArguments(input, temporary, map, clip),
    ]);
    if (result.code !== 0) {
      await rm(temporary, { force: true });
      throw new Error(`ffmpeg failed for ${clip.heroId}: ${result.stderr}`);
    }
    staged.push({ heroId: clip.heroId, temporary, target });
  }
  for (const item of staged) {
    await rename(item.temporary, item.target);
    const file: AssetFile = {
      path: relative(packRoot, item.target),
      sha256: await sha256(item.target),
      mimeType: "video/webm",
    };
    manifest.heroes[item.heroId] = {
      ...manifest.heroes[item.heroId],
      poster: file,
    };
  }
  const temporaryManifest = `${manifestPath}.tmp-${crypto.randomUUID()}`;
  await Bun.write(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporaryManifest, manifestPath);
  const verified = await verifyAssetPack(manifestPath);
  if (options.complete && verified.missing.some((item) => item.endsWith(":poster")))
    throw new Error("The private pack still has missing posters.");
  return { rendered: staged.length, missingPosters: verified.missing.filter((item) => item.endsWith(":poster")) };
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

async function run(command: string[]): Promise<ProcessResult> {
  const process = Bun.spawn(command, { stdout: "inherit", stderr: "pipe" });
  const [stderr, code] = await Promise.all([
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { code, stderr };
}

if (import.meta.main) {
  const command = Bun.argv[2];
  if (command === "template") {
    const output = resolve(argument("--output") ?? "captures/poster-map.json");
    await mkdir(dirname(output), { recursive: true });
    await Bun.write(output, `${JSON.stringify(createPosterMap(), null, 2)}\n`);
    console.log(`Private ${canonicalHeroIds.length}-hero map written to ${output}`);
  } else if (command === "record") {
    const adb = argument("--adb") ?? "adb";
    const serial = argument("--serial");
    if (!serial) throw new Error("--serial is required.");
    const duration = Number(argument("--duration") ?? "180");
    if (!Number.isInteger(duration) || duration < 1 || duration > 180)
      throw new Error("--duration must be an integer from 1 to 180 seconds.");
    const output = resolve(
      argument("--output") ?? `captures/android-recordings/${Date.now()}.mp4`,
    );
    await mkdir(dirname(output), { recursive: true });
    const remote = `/sdcard/Download/shayyz-${crypto.randomUUID()}.mp4`;
    const recorded = await run([
      adb,
      "-s",
      serial,
      "shell",
      "screenrecord",
      "--time-limit",
      String(duration),
      "--bit-rate",
      "12000000",
      remote,
    ]);
    if (recorded.code !== 0) throw new Error(recorded.stderr);
    const pulled = await run([adb, "-s", serial, "pull", remote, output]);
    await run([adb, "-s", serial, "shell", "rm", remote]);
    if (pulled.code !== 0) throw new Error(pulled.stderr);
    console.log(`Private recording written to ${output}`);
  } else if (command === "render") {
    const pack = argument("--pack") ?? "vendor-assets/mlbb-personal/manifest.json";
    const result = await renderPosters({
      mapPath: argument("--map") ?? "captures/poster-map.json",
      manifestPath: pack,
      ffmpeg: argument("--ffmpeg") ?? "ffmpeg",
      complete: Bun.argv.includes("--complete"),
      force: Bun.argv.includes("--force"),
      run,
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error("Use template, record, or render.");
  }
}
