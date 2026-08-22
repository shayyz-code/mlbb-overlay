import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import sharp from "sharp";
import { canonicalHeroIds } from "./import-assets";
import {
  generateSyntheticDataset,
  renderHeroSlot,
} from "./private-synthetic-dataset";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

function hash(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture(duplicate = false) {
  const root = await mkdtemp(join(tmpdir(), "shayyz-synthetic-"));
  directories.push(root);
  const pack = join(root, "pack");
  const heroIds = canonicalHeroIds.slice(0, 2);
  const heroes: Record<string, unknown> = {};
  await mkdir(pack, { recursive: true });
  for (const [index, heroId] of heroIds.entries()) {
    const png = await sharp({
      create: {
        width: 300,
        height: 240,
        channels: 3,
        background: duplicate || index === 0 ? "#db7245" : "#3889c9",
      },
    })
      .png()
      .toBuffer();
    const path = `${heroId}.png`;
    await Bun.write(join(pack, path), png);
    heroes[heroId as string] = {
      portrait: { path, sha256: hash(png), mimeType: "image/png" },
    };
  }
  await Bun.write(
    join(pack, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      pack: {
        id: "test-private",
        displayName: "Test private portraits",
        usage: "personal-local-no-redistribution",
        createdAt: "2026-08-22T00:00:00.000Z",
      },
      heroes,
      cues: {},
    }),
  );
  return { root, pack, heroIds };
}

test("renders the same draft-slot augmentation for the same seed", async () => {
  const portrait = await sharp({
    create: { width: 300, height: 240, channels: 3, background: "orange" },
  })
    .png()
    .toBuffer();
  const first = await renderHeroSlot(portrait, "fixed-seed", "pick", "blue");
  const second = await renderHeroSlot(portrait, "fixed-seed", "pick", "blue");
  expect(hash(first)).toBe(hash(second));
  expect(await sharp(first).metadata()).toMatchObject({
    width: 224,
    height: 224,
    channels: 3,
  });
});

test("generates balanced private hero, empty, and unknown classes", async () => {
  const { root, pack, heroIds } = await fixture();
  const manifest = await generateSyntheticDataset({
    assetManifest: join(pack, "manifest.json"),
    output: join(root, "dataset"),
    gameBuild: "2.1.95.12065",
    attribution: "Private portrait fixture",
    seed: 42,
    variants: 10,
    heroIds,
  });
  expect(manifest.samples).toHaveLength(40);
  for (const label of [...heroIds, "empty", "unknown"])
    expect(
      manifest.samples.filter((sample) => sample.heroId === label),
    ).toHaveLength(10);
  expect(new Set(manifest.samples.map((sample) => sample.split))).toEqual(
    new Set(["train", "validation", "test"]),
  );
  expect(JSON.stringify(manifest)).not.toContain(pack);
  expect(
    JSON.parse(await readFile(join(root, "dataset", "manifest.json"), "utf8")),
  ).toEqual(manifest);
});

test("rejects duplicate or missing private portraits", async () => {
  const { root, pack, heroIds } = await fixture(true);
  const options = {
    assetManifest: join(pack, "manifest.json"),
    output: join(root, "dataset"),
    gameBuild: "2.1.95.12065",
    attribution: "Private portrait fixture",
    seed: 42,
    variants: 10,
    heroIds,
  };
  await expect(generateSyntheticDataset(options)).rejects.toThrow("Duplicate");
  const missing = await fixture();
  await expect(
    generateSyntheticDataset({
      ...options,
      assetManifest: join(missing.pack, "manifest.json"),
      output: join(missing.root, "dataset"),
      heroIds: canonicalHeroIds.slice(0, 3),
    }),
  ).rejects.toThrow("Missing private portrait");
});
