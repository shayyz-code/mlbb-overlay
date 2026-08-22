import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DraftReferenceMapSchema,
  type DraftReferenceMap,
  type PixelRect,
} from "../packages/contracts/src/index";
import heroCatalog from "../config/heroes.json";
import { canonicalHeroIds } from "./import-assets";

interface ProcessResult {
  code: number;
  stderr: string;
}

type Runner = (command: string[]) => Promise<ProcessResult>;

export function createDraftReferenceMap(gameBuild: string): DraftReferenceMap {
  return {
    schemaVersion: 1,
    gameBuild,
    crop: null,
    output: { width: 256, height: 256 },
    clips: heroCatalog.map((hero, index) => ({
      heroId: canonicalHeroIds[index] as string,
      name: hero.name,
      input: "",
      atSeconds: null,
    })),
  };
}

export function parseDraftReferenceMap(
  value: unknown,
  complete = false,
): DraftReferenceMap {
  const map = DraftReferenceMapSchema.parse(value);
  const known = new Set(canonicalHeroIds);
  const seen = new Set<string>();
  for (const clip of map.clips) {
    if (!known.has(clip.heroId))
      throw new Error(`Unknown hero ID: ${clip.heroId}`);
    if (seen.has(clip.heroId))
      throw new Error(`Duplicate hero ID: ${clip.heroId}`);
    seen.add(clip.heroId);
  }
  if (complete) {
    const ready = map.clips.filter(
      (clip) => clip.input.length > 0 && clip.atSeconds !== null,
    );
    if (!map.crop) throw new Error("Complete extraction requires a crop.");
    if (seen.size !== canonicalHeroIds.length || ready.length !== known.size)
      throw new Error(`Complete extraction requires all ${known.size} heroes.`);
  }
  return map;
}

export function ffmpegArguments(
  input: string,
  output: string,
  crop: PixelRect,
  size: { width: number; height: number },
  atSeconds: number,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(atSeconds),
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${size.width}:${size.height}:flags=lanczos`,
    "-y",
    output,
  ];
}

export async function extractDraftReferences(options: {
  mapPath: string;
  output: string;
  ffmpeg: string;
  complete: boolean;
  force: boolean;
  run: Runner;
}) {
  const mapPath = resolve(options.mapPath);
  const map = parseDraftReferenceMap(
    JSON.parse(await readFile(mapPath, "utf8")),
    options.complete,
  );
  if (!map.crop) throw new Error("Set the draft-slot crop before extraction.");
  const output = resolve(options.output);
  await mkdir(output, { recursive: true });
  let extracted = 0;
  let skipped = 0;
  for (const clip of map.clips) {
    if (!clip.input || clip.atSeconds === null) continue;
    const target = resolve(output, `${clip.heroId}.png`);
    if ((await Bun.file(target).exists()) && !options.force) {
      skipped += 1;
      continue;
    }
    const temporary = `${target}.tmp-${crypto.randomUUID()}.png`;
    const input = resolve(dirname(mapPath), clip.input);
    if (!(await Bun.file(input).exists()))
      throw new Error(`Missing recording: ${clip.input}`);
    const result = await options.run([
      options.ffmpeg,
      ...ffmpegArguments(
        input,
        temporary,
        map.crop,
        map.output,
        clip.atSeconds,
      ),
    ]);
    if (result.code !== 0) {
      await rm(temporary, { force: true });
      throw new Error(`ffmpeg failed for ${clip.heroId}: ${result.stderr}`);
    }
    await rename(temporary, target);
    extracted += 1;
  }
  const missing = await missingReferences(output);
  if (options.complete && missing.length > 0)
    throw new Error(`Missing ${missing.length} draft references.`);
  return { extracted, skipped, missing };
}

export async function missingReferences(output: string): Promise<string[]> {
  const root = resolve(output);
  const missing: string[] = [];
  for (const id of canonicalHeroIds)
    if (!(await Bun.file(resolve(root, `${id}.png`)).exists()))
      missing.push(id);
  return missing;
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
    const gameBuild = argument("--game-build");
    if (!gameBuild) throw new Error("--game-build is required.");
    const output = resolve(
      argument("--output") ?? "captures/draft-reference-map.json",
    );
    await mkdir(dirname(output), { recursive: true });
    await Bun.write(
      output,
      `${JSON.stringify(createDraftReferenceMap(gameBuild), null, 2)}\n`,
    );
    console.log(
      `Private ${canonicalHeroIds.length}-hero map written to ${output}`,
    );
  } else if (command === "extract") {
    const mapPath = argument("--map") ?? "captures/draft-reference-map.json";
    const raw = JSON.parse(await readFile(resolve(mapPath), "utf8"));
    const map = parseDraftReferenceMap(raw);
    const result = await extractDraftReferences({
      mapPath,
      output:
        argument("--output") ??
        `captures/detector-references/${map.gameBuild}/pick-art`,
      ffmpeg: argument("--ffmpeg") ?? "ffmpeg",
      complete: Bun.argv.includes("--complete"),
      force: Bun.argv.includes("--force"),
      run,
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "verify") {
    const output = argument("--output");
    if (!output) throw new Error("--output is required.");
    const missing = await missingReferences(output);
    console.log(
      JSON.stringify({ heroes: canonicalHeroIds.length, missing }, null, 2),
    );
    if (Bun.argv.includes("--complete") && missing.length > 0)
      process.exitCode = 1;
  } else {
    throw new Error("Use template, extract, or verify.");
  }
}
