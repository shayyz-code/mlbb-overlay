import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
} from "node:fs/promises";
import { basename, dirname, extname, relative, resolve } from "node:path";
import {
  AssetPackManifestSchema,
  type AssetFile,
  type AssetPackManifest,
} from "../packages/contracts/src/index";
import heroCatalog from "../config/heroes.json";

const aliases: Record<string, string> = {
  arlot: "arlott",
  beleric: "belerick",
  carmila: "carmilla",
  change: "chang-e",
  dyroth: "dyrroth",
  fredrin: "fredrinn",
  lapulapu: "lapu-lapu",
  luoyi: "luo-yi",
  minotour: "minotaur",
  parsha: "pharsa",
  popolandkupa: "popol-and-kupa",
  xborg: "x-borg",
  yisunshin: "yi-sun-shin",
  yuzhong: "yu-zhong",
};

const cueFiles = {
  bluePick: "leftpicking.gif",
  redPick: "rightpicking.gif",
  blueBan: "leftbanning.gif",
  redBan: "rightbanning.gif",
} as const;

function slug(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return aliases[normalized] ?? normalized;
}

export const canonicalHeroIds = heroCatalog.map(({ name }) => slug(name));

async function sha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(path).arrayBuffer());
  return hasher.digest("hex");
}

async function assetFile(
  source: string,
  stagingRoot: string,
  targetPath: string,
  mimeType: AssetFile["mimeType"],
): Promise<AssetFile> {
  const target = resolve(stagingRoot, targetPath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  return { path: targetPath, sha256: await sha256(target), mimeType };
}

async function indexedFiles(directory: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const name of (await readdir(directory).catch(() => [])).sort()) {
    const id = slug(basename(name, extname(name)));
    const path = resolve(directory, name);
    const previous = result.get(id);
    if (previous && (await sha256(previous)) !== (await sha256(path)))
      throw new Error(`Ambiguous media files for ${id}.`);
    if (!previous) result.set(id, path);
  }
  return result;
}

export async function importDraftAssets(options: {
  source: string;
  output: string;
  gameBuild?: string;
}): Promise<{ manifest: AssetPackManifest; missing: string[] }> {
  const source = resolve(options.source);
  const output = resolve(options.output);
  const staging = `${output}.staging-${crypto.randomUUID()}`;
  const portraits = await indexedFiles(resolve(source, "HeroPick"));
  const voices = await indexedFiles(resolve(source, "VoiceLines"));
  const heroes: AssetPackManifest["heroes"] = {};
  const missing: string[] = [];

  await mkdir(staging, { recursive: true });
  for (const id of canonicalHeroIds) {
    const portrait = portraits.get(id);
    const voice = voices.get(id);
    if (!portrait) missing.push(`${id}:portrait`);
    if (!voice) missing.push(`${id}:voice`);
    heroes[id] = {
      ...(portrait
        ? {
            portrait: await assetFile(
              portrait,
              staging,
              `heroes/${id}/portrait.png`,
              "image/png",
            ),
          }
        : {}),
      ...(voice
        ? {
            voice: await assetFile(
              voice,
              staging,
              `heroes/${id}/voice.ogg`,
              "audio/ogg",
            ),
          }
        : {}),
    };
  }

  const cues: AssetPackManifest["cues"] = {};
  for (const [id, name] of Object.entries(cueFiles)) {
    const sourcePath = resolve(source, "Other", name);
    if (!(await Bun.file(sourcePath).exists())) continue;
    cues[id as keyof typeof cues] = await assetFile(
      sourcePath,
      staging,
      `cues/${name}`,
      "image/gif",
    );
  }

  const manifest = AssetPackManifestSchema.parse({
    schemaVersion: 1,
    pack: {
      id: "mlbb-personal",
      displayName: "Personal MLBB media",
      usage: "personal-local-no-redistribution",
      createdAt: new Date().toISOString(),
      ...(options.gameBuild ? { gameBuild: options.gameBuild } : {}),
    },
    heroes,
    cues,
  });
  await Bun.write(
    resolve(staging, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  if (await Bun.file(resolve(output, "manifest.json")).exists())
    await rename(output, `${output}.backup-${Date.now()}`);
  await rename(staging, output);
  return { manifest, missing };
}

export async function verifyAssetPack(
  manifestPath: string,
): Promise<{ missing: string[]; files: number }> {
  const manifest = AssetPackManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const root = await realpath(dirname(resolve(manifestPath)));
  const files = [
    ...Object.values(manifest.heroes).flatMap((hero) =>
      [hero.portrait, hero.poster, hero.voice].filter(
        (value): value is AssetFile => Boolean(value),
      ),
    ),
    ...Object.values(manifest.cues).filter((value): value is AssetFile =>
      Boolean(value),
    ),
    ...Object.values(manifest.roles).filter((value): value is AssetFile =>
      Boolean(value),
    ),
  ];
  for (const file of files) {
    const path = resolve(root, file.path);
    if ((await lstat(path)).isSymbolicLink())
      throw new Error(`Symbolic links are not allowed: ${file.path}`);
    const actual = await realpath(path);
    if (relative(root, actual).startsWith(".."))
      throw new Error(`Asset escapes its pack: ${file.path}`);
    if ((await sha256(actual)) !== file.sha256)
      throw new Error(`Checksum mismatch: ${file.path}`);
  }
  const missing = canonicalHeroIds.flatMap((id) => {
    const media = manifest.heroes[id];
    return [
      ...(!media?.portrait ? [`${id}:portrait`] : []),
      ...(!media?.voice ? [`${id}:voice`] : []),
      ...(!media?.poster ? [`${id}:poster`] : []),
    ];
  });
  return { missing, files: files.length };
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

if (import.meta.main) {
  const output = argument("--output") ?? "vendor-assets/mlbb-personal";
  if (Bun.argv.includes("--verify")) {
    const result = await verifyAssetPack(resolve(output, "manifest.json"));
    console.log(JSON.stringify(result, null, 2));
    if (Bun.argv.includes("--complete") && result.missing.length > 0)
      process.exitCode = 1;
  } else {
    const source = argument("--source");
    if (!source) throw new Error("--source is required.");
    const gameBuild = argument("--game-build");
    const result = await importDraftAssets({
      source,
      output,
      ...(gameBuild ? { gameBuild } : {}),
    });
    console.log(JSON.stringify({ missing: result.missing }, null, 2));
  }
}
