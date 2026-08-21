import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalAssetPack } from "./assets";

export async function assetFixture(): Promise<{
  directory: string;
  pack: LocalAssetPack;
}> {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-pack-"));
  const path = join(directory, "heroes/miya/portrait.png");
  await mkdir(join(directory, "heroes/miya"), { recursive: true });
  await writeFile(path, "private portrait");
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update("private portrait");
  await Bun.write(
    join(directory, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      pack: {
        id: "test-pack",
        displayName: "Test media",
        usage: "personal-local-no-redistribution",
        createdAt: new Date().toISOString(),
      },
      heroes: {
        miya: {
          portrait: {
            path: "heroes/miya/portrait.png",
            sha256: hasher.digest("hex"),
            mimeType: "image/png",
          },
        },
      },
      cues: {},
    }),
  );
  const pack = await LocalAssetPack.load(join(directory, "manifest.json"));
  if (!pack) throw new Error("Fixture pack was not loaded.");
  return { directory, pack };
}
