import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssetPackManifest } from "../packages/contracts/src/index";
import {
  comfyPrompt,
  createIdlePosterJobs,
  deterministicSeed,
  generateIdlePosters,
  localComfyUrl,
  posterFfmpegArguments,
  requestComfyOutput,
} from "./private-idle-posters";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

const manifest: AssetPackManifest = {
  schemaVersion: 1,
  pack: {
    id: "mlbb-personal",
    displayName: "Personal MLBB media",
    usage: "personal-local-no-redistribution",
    createdAt: new Date().toISOString(),
  },
  heroes: {
    miya: {
      portrait: {
        path: "heroes/miya/portrait.png",
        sha256: "a".repeat(64),
        mimeType: "image/png",
      },
    },
  },
  roles: {},
  cues: {},
};

test("prepares deterministic jobs only for available portraits", () => {
  const first = createIdlePosterJobs(manifest, "revision");
  const second = createIdlePosterJobs(manifest, "revision");
  expect(first.jobs).toHaveLength(1);
  expect(first.jobs[0]?.seed).toBe(second.jobs[0]?.seed);
  expect(deterministicSeed("miya", "revision")).not.toBe(
    deterministicSeed("miya", "other"),
  );
});

test("builds the official core SVD-XT workflow with PNG output", () => {
  const queue = createIdlePosterJobs(manifest, "revision");
  const job = queue.jobs[0];
  if (!job) throw new Error("Expected a job.");
  const prompt = comfyPrompt(queue, job, "miya.png");
  expect(prompt["12"].inputs).toMatchObject({
    width: 576,
    height: 1024,
    video_frames: 25,
    motion_bucket_id: 40,
    augmentation_level: 0.02,
  });
  expect(prompt["15"].inputs.ckpt_name).toBe("svd_xt_1_1.safetensors");
  expect(prompt["10"].class_type).toBe("SaveImage");
});

test("creates a silent four-second ping-pong VP9 poster", () => {
  const args = posterFfmpegArguments("frame-%03d.png", "poster.webm");
  expect(args).toContain("libvpx-vp9");
  expect(args).toContain("-an");
  expect(args).toContain("4");
  expect(args.join(" ")).toContain("reverse");
  expect(args.join(" ")).toContain("scale=540:720");
});

test("accepts only loopback ComfyUI endpoints", () => {
  expect(localComfyUrl("http://127.0.0.1:8188").hostname).toBe("127.0.0.1");
  expect(() => localComfyUrl("https://example.com")).toThrow("loopback");
});

test("uploads, queues, polls, and downloads from loopback ComfyUI", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-comfy-"));
  directories.push(directory);
  const source = join(directory, "miya.png");
  await writeFile(source, "portrait");
  const queue = createIdlePosterJobs(manifest, "revision");
  const job = queue.jobs[0];
  if (!job) throw new Error("Expected a job.");
  const requests: string[] = [];
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/upload/image"))
      return Response.json({ name: "server-miya.png", subfolder: "" });
    if (url.endsWith("/prompt")) {
      const body = JSON.parse(String(init?.body));
      expect(body.prompt["23"].inputs.image).toBe("server-miya.png");
      return Response.json({ prompt_id: "prompt-1" });
    }
    if (url.includes("/history/"))
      return Response.json({
        "prompt-1": {
          outputs: {
            "10": {
              images: Array.from({ length: 25 }, (_, index) => ({
                filename: `output-${index}.png`,
                subfolder: "",
                type: "output",
              })),
            },
          },
        },
      });
    return new Response("png");
  }) as typeof fetch;
  const result = await requestComfyOutput({
    endpoint: "http://127.0.0.1:8188",
    queue,
    job,
    source,
    fetcher,
    sleep: async () => {},
    maxPolls: 1,
  });
  expect(result).toHaveLength(25);
  expect(await result[0]?.text()).toBe("png");
  expect(requests).toHaveLength(28);
});

test("installs a generated poster atomically and resumes it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-idle-runner-"));
  directories.push(directory);
  const packRoot = join(directory, "pack");
  const source = join(packRoot, "heroes", "miya", "portrait.png");
  const packPath = join(packRoot, "manifest.json");
  const queuePath = join(directory, "jobs.json");
  await mkdir(join(packRoot, "heroes", "miya"), { recursive: true });
  await writeFile(source, "portrait");
  const sourceSha256 = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(source).arrayBuffer())
    .digest("hex");
  const localManifest: AssetPackManifest = {
    ...manifest,
    heroes: {
      miya: {
        portrait: {
          path: "heroes/miya/portrait.png",
          sha256: sourceSha256,
          mimeType: "image/png",
        },
      },
    },
  };
  await writeFile(packPath, JSON.stringify(localManifest));
  await writeFile(
    queuePath,
    JSON.stringify(createIdlePosterJobs(localManifest, "revision", packPath)),
  );
  const options = {
    queuePath,
    packPath,
    rawRoot: join(directory, "raw"),
    endpoint: "http://127.0.0.1:8188",
    ffmpeg: "ffmpeg",
    limit: 1,
    force: false,
    generateRaw: async () =>
      Array.from({ length: 25 }, () => new Blob(["png"])),
    run: async (command: string[]) => {
      const target = command.at(-1);
      if (!target) throw new Error("Missing fake output.");
      await writeFile(target, "poster");
      return { code: 0, stderr: "" };
    },
  };
  expect((await generateIdlePosters(options)).generated).toBe(1);
  expect((await generateIdlePosters(options)).generated).toBe(0);
  const updated = JSON.parse(await readFile(packPath, "utf8"));
  expect(updated.heroes.miya.poster.mimeType).toBe("video/webm");
});
