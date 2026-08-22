import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import {
  AssetPackManifestSchema,
  IdlePosterJobsSchema,
  type AssetPackManifest,
  type IdlePosterJobs,
} from "../packages/contracts/src/index";
import { canonicalHeroIds } from "./import-assets";

type IdleJob = IdlePosterJobs["jobs"][number];
type Runner = (command: string[]) => Promise<{ code: number; stderr: string }>;
type RawGenerator = (
  queue: IdlePosterJobs,
  job: IdleJob,
  source: string,
) => Promise<Blob[]>;

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
      class_type: "SaveImage",
      inputs: {
        filename_prefix: `shayyz-${job.heroId}-${job.seed}`,
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
    "[0:v]trim=end_frame=25,setpts=PTS-STARTPTS,split[f][r];[r]trim=start_frame=1:end_frame=24,reverse,setpts=PTS-STARTPTS[rr];[f][rr]concat=n=2:v=1:a=0,setpts=N/(12*TB),minterpolate=fps=30,setpts=PTS*24/23,tpad=stop_mode=clone:stop_duration=1,crop=576:768:0:46,scale=540:720:flags=lanczos[v]";
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    "6",
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

export async function requestComfyOutput(options: {
  endpoint: string;
  queue: IdlePosterJobs;
  job: IdleJob;
  source: string;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maxPolls?: number;
}): Promise<Blob[]> {
  const base = localComfyUrl(options.endpoint);
  const fetcher = options.fetcher ?? fetch;
  const form = new FormData();
  form.append(
    "image",
    new File(
      [await Bun.file(options.source).arrayBuffer()],
      basename(options.source),
    ),
  );
  form.append("type", "input");
  form.append("overwrite", "true");
  const upload = await fetcher(new URL("/upload/image", base), {
    method: "POST",
    body: form,
  });
  if (!upload.ok) throw new Error(`ComfyUI upload failed: ${upload.status}`);
  const uploaded = (await upload.json()) as {
    name: string;
    subfolder?: string;
  };
  const image = uploaded.subfolder
    ? `${uploaded.subfolder}/${uploaded.name}`
    : uploaded.name;
  const queued = await fetcher(new URL("/prompt", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: comfyPrompt(options.queue, options.job, image),
    }),
  });
  if (!queued.ok) throw new Error(`ComfyUI prompt failed: ${queued.status}`);
  const { prompt_id: promptId } = (await queued.json()) as {
    prompt_id: string;
  };
  const sleep = options.sleep ?? Bun.sleep;
  for (let attempt = 0; attempt < (options.maxPolls ?? 3_600); attempt += 1) {
    await sleep(2_000);
    const history = await fetcher(new URL(`/history/${promptId}`, base));
    if (!history.ok)
      throw new Error(`ComfyUI history failed: ${history.status}`);
    const values = (await history.json()) as Record<
      string,
      {
        status?: { status_str?: string };
        outputs?: Record<
          string,
          {
            images?: Array<{
              filename: string;
              subfolder: string;
              type: string;
            }>;
          }
        >;
      }
    >;
    const entry = values[promptId];
    if (entry?.status?.status_str === "error")
      throw new Error("ComfyUI generation failed.");
    const outputs = entry?.outputs?.["10"]?.images;
    if (!outputs) continue;
    return Promise.all(
      outputs.map(async (output) => {
        const result = await fetcher(
          new URL(`/view?${new URLSearchParams(output)}`, base),
        );
        if (!result.ok)
          throw new Error(`ComfyUI output failed: ${result.status}`);
        return result.blob();
      }),
    );
  }
  throw new Error("ComfyUI generation timed out after two hours.");
}

async function sha256(path: string): Promise<string> {
  return new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).arrayBuffer())
    .digest("hex");
}

export async function generateIdlePosters(options: {
  queuePath: string;
  packPath: string;
  rawRoot: string;
  endpoint: string;
  ffmpeg: string;
  limit: number;
  force: boolean;
  run: Runner;
  generateRaw?: RawGenerator;
}) {
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 133
  )
    throw new Error("--limit must be an integer from 1 to 133.");
  const queue = IdlePosterJobsSchema.parse(
    JSON.parse(await readFile(options.queuePath, "utf8")),
  );
  const pack = AssetPackManifestSchema.parse(
    JSON.parse(await readFile(options.packPath, "utf8")),
  );
  const packRoot = dirname(resolve(options.packPath));
  const selected = queue.jobs
    .filter((job) => options.force || job.status !== "generated")
    .slice(0, options.limit);
  const generateRaw =
    options.generateRaw ??
    ((currentQueue, job, source) =>
      requestComfyOutput({
        endpoint: options.endpoint,
        queue: currentQueue,
        job,
        source,
      }));
  for (const job of selected) {
    const source = resolve(job.source);
    if ((await sha256(source)) !== job.sourceSha256)
      throw new Error(`Source checksum mismatch: ${job.heroId}`);
    const raw = resolve(options.rawRoot, `${job.heroId}-${job.seed}`);
    await mkdir(dirname(raw), { recursive: true });
    if (!(await Bun.file(resolve(raw, "frame-000.png")).exists()) || options.force) {
      const temporaryRaw = `${raw}.tmp-${crypto.randomUUID()}`;
      try {
        const frames = await generateRaw(queue, job, source);
        if (frames.length !== queue.parameters.frames)
          throw new Error(
            `ComfyUI returned ${frames.length} frames for ${job.heroId}; expected ${queue.parameters.frames}.`,
          );
        await rm(temporaryRaw, { force: true, recursive: true });
        await mkdir(temporaryRaw, { recursive: true });
        await Promise.all(
          frames.map((frame, index) =>
            Bun.write(
              resolve(temporaryRaw, `frame-${String(index).padStart(3, "0")}.png`),
              frame,
            ),
          ),
        );
        await rm(raw, { force: true, recursive: true });
        await rename(temporaryRaw, raw);
      } catch (error) {
        await rm(temporaryRaw, { force: true, recursive: true });
        throw error;
      }
    }
    const target = resolve(packRoot, "heroes", job.heroId, "poster.webm");
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${crypto.randomUUID()}.webm`;
    const result = await options.run([
      options.ffmpeg,
      ...posterFfmpegArguments(resolve(raw, "frame-%03d.png"), temporary),
    ]);
    if (result.code !== 0) {
      await rm(temporary, { force: true });
      throw new Error(`ffmpeg failed for ${job.heroId}: ${result.stderr}`);
    }
    await rename(temporary, target);
    const outputSha256 = await sha256(target);
    job.status = "generated";
    job.outputSha256 = outputSha256;
    pack.heroes[job.heroId] = {
      ...pack.heroes[job.heroId],
      poster: {
        path: relative(packRoot, target),
        sha256: outputSha256,
        mimeType: "video/webm",
      },
    };
    await writeJsonAtomic(options.packPath, pack);
    await writeJsonAtomic(options.queuePath, queue);
  }
  return {
    generated: selected.length,
    pending: queue.jobs.filter((job) => job.status !== "generated").length,
  };
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

async function run(command: string[]) {
  const process = Bun.spawn(command, { stdout: "inherit", stderr: "pipe" });
  const [stderr, code] = await Promise.all([
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { code, stderr };
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
  } else if (command === "generate") {
    const result = await generateIdlePosters({
      queuePath,
      packPath,
      rawRoot: resolve(argument("--raw") ?? "captures/idle-raw"),
      endpoint: argument("--comfy") ?? "http://127.0.0.1:8188",
      ffmpeg: argument("--ffmpeg") ?? "ffmpeg",
      limit: Number(argument("--limit") ?? "1"),
      force: Bun.argv.includes("--force"),
      run,
    });
    console.log(JSON.stringify(result, null, 2));
  } else throw new Error("Use prepare or generate.");
}
