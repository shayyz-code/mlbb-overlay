import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDraftReferenceMap,
  extractDraftReferences,
  ffmpegArguments,
  parseDraftReferenceMap,
} from "./private-draft-references";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

test("creates an unset template for all canonical heroes", () => {
  const map = createDraftReferenceMap("2.1.95.12065");
  expect(map.clips).toHaveLength(133);
  expect(new Set(map.clips.map((clip) => clip.heroId)).size).toBe(133);
  expect(map.crop).toBeNull();
  expect(() => parseDraftReferenceMap(map, true)).toThrow("requires a crop");
});

test("rejects unknown and duplicate hero IDs", () => {
  const map = createDraftReferenceMap("build");
  expect(() =>
    parseDraftReferenceMap({
      ...map,
      clips: [{ ...map.clips[0], heroId: "unknown" }],
    }),
  ).toThrow("Unknown hero ID");
  expect(() =>
    parseDraftReferenceMap({ ...map, clips: [map.clips[0], map.clips[0]] }),
  ).toThrow("Duplicate hero ID");
});

test("builds one fixed crop without shell interpolation", () => {
  const args = ffmpegArguments(
    "/private/session one.mp4",
    "/private/miya.png",
    { x: 10, y: 20, width: 160, height: 160 },
    { width: 256, height: 256 },
    12.5,
  );
  expect(args).toContain("/private/session one.mp4");
  expect(args).toContain("crop=160:160:10:20,scale=256:256:flags=lanczos");
  expect(args).toContain("1");
});

test("extracts atomically and resumes existing references", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-draft-refs-"));
  directories.push(directory);
  const recording = join(directory, "session.mp4");
  const mapPath = join(directory, "map.json");
  const output = join(directory, "refs");
  await writeFile(recording, "recording");
  const map = createDraftReferenceMap("build");
  await writeFile(
    mapPath,
    JSON.stringify({
      ...map,
      crop: { x: 10, y: 20, width: 160, height: 160 },
      clips: [{ ...map.clips[0], input: "session.mp4", atSeconds: 1 }],
    }),
  );
  const options = {
    mapPath,
    output,
    ffmpeg: "ffmpeg",
    complete: false,
    force: false,
    run: async (command: string[]) => {
      const target = command.at(-1);
      if (!target) throw new Error("Missing fake output.");
      await writeFile(target, "png");
      return { code: 0, stderr: "" };
    },
  };
  expect((await extractDraftReferences(options)).extracted).toBe(1);
  expect((await extractDraftReferences(options)).skipped).toBe(1);
});
