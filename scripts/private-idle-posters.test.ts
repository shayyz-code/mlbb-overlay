import { expect, test } from "bun:test";
import type { AssetPackManifest } from "../packages/contracts/src/index";
import {
  comfyPrompt,
  createIdlePosterJobs,
  deterministicSeed,
  localComfyUrl,
  posterFfmpegArguments,
} from "./private-idle-posters";

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

test("builds the official core SVD-XT workflow with subtle motion", () => {
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
});

test("creates a silent four-second ping-pong VP9 poster", () => {
  const args = posterFfmpegArguments("raw.webp", "poster.webm");
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
