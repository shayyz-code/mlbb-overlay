import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  AssetPackManifestSchema,
  type AssetPackManifest,
  type IdlePosterJobs,
} from "../packages/contracts/src/index";
import { canonicalHeroIds } from "./import-assets";

type IdleJob = IdlePosterJobs["jobs"][number];

export function deterministicSeed(heroId: string, revision: string): number {
  const hash = new Bun.CryptoHasher("sha256")
    .update(`${heroId}:${revision}`)
    .digest("hex");
  return Number.parseInt(hash.slice(0, 8), 16);
}

export function createIdlePosterJobs(
  manifest: AssetPackManifest,
  revision: string,
  manifestPath = "vendor-assets/mlbb-personal/manifest.json",
): IdlePosterJobs {
  const jobs = canonicalHeroIds.flatMap((heroId) => {
    const media = manifest.heroes[heroId];
    if (!media?.portrait) return [];
    return [
      {
        heroId,
        source: relative(
          process.cwd(),
          resolve(dirname(manifestPath), media.portrait.path),
        ),
        sourceSha256: media.portrait.sha256,
        seed: deterministicSeed(heroId, revision),
        status: media.poster ? ("generated" as const) : ("pending" as const),
        ...(media.poster ? { outputSha256: media.poster.sha256 } : {}),
      },
    ];
  });
  return {
    schemaVersion: 1,
    model: { checkpoint: "svd_xt_1_1.safetensors", revision },
    parameters: {
      width: 576,
      height: 1024,
      frames: 25,
      sourceFps: 6,
      motionBucketId: 40,
      augmentationLevel: 0.02,
    },
    jobs,
  };
}

export function comfyPrompt(
  queue: IdlePosterJobs,
  job: IdleJob,
  image: string,
) {
  const { model, parameters } = queue;
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: job.seed,
        steps: 20,
        cfg: 2.5,
        sampler_name: "euler",
        scheduler: "karras",
        denoise: 1,
        model: ["14", 0],
        positive: ["12", 0],
        negative: ["12", 1],
        latent_image: ["12", 2],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["15", 2] },
    },
    "10": {
      class_type: "SaveAnimatedWEBP",
      inputs: {
        filename_prefix: `shayyz-${job.heroId}-${job.seed}`,
        fps: parameters.sourceFps,
        lossless: false,
        quality: 95,
        method: "default",
        images: ["8", 0],
      },
    },
    "12": {
      class_type: "SVD_img2vid_Conditioning",
      inputs: {
        width: parameters.width,
        height: parameters.height,
        video_frames: parameters.frames,
        motion_bucket_id: parameters.motionBucketId,
        fps: parameters.sourceFps,
        augmentation_level: parameters.augmentationLevel,
        clip_vision: ["15", 1],
        init_image: ["23", 0],
        vae: ["15", 2],
      },
    },
    "14": {
      class_type: "VideoLinearCFGGuidance",
      inputs: { min_cfg: 1, model: ["15", 0] },
    },
    "15": {
      class_type: "ImageOnlyCheckpointLoader",
      inputs: { ckpt_name: model.checkpoint },
    },
    "23": {
      class_type: "LoadImage",
      inputs: { image, "choose file to upload": "image" },
    },
  };
}

export function posterFfmpegArguments(input: string, output: string): string[] {
  const filter =
    "[0:v]trim=end_frame=25,split[f][r];[r]trim=start_frame=1:end_frame=24,reverse[rr];[f][rr]concat=n=2:v=1:a=0,setpts=N/(12*TB),minterpolate=fps=30,crop=576:768:0:46,scale=540:720:flags=lanczos[v]";
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-t",
    "4",
    "-an",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "34",
    "-b:v",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-y",
    output,
  ];
}

export function localComfyUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("ComfyUI must use a loopback HTTP address.");
  return url;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.tmp-${crypto.randomUUID()}`;
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}
if (import.meta.main) {
  const command = Bun.argv[2];
  const packPath = resolve(
    argument("--pack") ?? "vendor-assets/mlbb-personal/manifest.json",
  );
  const queuePath = resolve(argument("--jobs") ?? "captures/idle-jobs.json");
  if (command === "prepare") {
    const revision = argument("--model-revision") ?? "svd-xt-1.1";
    const manifest = AssetPackManifestSchema.parse(
      JSON.parse(await readFile(packPath, "utf8")),
    );
    const queue = createIdlePosterJobs(manifest, revision, packPath);
    if (
      Bun.argv.includes("--complete") &&
      queue.jobs.length !== canonicalHeroIds.length
    )
      throw new Error(
        `Complete preparation requires all ${canonicalHeroIds.length} portraits.`,
      );
    await mkdir(dirname(queuePath), { recursive: true });
    await writeJsonAtomic(queuePath, queue);
    console.log(`Private idle queue written with ${queue.jobs.length} jobs.`);
  } else throw new Error("Use prepare.");
}
