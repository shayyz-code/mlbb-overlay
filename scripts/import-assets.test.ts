import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importDraftAssets, verifyAssetPack } from "./import-assets";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

test("imports aliased personal draft media and verifies checksums", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-assets-"));
  directories.push(directory);
  const source = join(directory, "source");
  const output = join(directory, "pack");
  await mkdir(join(source, "HeroPick"), { recursive: true });
  await mkdir(join(source, "VoiceLines"), { recursive: true });
  await mkdir(join(source, "Other"), { recursive: true });
  await writeFile(join(source, "HeroPick", "luoyi.png"), "portrait");
  await writeFile(join(source, "HeroPick", "luo yi.png"), "portrait");
  await writeFile(join(source, "VoiceLines", "luoyi.ogg"), "voice");
  await writeFile(join(source, "Other", "leftpicking.gif"), "cue");

  const imported = await importDraftAssets({ source, output });
  expect(imported.manifest.heroes["luo-yi"]).toMatchObject({
    portrait: { mimeType: "image/png" },
    voice: { mimeType: "audio/ogg" },
  });
  expect(imported.missing).toContain("hirara:portrait");
  const verified = await verifyAssetPack(join(output, "manifest.json"));
  expect(verified.files).toBe(3);
  expect(verified.missing).toContain("marcel:poster");
});
