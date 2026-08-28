import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { assetFixture } from "./asset-fixture";
import { DetectorCoordinator } from "./detector";
import { DisplayStore } from "./display-store";
import { PlayerPhotoStore } from "./player-photos";
import { DraftStore } from "./store";
import { TeamLogoStore } from "./team-logos";

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
  const displayStore = new DisplayStore(directory);
  await displayStore.initialize();
  const teamLogos = new TeamLogoStore(join(directory, "team-logos"));
  const playerPhotos = new PlayerPhotoStore(join(directory, "player-photos"));
  return {
    store,
    displayStore,
    app: createApp({
      store,
      displayStore,
      teamLogos,
      playerPhotos,
      ...(controlToken ? { controlToken } : {}),
    }),
  };
}

describe("draft API", () => {
  test("returns health, draft state, and a media-free hero catalog", async () => {
    const { app } = await setup();
    expect((await app.request("/api/v1/system/status")).status).toBe(200);
    expect((await app.request("/api/v1/draft")).status).toBe(200);
    expect((await app.request("/api/v1/display")).status).toBe(200);

    const heroes = await (await app.request("/api/v1/heroes")).json();
    expect(heroes.length).toBeGreaterThan(100);
    expect(heroes[0].portraitUrl).toBeUndefined();
  });

  test("persists and broadcasts protected display commands", async () => {
    const { app, displayStore } = await setup("secret-token");
    const state = displayStore.state;
    const { revision: _, updatedAt: __, ...display } = state;
    display.event.name = "Yangon Invitational";
    const body = JSON.stringify({
      type: "set-display",
      expectedRevision: 0,
      display,
    });
    expect(
      (
        await app.request("/api/v1/display/commands", {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
        })
      ).status,
    ).toBe(401);
    const response = await app.request("/api/v1/display/commands", {
      method: "POST",
      body,
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      revision: 1,
      event: { name: "Yangon Invitational" },
    });
    displayStore.close();
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

  test("protects detector mode changes with the LAN token", async () => {
    const { store } = await setup();
    const detector = new DetectorCoordinator({
      store,
      profile: null,
      referenceCount: 0,
      automaticReady: false,
    });
    const app = createApp({ store, detector, controlToken: "secret-token" });
    const body = JSON.stringify({ mode: "proposal" });

    expect(
      (await app.request("/api/v1/detector/mode", { method: "PUT", body }))
        .status,
    ).toBe(401);
    const response = await app.request("/api/v1/detector/mode", {
      method: "PUT",
      body,
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "proposal" });
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

  test("reports display section revision conflicts", async () => {
    const { app, displayStore } = await setup();
    const initial = displayStore.state;
    await app.request("/api/v1/display/commands", {
      method: "POST",
      body: JSON.stringify({
        type: "set-team-directory",
        expectedRevision: 0,
        teams: initial.teams,
      }),
    });
    const response = await app.request("/api/v1/display/commands", {
      method: "POST",
      body: JSON.stringify({
        type: "set-match-schedule",
        expectedRevision: 0,
        schedule: initial.schedule,
      }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ currentRevision: 1 });
  });

  test("activates one managed match and synchronizes its live score", async () => {
    const { app, store, displayStore } = await setup();
    const state = displayStore.state;
    const { revision: _, updatedAt: __, ...display } = state;
    display.schedule.push({
      id: "final",
      scheduledAt: null,
      stage: "Finals",
      round: "Grand Final",
      bestOf: 7,
      blueTeamId: display.teams[0]?.id ?? "",
      redTeamId: display.teams[1]?.id ?? "",
      scores: { blue: 2, red: 1 },
      status: "scheduled",
    });
    displayStore.dispatch({
      type: "set-display",
      expectedRevision: 0,
      display,
    });
    const activation = await app.request("/api/v1/matches/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "activate-match",
        matchId: "final",
        expectedDraftRevision: 0,
        expectedDisplayRevision: 1,
      }),
    });
    expect(activation.status).toBe(200);
    expect(store.state.scoreboard.scores).toEqual({ blue: 0, red: 0 });
    expect(displayStore.state.activeMatchId).toBe("final");
    expect(displayStore.state.schedule[0]?.status).toBe("live");
    expect(displayStore.state.scoreboard).toMatchObject({
      gameNumber: 1,
      bestOf: 7,
      stage: "Finals",
      round: "Grand Final",
    });

    await app.request("/api/v1/draft/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "set-scoreboard-score",
        expectedRevision: 1,
        side: "blue",
        score: 1,
      }),
    });
    expect(displayStore.state.schedule[0]?.scores).toEqual({ blue: 1, red: 0 });
    displayStore.close();
  });

  test("runs an explicit series from start through completion", async () => {
    const { app, store, displayStore } = await setup();
    const [blue, red] = displayStore.state.teams;
    if (!blue || !red) throw new Error("Default teams are missing.");
    displayStore.dispatch({
      type: "set-match-schedule",
      expectedRevision: 0,
      schedule: [
        {
          id: "final",
          scheduledAt: null,
          stage: "Finals",
          round: "Grand Final",
          bestOf: 3,
          blueTeamId: blue.id,
          redTeamId: red.id,
          scores: { blue: 0, red: 0 },
          status: "scheduled",
        },
      ],
    });
    const series = (command: Record<string, unknown>) =>
      app.request("/api/v1/series/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...command,
          expectedDraftRevision: store.state.revision,
          expectedDisplayRevision: displayStore.state.revision,
        }),
      });

    const stale = await app.request("/api/v1/series/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "start-series",
        matchId: "final",
        expectedDraftRevision: 0,
        expectedDisplayRevision: 0,
      }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      currentDraftRevision: 0,
      currentDisplayRevision: 1,
    });

    expect((await series({ type: "start-series", matchId: "final" })).status).toBe(
      200,
    );
    expect(displayStore.state.scoreboard.gameNumber).toBe(1);
    expect(displayStore.state.lineups.blue.map((player) => player.id)).toEqual(
      blue.starters.map((player) => player.id),
    );

    await app.request("/api/v1/draft/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "select-hero",
        expectedRevision: store.state.revision,
        heroId: "miya",
        source: "manual",
      }),
    });
    await app.request("/api/v1/draft/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "set-scoreboard-score",
        expectedRevision: store.state.revision,
        side: "blue",
        score: 1,
      }),
    });
    expect((await series({ type: "next-game" })).status).toBe(200);
    expect(store.state.phaseIndex).toBe(0);
    expect(store.state.scoreboard.scores).toEqual({ blue: 1, red: 0 });
    expect(displayStore.state.scoreboard.gameNumber).toBe(2);

    await app.request("/api/v1/draft/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "set-scoreboard-score",
        expectedRevision: store.state.revision,
        side: "blue",
        score: 2,
      }),
    });
    const extraGame = await series({ type: "next-game" });
    expect(extraGame.status).toBe(400);
    expect(await extraGame.json()).toMatchObject({
      error: "The series has a winner. Complete the series instead.",
    });
    expect((await series({ type: "complete-series" })).status).toBe(200);
    expect(displayStore.state.schedule[0]).toMatchObject({
      status: "complete",
      scores: { blue: 2, red: 0 },
    });
    expect(displayStore.state.activeMatchId).toBe("final");
    displayStore.close();
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

  test("uploads and serves allowlisted runtime team logos", async () => {
    const { app } = await setup("secret-token");
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const form = new FormData();
    form.set("logo", new File([png], "team.png", { type: "image/png" }));

    expect(
      (
        await app.request("/api/v1/team-logos/blue", {
          method: "POST",
          body: form,
        })
      ).status,
    ).toBe(401);

    const response = await app.request("/api/v1/team-logos/blue", {
      method: "POST",
      body: form,
      headers: { authorization: "Bearer secret-token" },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { logoUrl: string };
    const media = await app.request(result.logoUrl);
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(png);
    expect(
      (await app.request("/api/v1/media/team-logos/not-allowlisted.png"))
        .status,
    ).toBe(404);
  });

  test("rejects mislabeled and unsupported team logos", async () => {
    const { app } = await setup();
    const form = new FormData();
    form.set(
      "logo",
      new File(["not an image"], "team.png", { type: "image/png" }),
    );
    const response = await app.request("/api/v1/team-logos/red", {
      method: "POST",
      body: form,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "The uploaded file does not match its image type.",
    });
  });

  test("uploads and serves photos only for managed starters", async () => {
    const { app, displayStore } = await setup("secret-token");
    const [team] = displayStore.state.teams;
    const player = team?.starters[0];
    if (!team || !player) throw new Error("Default starter is missing.");
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const form = new FormData();
    form.set("photo", new File([png], "player.png", { type: "image/png" }));
    const path = `/api/v1/player-photos/${team.id}/${player.id}`;
    expect(
      (await app.request(path, { method: "POST", body: form })).status,
    ).toBe(401);

    const authorized = new FormData();
    authorized.set(
      "photo",
      new File([png], "player.png", { type: "image/png" }),
    );
    const response = await app.request(path, {
      method: "POST",
      body: authorized,
      headers: { authorization: "Bearer secret-token" },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { photoUrl: string };
    expect(result.photoUrl).toStartWith("/api/v1/media/player-photos/");
    expect((await app.request(result.photoUrl)).status).toBe(200);
    expect(
      (
        await app.request(`/api/v1/player-photos/${team.id}/missing`, {
          method: "POST",
          headers: { authorization: "Bearer secret-token" },
        })
      ).status,
    ).toBe(404);
    displayStore.close();
  });
});
