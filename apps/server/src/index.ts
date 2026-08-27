import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import {
  currentPhase,
  selectedHeroIds,
  type DetectorProfile,
  type EventEnvelope,
} from "@shayyz/contracts";
import {
  DetectorProfileStore,
  OnnxSlotClassifier,
  ObsDraftRecognitionLoop,
  ObsScreenshotSource,
  isAutomaticProfileReady,
  loadDetectorModelBundle,
  type DetectorModelBundle,
} from "@shayyz/detector";
import { createBunWebSocket } from "hono/bun";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { createApp } from "./app";
import { LocalAssetPack } from "./assets";
import { DetectorCalibrationService } from "./calibration";
import { DraftStore } from "./store";
import { DetectorCoordinator } from "./detector";
import { DetectorLifecycle, validateObsUrl } from "./detector-lifecycle";
import { heroes } from "./heroes";
import { TeamLogoStore } from "./team-logos";
import { DisplayMediaStore } from "./display-media";
import { DisplayStore } from "./display-store";

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
const displayStore = new DisplayStore(runtimeDirectory);
await displayStore.initialize();
const teamLogos = new TeamLogoStore(join(runtimeDirectory, "team-logos"));
const displayMedia = new DisplayMediaStore(
  join(runtimeDirectory, "display-media"),
);
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
const detectorEmptyFramePath = resolve(
  process.env.SHAYYZ_DETECTOR_EMPTY_FRAME ??
    join(runtimeDirectory, "detector/empty-frame.png"),
);
const detectorProfileStore = new DetectorProfileStore(detectorProfilePath);
const detectorModelManifestPath = resolve(
  process.env.SHAYYZ_DETECTOR_MODEL ??
    join(projectRoot, "vendor-assets/mlbb-personal/detector/manifest.json"),
);
const heroIds = heroes.map((hero) => hero.id);
let detectorProfile: DetectorProfile | null = null;
let detectorModel: DetectorModelBundle | null = null;
let detectorSetupError: Error | null = null;
try {
  detectorProfile = await detectorProfileStore.load();
  if (detectorProfile) {
    detectorModel = await loadDetectorModelBundle(
      detectorModelManifestPath,
      heroIds,
    );
  }
} catch (error) {
  detectorSetupError =
    error instanceof Error ? error : new Error("Detector setup failed.");
}
const detector = new DetectorCoordinator({
  store,
  profile: detectorProfile,
  referenceCount: detectorModel ? 133 : 0,
  automaticReady:
    detectorProfile !== null &&
    detectorModel !== null &&
    detectorModel.manifest.validation.validatedAt !== null &&
    isAutomaticProfileReady(detectorProfile, 133),
});
detector.setError(detectorSetupError);
const detectorLifecycle = new DetectorLifecycle(detector, async () => {
  if (!detectorProfile || !detectorModel)
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
    classifier: await OnnxSlotClassifier.create(detectorModel),
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
const detectorCalibration = new DetectorCalibrationService({
  profileStore: detectorProfileStore,
  emptyFramePath: detectorEmptyFramePath,
  screenshotSource: (sourceName) =>
    new ObsScreenshotSource({
      url: validateObsUrl(process.env.SHAYYZ_OBS_URL ?? "ws://127.0.0.1:4455"),
      sourceName,
      imageFormat: "png",
      ...(process.env.SHAYYZ_OBS_PASSWORD
        ? { password: process.env.SHAYYZ_OBS_PASSWORD }
        : {}),
    }),
});

const clients = new Set<WSContext>();
const { upgradeWebSocket, websocket } = createBunWebSocket();
const application = createApp({
  store,
  displayStore,
  ...(controlToken ? { controlToken } : {}),
  ...(assetPack ? { assetPack } : {}),
  detector,
  detectorLifecycle,
  detectorCalibration,
  teamLogos,
  displayMedia,
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
      ws.send(
        JSON.stringify({
          sequence: 2,
          type: "display-snapshot",
          emittedAt: new Date().toISOString(),
          data: displayStore.state,
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
