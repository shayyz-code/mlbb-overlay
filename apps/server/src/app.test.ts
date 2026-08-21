import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { assetFixture } from "./asset-fixture";
import { DraftStore } from "./store";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

async function setup(controlToken?: string) {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-app-"));
  directories.push(directory);
  const store = new DraftStore(directory);
  await store.initialize();
  return {
    store,
    app: createApp({ store, ...(controlToken ? { controlToken } : {}) }),
  };
}

describe("draft API", () => {
  test("returns health, draft state, and a media-free hero catalog", async () => {
    const { app } = await setup();
    expect((await app.request("/api/v1/system/status")).status).toBe(200);
    expect((await app.request("/api/v1/draft")).status).toBe(200);

    const heroes = await (await app.request("/api/v1/heroes")).json();
    expect(heroes.length).toBeGreaterThan(100);
    expect(heroes[0].portraitUrl).toBeUndefined();
  });

  test("protects mutations when a LAN token is configured", async () => {
    const { app } = await setup("secret-token");
    const body = JSON.stringify({
      expectedRevision: 0,
      type: "select-hero",
      heroId: "miya",
      source: "manual",
    });

    expect(
      (await app.request("/api/v1/draft/commands", { method: "POST", body }))
        .status,
    ).toBe(401);
    expect(
      (
        await app.request("/api/v1/draft/commands", {
          method: "POST",
          body,
          headers: {
            authorization: "Bearer secret-token",
            "content-type": "application/json",
          },
        })
      ).status,
    ).toBe(200);
  });

  test("reports revision conflicts", async () => {
    const { app } = await setup();
    const command = {
      expectedRevision: 0,
      type: "select-hero",
      heroId: "miya",
      source: "manual",
    };

    await app.request("/api/v1/draft/commands", {
      method: "POST",
      body: JSON.stringify(command),
    });
    const response = await app.request("/api/v1/draft/commands", {
      method: "POST",
      body: JSON.stringify({ ...command, heroId: "layla" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ currentRevision: 1 });
  });

  test("serves the web application for nested OBS routes", async () => {
    const { store } = await setup();
    const webRoot = await mkdtemp(join(tmpdir(), "shayyz-web-"));
    directories.push(webRoot);
    await mkdir(join(webRoot, "assets"));
    await writeFile(join(webRoot, "index.html"), "<h1>SHAYYZ</h1>");
    const app = createApp({ store, webRoot });

    const response = await app.request("/overlay/draft");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("SHAYYZ");
  });

  test("streams only allowlisted private media with range support", async () => {
    const { store } = await setup();
    const { directory, pack } = await assetFixture();
    directories.push(directory);
    const app = createApp({ store, assetPack: pack });

    const heroes = await (await app.request("/api/v1/heroes")).json();
    expect(
      heroes.find((hero: { id: string }) => hero.id === "miya"),
    ).toMatchObject({ portraitUrl: "/api/v1/media/heroes/miya/portrait" });
    const response = await app.request("/api/v1/media/heroes/miya/portrait", {
      headers: { range: "bytes=0-6" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-6/16");
    expect(await response.text()).toBe("private");
    expect(
      (await app.request("/api/v1/media/heroes/layla/portrait")).status,
    ).toBe(404);
  });
});
