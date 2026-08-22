import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import sharp from "sharp";
import { canonicalHeroIds } from "./import-assets";
import { addDetectorSample } from "./private-detector-dataset";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shayyz-dataset-"));
  directories.push(root);
  const input = join(root, "full-private-frame.png");
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: "blue" },
  })
    .png()
    .toFile(input);
  return { root: join(root, "dataset"), input };
}

test("stores only normalized private slot crops with provenance", async () => {
  const { root, input } = await fixture();
  const heroId = canonicalHeroIds[0];
  if (!heroId) throw new Error("Expected a canonical hero fixture.");
  const sample = await addDetectorSample({
    root,
    input,
    crop: { x: 1, y: 1, width: 4, height: 4 },
    heroId,
    kind: "pick",
    side: "blue",
    slot: 0,
    gameBuild: "2.1.95.12065",
    sessionId: "draft-001",
  });
  const manifest = JSON.parse(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  expect(manifest.samples).toEqual([sample]);
  expect(JSON.stringify(manifest)).not.toContain(input);
  expect(sample.source.license).toBe("personal-local-no-redistribution");
  expect(sample.file.path).toStartWith(`samples/${heroId}/`);
  expect(await sharp(join(root, sample.file.path)).metadata()).toMatchObject({
    width: 224,
    height: 224,
    channels: 3,
  });
});

test("rejects unknown heroes and duplicate image hashes", async () => {
  const { root, input } = await fixture();
  const options = {
    root,
    input,
    crop: { x: 0, y: 0, width: 4, height: 4 },
    heroId: canonicalHeroIds[0] as string,
    kind: "ban" as const,
    side: "red" as const,
    slot: 1,
    gameBuild: "2.1.95.12065",
    sessionId: "draft-002",
  };
  await addDetectorSample(options);
  await expect(addDetectorSample(options)).rejects.toThrow("Duplicate");
  await expect(
    addDetectorSample({ ...options, heroId: "not-a-hero" }),
  ).rejects.toThrow("Unknown hero ID");
});
