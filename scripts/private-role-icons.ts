import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  AssetPackManifestSchema,
  type AssetFile,
  type PlayerRole,
} from "../packages/contracts/src/index";

export const roleIds: PlayerRole[] = ["exp", "jungle", "mid", "gold", "roam"];
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const sourcePages: Record<PlayerRole, string> = {
  exp: "https://liquipedia.net/commons/File:Mobile_Legends_EXP_Lane.png",
  jungle: "https://liquipedia.net/commons/File:Mobile_Legends_Jungle.png",
  mid: "https://liquipedia.net/commons/File:Mobile_Legends_Mid_Lane.png",
  gold: "https://liquipedia.net/commons/File:Mobile_Legends_Gold_Lane.png",
  roam: "https://liquipedia.net/commons/File:Mobile_Legends_Roamer.png",
};

function sha256(bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.tmp-${crypto.randomUUID()}`;
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function installRoleIcons(options: {
  source: string;
  manifestPath: string;
  attribution: string;
}): Promise<Record<PlayerRole, AssetFile>> {
  const manifestPath = resolve(options.manifestPath);
  const packRoot = await realpath(dirname(manifestPath));
  const sourceRoot = await realpath(resolve(options.source));
  const manifest = AssetPackManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const roles = {} as Record<PlayerRole, AssetFile>;
  await mkdir(join(packRoot, "roles"), { recursive: true });
  for (const role of roleIds) {
    const source = join(sourceRoot, `${role}.png`);
    if ((await lstat(source)).isSymbolicLink())
      throw new Error(`Role icon symbolic links are not allowed: ${role}.png`);
    const bytes = new Uint8Array(await Bun.file(source).arrayBuffer());
    if (
      bytes.length < pngSignature.length ||
      !pngSignature.every((byte, index) => bytes[index] === byte)
    )
      throw new Error(`Role icon must be a PNG: ${role}.png`);
    if (bytes.length > 1024 * 1024)
      throw new Error(`Role icon exceeds 1 MB: ${role}.png`);
    const digest = sha256(bytes);
    const relativePath = `roles/${role}-${digest.slice(0, 12)}.png`;
    await copyFile(source, join(packRoot, relativePath));
    roles[role] = { path: relativePath, sha256: digest, mimeType: "image/png" };
  }
  await atomicJson(manifestPath, { ...manifest, roles });
  await atomicJson(join(packRoot, "roles/provenance.json"), {
    attribution: options.attribution,
    copyright: "Moonton Games",
    usage: "personal-local-no-redistribution",
    retrievedAt: new Date().toISOString(),
    sources: sourcePages,
  });
  return roles;
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

if (import.meta.main) {
  const source = argument("--source");
  if (!source) throw new Error("--source is required.");
  const manifestPath =
    argument("--manifest") ?? "vendor-assets/mlbb-personal/manifest.json";
  const attribution = argument("--attribution") ?? "Liquipedia role icon files";
  const roles = await installRoleIcons({ source, manifestPath, attribution });
  console.log(JSON.stringify({ installed: Object.keys(roles) }, null, 2));
}
