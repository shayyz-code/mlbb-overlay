import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPosterMap,
  ffmpegArguments,
  parsePosterMap,
  renderPosters,
} from "./private-posters";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

test("creates a template for all 133 canonical heroes", () => {
  const map = createPosterMap();
  expect(map.clips).toHaveLength(133);
  expect(new Set(map.clips.map((clip) => clip.heroId)).size).toBe(133);
  expect(() => parsePosterMap(map, true)).toThrow("all 133 heroes");
});

test("builds a silent VP9 crop without shell interpolation", () => {
  const map = createPosterMap();
  const source = map.clips[0];
  if (!source) throw new Error("Expected a hero template.");
  const clip = {
    ...source,
    input: "session one.mp4",
    startSeconds: 12.5,
  };
  const args = ffmpegArguments("/private/session one.mp4", "/private/poster.webm", map, clip);
  expect(args).toContain("libvpx-vp9");
  expect(args).toContain("-an");
  expect(args).toContain(
    "crop=810:1080:555:0,scale=540:720:flags=lanczos,fps=30",
  );
  expect(args).toContain("/private/session one.mp4");
});

test("rejects unknown and duplicate hero IDs", () => {
  const map = createPosterMap();
  expect(() =>
    parsePosterMap({ ...map, clips: [{ ...map.clips[0], heroId: "unknown" }] }),
  ).toThrow("Unknown hero ID");
  expect(() => parsePosterMap({ ...map, clips: [map.clips[0], map.clips[0]] })).toThrow(
    "Duplicate hero ID",
  );
});

test("updates and verifies an ignored pack manifest atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-posters-"));
  directories.push(directory);
  const pack = join(directory, "pack");
  const recording = join(directory, "recording.mp4");
  const mapPath = join(directory, "map.json");
  const manifestPath = join(pack, "manifest.json");
  await mkdir(pack, { recursive: true });
  await writeFile(recording, "recording");
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      pack: {
        id: "mlbb-personal",
        displayName: "Personal MLBB media",
        usage: "personal-local-no-redistribution",
        createdAt: new Date().toISOString(),
      },
      heroes: { miya: {} },
      cues: {},
    }),
  );
  const map = createPosterMap();
  const miya = map.clips.find((clip) => clip.heroId === "miya");
  if (!miya) throw new Error("Expected Miya in the hero template.");
  await writeFile(
    mapPath,
    JSON.stringify({
      ...map,
      clips: [
        {
          ...miya,
          input: "recording.mp4",
          startSeconds: 1,
        },
      ],
    }),
  );
  const result = await renderPosters({
    mapPath,
    manifestPath,
    ffmpeg: "ffmpeg",
    complete: false,
    force: false,
    run: async (command) => {
      const output = command.at(-1);
      if (!output) throw new Error("Missing fake output path.");
      await writeFile(output, "webm");
      return { code: 0, stderr: "" };
    },
  });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  expect(result.rendered).toBe(1);
  expect(manifest.heroes.miya.poster).toMatchObject({
    path: "heroes/miya/poster.webm",
    mimeType: "video/webm",
  });
});
