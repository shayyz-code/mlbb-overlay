import { resolve } from "node:path";
import type { EventEnvelope } from "@shayyz/contracts";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { createApp } from "./app";
import { DraftStore } from "./store";

const host = process.env.SHAYYZ_HOST ?? "127.0.0.1";
const port = Number(process.env.SHAYYZ_PORT ?? 3000);
const runtimeDirectory = resolve(process.env.SHAYYZ_RUNTIME_DIR ?? "./runtime");
const isLoopback =
  host === "127.0.0.1" || host === "localhost" || host === "::1";
const controlToken = isLoopback
  ? undefined
  : process.env.SHAYYZ_CONTROL_TOKEN || crypto.randomUUID().replaceAll("-", "");
const store = new DraftStore(runtimeDirectory);
await store.initialize();

const clients = new Set<WSContext>();
const { upgradeWebSocket, websocket } = createBunWebSocket();
const app = createApp({
  store,
  ...(controlToken ? { controlToken } : {}),
  webRoot: resolve("apps/web/dist"),
  broadcast(event: EventEnvelope) {
    const payload = JSON.stringify(event);
    for (const client of clients) client.send(payload);
  },
});

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

Bun.serve({ hostname: host, port, fetch: app.fetch, websocket });

console.log(`SHAYYZ MLBB OVERLAY is running at http://${host}:${port}`);
if (controlToken) console.log(`LAN control token: ${controlToken}`);
