import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import {
  DetectorBenchmarkReportSchema,
  DetectorReplayManifestSchema,
  STANDARD_TEN_BAN_FORMAT,
  type DetectorBenchmarkReport,
  type DetectorReplayManifest,
} from "../packages/contracts/src/index";
import {
  DetectorProfileStore,
  ObsDraftRecognitionLoop,
  describeEncodedImage,
  descriptorSimilarity,
  loadReferenceDescriptors,
  rankReferences,
  type DraftCandidate,
  type ScreenshotSource,
} from "../packages/detector/src/index";
import heroCatalog from "../config/heroes.json";

export interface BenchmarkOutcome {
  expectedHeroId: string;
  detectedHeroId: string | null;
  latencyMs: number | null;
}

export function summarizeBenchmark(
  profileId: string,
  draftCount: number,
  referenceCount: number,
  outcomes: BenchmarkOutcome[],
  now = new Date(),
): DetectorBenchmarkReport {
  const correct = outcomes.filter(
    (item) => item.detectedHeroId === item.expectedHeroId,
  ).length;
  const wrong = outcomes.filter(
    (item) =>
      item.detectedHeroId !== null &&
      item.detectedHeroId !== item.expectedHeroId,
  ).length;
  const missed = outcomes.length - correct - wrong;
  const precision = correct / Math.max(1, correct + wrong);
  const recall = correct / Math.max(1, outcomes.length);
  const latencies = outcomes
    .flatMap((item) =>
      item.detectedHeroId === item.expectedHeroId && item.latencyMs !== null
        ? [item.latencyMs]
        : [],
    )
    .sort((left, right) => left - right);
  const p95LatencyMs = latencies.length
    ? (latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null)
    : null;
  const failures = [
    ...(draftCount < 50 ? ["At least 50 complete drafts are required."] : []),
    ...(referenceCount !== 133
      ? ["All 133 hero references are required."]
      : []),
    ...(precision < 0.995 ? ["Precision must be at least 99.5%."] : []),
    ...(recall < 0.98 ? ["Recall must be at least 98%."] : []),
    ...(p95LatencyMs === null || p95LatencyMs > 1_000
      ? ["P95 latency must be at most 1000 ms."]
      : []),
  ];
  return DetectorBenchmarkReportSchema.parse({
    schemaVersion: 1,
    profileId,
    generatedAt: now.toISOString(),
    draftCount,
    referenceCount,
    selections: outcomes.length,
    correct,
    wrong,
    missed,
    precision,
    recall,
    p95LatencyMs,
    eligible: failures.length === 0,
    failures,
  });
}

function heroId(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function replayBenchmark(options: {
  manifest: DetectorReplayManifest;
  manifestDirectory: string;
  profilePath: string;
  referenceDirectory: string;
  emptyFramePath: string;
}): Promise<DetectorBenchmarkReport> {
  const profile = await new DetectorProfileStore(options.profilePath).load();
  if (!profile) throw new Error("Detector profile was not found.");
  const ids = [...new Set(heroCatalog.map(({ name }) => heroId(name)))].sort();
  const { references } = await loadReferenceDescriptors(
    options.referenceDirectory,
    ids,
  );
  const emptyFrame = new Uint8Array(await readFile(options.emptyFramePath));
  const emptyDescriptors = new Map(
    await Promise.all(
      profile.slots.map(
        async (slot) =>
          [
            JSON.stringify(slot.rect),
            await describeEncodedImage(emptyFrame, slot.rect),
          ] as const,
      ),
    ),
  );
  const outcomes: BenchmarkOutcome[] = [];

  for (const draft of options.manifest.drafts) {
    let imageData = "";
    let phaseIndex = 0;
    const usedHeroIds: string[] = [];
    const candidates = new Map<number, DraftCandidate>();
    const source: ScreenshotSource = {
      connect: async () => undefined,
      screenshot: async () => imageData,
      close: () => undefined,
    };
    const loop = new ObsDraftRecognitionLoop({
      source,
      profile,
      classifier: {
        classify: async (image, rect) => {
          const slot = profile.slots.find(
            (candidate) =>
              JSON.stringify(candidate.rect) === JSON.stringify(rect),
          );
          const empty = emptyDescriptors.get(JSON.stringify(rect));
          if (!slot || !empty)
            throw new Error("Benchmark slot is not calibrated.");
          const descriptor = await describeEncodedImage(image, rect);
          const emptyConfidence = descriptorSimilarity(
            descriptor,
            empty,
            slot.kind,
          );
          if (emptyConfidence >= profile.thresholds.empty)
            return {
              label: "empty",
              confidence: emptyConfidence,
              runnerUpConfidence: 0,
              margin: emptyConfidence,
            };
          const match = rankReferences(descriptor, references, slot.kind);
          return match
            ? { label: match.heroId, ...match }
            : {
                label: "unknown",
                confidence: 1,
                runnerUpConfidence: 0,
                margin: 1,
              };
        },
      },
      context: () => ({
        revision: phaseIndex,
        phaseIndex,
        phase: STANDARD_TEN_BAN_FORMAT.phases[phaseIndex] ?? null,
        usedHeroIds,
      }),
      candidate: (candidate) => {
        candidates.set(candidate.phaseIndex, candidate);
      },
    });
    await loop.initialize();
    for (const selection of draft.selections) {
      for (const frame of selection.frames) {
        const bytes = await readFile(
          resolve(options.manifestDirectory, frame.path),
        );
        const mime =
          extname(frame.path).toLowerCase() === ".png" ? "png" : "jpeg";
        imageData = `data:image/${mime};base64,${bytes.toString("base64")}`;
        await loop.sampleOnce(frame.observedAtMs);
      }
      const detected = candidates.get(phaseIndex);
      outcomes.push({
        expectedHeroId: selection.expectedHeroId,
        detectedHeroId: detected?.heroId ?? null,
        latencyMs: detected
          ? detected.observedAt - selection.transitionAtMs
          : null,
      });
      usedHeroIds.push(selection.expectedHeroId);
      phaseIndex += 1;
    }
    loop.stop();
  }
  return summarizeBenchmark(
    profile.id,
    options.manifest.drafts.length,
    references.length,
    outcomes,
  );
}

function argument(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

if (import.meta.main) {
  const command = Bun.argv[2];
  const profilePath = argument("--profile");
  if (command === "run") {
    const manifestPath = argument("--manifest");
    const manifest = DetectorReplayManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    const report = await replayBenchmark({
      manifest,
      manifestDirectory: dirname(manifestPath),
      profilePath,
      referenceDirectory: argument("--references"),
      emptyFramePath: argument("--empty-frame"),
    });
    await writeJson(resolve("captures/detector-benchmark-report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } else if (command === "promote") {
    const report = DetectorBenchmarkReportSchema.parse(
      JSON.parse(await readFile(argument("--report"), "utf8")),
    );
    if (!report.eligible) throw new Error(report.failures.join(" "));
    const store = new DetectorProfileStore(profilePath);
    const profile = await store.load();
    if (!profile || profile.id !== report.profileId)
      throw new Error("The report does not match the detector profile.");
    await store.save({
      ...profile,
      validation: {
        referenceCount: 133,
        validatedAt: new Date().toISOString(),
      },
    });
    console.log(`Promoted detector profile ${profile.id}.`);
  } else {
    throw new Error("Use run or promote.");
  }
}
