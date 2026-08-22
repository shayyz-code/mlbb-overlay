import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  currentPhase,
  selectedHeroIds,
  type DetectorProfile,
  type EventEnvelope,
} from "@shayyz/contracts";
import {
  DetectorProfileStore,
  ObsDraftRecognitionLoop,
  ObsScreenshotSource,
  isAutomaticProfileReady,
  loadReferenceDescriptors,
} from "@shayyz/detector";
import { createBunWebSocket } from "hono/bun";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { createApp } from "./app";
import { LocalAssetPack } from "./assets";
import { DraftStore } from "./store";
import { DetectorCoordinator } from "./detector";
import { DetectorLifecycle, validateObsUrl } from "./detector-lifecycle";
import { heroes } from "./heroes";

const host = process.env.SHAYYZ_HOST ?? "127.0.0.1";
const port = Number(process.env.SHAYYZ_PORT ?? 3000);
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const runtimeDirectory = process.env.SHAYYZ_RUNTIME_DIR
  ? resolve(process.env.SHAYYZ_RUNTIME_DIR)
  : join(projectRoot, "runtime");
const isLoopback =
  host === "127.0.0.1" || host === "localhost" || host === "::1";
const controlToken = isLoopback
  ? undefined
  : process.env.SHAYYZ_CONTROL_TOKEN || crypto.randomUUID().replaceAll("-", "");
const store = new DraftStore(runtimeDirectory);
await store.initialize();
const configuredAssetManifest = process.env.SHAYYZ_ASSET_PACK;
const assetManifest = configuredAssetManifest
  ? resolve(configuredAssetManifest)
  : join(projectRoot, "vendor-assets/mlbb-personal/manifest.json");
const assetPack = await LocalAssetPack.load(
  assetManifest,
  Boolean(configuredAssetManifest),
);

const detectorProfilePath = resolve(
  process.env.SHAYYZ_DETECTOR_PROFILE ??
    join(runtimeDirectory, "detector/profile.json"),
);
const heroIds = heroes.map((hero) => hero.id);
let detectorProfile: DetectorProfile | null = null;
let detectorReferences: Awaited<
  ReturnType<typeof loadReferenceDescriptors>
>["references"] = [];
let detectorEmptyFrame: Uint8Array | null = null;
let detectorSetupError: Error | null = null;
try {
  detectorProfile = await new DetectorProfileStore(detectorProfilePath).load();
  if (detectorProfile) {
    const referenceDirectory = resolve(
      process.env.SHAYYZ_DETECTOR_REFERENCES ??
        join(
          projectRoot,
          `captures/detector-references/${detectorProfile.gameBuild}/pick-art`,
        ),
    );
    detectorReferences = (
      await loadReferenceDescriptors(referenceDirectory, heroIds)
    ).references;
    detectorEmptyFrame = new Uint8Array(
      await readFile(
        resolve(
          process.env.SHAYYZ_DETECTOR_EMPTY_FRAME ??
            join(runtimeDirectory, "detector/empty-frame.png"),
        ),
      ),
    );
  }
} catch (error) {
  detectorSetupError =
    error instanceof Error ? error : new Error("Detector setup failed.");
}
const detector = new DetectorCoordinator({
  store,
  profile: detectorProfile,
  referenceCount: detectorReferences.length,
  automaticReady:
    detectorProfile !== null &&
    isAutomaticProfileReady(detectorProfile, detectorReferences.length),
});
detector.setError(detectorSetupError);
const detectorLifecycle = new DetectorLifecycle(detector, async () => {
  if (!detectorProfile || !detectorEmptyFrame)
    throw (
      detectorSetupError ?? new Error("Detector local files are incomplete.")
    );
  const source = new ObsScreenshotSource({
    url: validateObsUrl(process.env.SHAYYZ_OBS_URL ?? "ws://127.0.0.1:4455"),
    sourceName: detectorProfile.sourceName,
    ...(process.env.SHAYYZ_OBS_PASSWORD
      ? { password: process.env.SHAYYZ_OBS_PASSWORD }
      : {}),
  });
  return new ObsDraftRecognitionLoop({
    source,
    profile: detectorProfile,
    references: detectorReferences,
    emptyFrame: detectorEmptyFrame,
    context: () => {
      const state = store.state;
      return {
        revision: state.revision,
        phaseIndex: state.phaseIndex,
        phase: currentPhase(state),
        usedHeroIds: [...selectedHeroIds(state)],
      };
    },
    candidate: async (candidate) => {
      await detector.observe(candidate);
    },
    onError: (error) => detectorLifecycle.report(error),
  });
});

const clients = new Set<WSContext>();
const { upgradeWebSocket, websocket } = createBunWebSocket();
const application = createApp({
  store,
  ...(controlToken ? { controlToken } : {}),
  ...(assetPack ? { assetPack } : {}),
  detector,
  detectorLifecycle,
  webRoot: join(projectRoot, "apps/web/dist"),
  broadcast(event: EventEnvelope) {
    const payload = JSON.stringify(event);
    for (const client of clients) client.send(payload);
  },
});
const app = new Hono();

app.get(
  "/api/v1/events",
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      clients.add(ws);
      ws.send(
        JSON.stringify({
          sequence: 1,
          type: "draft-snapshot",
          emittedAt: new Date().toISOString(),
          data: store.state,
        } satisfies EventEnvelope),
      );
    },
    onClose(_event, ws) {
      clients.delete(ws);
    },
  })),
);
app.route("/", application);

Bun.serve({ hostname: host, port, fetch: app.fetch, websocket });

console.log(`SHAYYZ MLBB OVERLAY is running at http://${host}:${port}`);
if (controlToken) console.log(`LAN control token: ${controlToken}`);
