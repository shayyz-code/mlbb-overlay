import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import type { EventEnvelope } from "@shayyz/contracts";
import { createBunWebSocket } from "hono/bun";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { createApp } from "./app";
import { LocalAssetPack } from "./assets";
import { DraftStore } from "./store";

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

const clients = new Set<WSContext>();
const { upgradeWebSocket, websocket } = createBunWebSocket();
const application = createApp({
  store,
  ...(controlToken ? { controlToken } : {}),
  ...(assetPack ? { assetPack } : {}),
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
