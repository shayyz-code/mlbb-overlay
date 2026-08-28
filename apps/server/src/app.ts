import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { EventEnvelope } from "@shayyz/contracts";
import {
  ActivateMatchCommandSchema,
  DetectorCalibrationSaveSchema,
  DetectorFrameRequestSchema,
  DetectorModeCommandSchema,
  DisplayCommandSchema,
  DisplayStateSchema,
  DraftCommandSchema,
  PlayerRoleSchema,
  type SeriesCommand,
  SeriesCommandSchema,
} from "@shayyz/contracts";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import {
  emptyAssetStatus,
  type HeroMediaKind,
  type LocalAssetPack,
} from "./assets";
import type { DetectorCalibrationService } from "./calibration";
import type { DetectorCoordinator } from "./detector";
import type { DetectorLifecycle } from "./detector-lifecycle";
import type { DisplayStore } from "./display-store";
import { heroes } from "./heroes";
import type { PlayerPhotoStore } from "./player-photos";
import { type DraftStore, RevisionConflictError } from "./store";
import type { TeamLogoStore } from "./team-logos";

class SeriesRevisionConflictError extends Error {
  constructor(
    readonly currentDraftRevision: number,
    readonly currentDisplayRevision: number,
  ) {
    super("Live state changed. Refresh and try again.");
  }
}

export interface AppOptions {
  store: DraftStore;
  displayStore?: DisplayStore;
  controlToken?: string;
  webRoot?: string;
  broadcast?: (event: EventEnvelope) => void;
  assetPack?: LocalAssetPack;
  detector?: DetectorCoordinator;
  detectorLifecycle?: DetectorLifecycle;
  detectorCalibration?: DetectorCalibrationService;
  teamLogos?: TeamLogoStore;
  playerPhotos?: PlayerPhotoStore;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  let sequence = 0;
  const emit = (type: EventEnvelope["type"], data: unknown) => {
    options.broadcast?.({
      sequence: ++sequence,
      type,
      emittedAt: new Date().toISOString(),
      data,
    });
  };

  const requireControlToken = async (
    context: Parameters<typeof app.use>[1] extends (...args: infer P) => unknown
      ? P[0]
      : never,
    next: () => Promise<void>,
  ) => {
    if (!options.controlToken) return next();
    if (
      context.req.header("authorization") !== `Bearer ${options.controlToken}`
    ) {
      return context.json({ error: "A valid control token is required." }, 401);
    }
    return next();
  };
  const runSeriesCommand = async (command: SeriesCommand) => {
    if (!options.displayStore)
      throw new Error("Display storage is unavailable.");
    const draft = options.store.state;
    const display = options.displayStore.state;
    if (
      command.expectedDraftRevision !== draft.revision ||
      command.expectedDisplayRevision !== display.revision
    )
      throw new SeriesRevisionConflictError(draft.revision, display.revision);
    const next = structuredClone(display);
    let nextDraft = draft;

    if (
      command.type === "start-series" ||
      command.type === "start-quick-series"
    ) {
      let match =
        command.type === "start-series"
          ? next.schedule.find((item) => item.id === command.matchId)
          : undefined;
      if (command.type === "start-quick-series") {
        if (command.blueTeamId === command.redTeamId)
          throw new Error("Quick Series requires two different teams.");
        if (next.schedule.length >= 32)
          throw new Error("The match directory is full.");
        match = {
          id: randomUUID(),
          scheduledAt: null,
          stage: "Exhibition",
          round: "Quick Series",
          bestOf: 3,
          blueTeamId: command.blueTeamId,
          redTeamId: command.redTeamId,
          scores: { blue: 0, red: 0 },
          status: "live",
        };
        next.schedule.push(match);
      }
      if (!match) throw new Error("The selected match does not exist.");
      const blue = next.teams.find((team) => team.id === match.blueTeamId);
      const red = next.teams.find((team) => team.id === match.redTeamId);
      if (!blue || !red)
        throw new Error("The selected match teams are missing.");
      for (const item of next.schedule)
        if (item.id !== match.id && item.status === "live")
          item.status = "scheduled";
      match.status = "live";
      match.scores = { blue: 0, red: 0 };
      next.activeMatchId = match.id;
      next.scoreboard = {
        ...next.scoreboard,
        gameNumber: 1,
        bestOf: match.bestOf,
        stage: match.stage,
        round: match.round,
      };
      for (const [side, team] of [
        ["blue", blue],
        ["red", red],
      ] as const) {
        next.lineups[side] = team.starters.map(({ id, name, role }) => ({
          id,
          name,
          role,
          heroId: "",
        }));
        next.rosters[side] = [...team.starters, ...team.substitutes].map(
          ({ id, name }) => ({ id, name }),
        );
      }
      nextDraft = await options.store.dispatch({
        type: "activate-match",
        expectedRevision: draft.revision,
        blue: {
          name: blue.name,
          shortName: blue.shortName,
          logoUrl: blue.logoUrl,
        },
        red: { name: red.name, shortName: red.shortName, logoUrl: red.logoUrl },
      });
    } else {
      const match = next.schedule.find(
        (item) => item.id === next.activeMatchId,
      );
      if (match?.status !== "live")
        throw new Error("No live series is available.");
      if (command.type === "next-game") {
        const winsRequired = Math.floor(match.bestOf / 2) + 1;
        if (
          match.scores.blue >= winsRequired ||
          match.scores.red >= winsRequired
        )
          throw new Error(
            "The series has a winner. Complete the series instead.",
          );
        if (next.scoreboard.gameNumber >= match.bestOf)
          throw new Error("The series has no remaining games.");
        next.scoreboard.gameNumber += 1;
        nextDraft = await options.store.dispatch({
          type: "reset",
          expectedRevision: draft.revision,
        });
      } else {
        match.status = "complete";
        match.scores = structuredClone(draft.scoreboard.scores);
      }
    }

    const parsed = DisplayStateSchema.parse(next);
    const { revision: _, updatedAt: __, ...displaySettings } = parsed;
    const nextDisplay = options.displayStore.dispatch({
      type: "set-display",
      expectedRevision: display.revision,
      display: displaySettings,
    });
    if (nextDraft.revision !== draft.revision) emit("draft-updated", nextDraft);
    emit("display-updated", nextDisplay);
    return { draft: nextDraft, display: nextDisplay };
  };
  options.detector?.setEventSink(emit);

  app.get("/api/v1/system/status", (context) =>
    context.json({
      status: "ok",
      product: "SHAYYZ MLBB OVERLAY",
      version: "0.1.0",
    }),
  );
  app.get("/api/v1/draft", (context) => context.json(options.store.state));
  app.get("/api/v1/display", (context) =>
    options.displayStore
      ? context.json(options.displayStore.state)
      : context.json({ error: "Display storage is unavailable." }, 503),
  );
  const heroIds = heroes.map((hero) => hero.id);
  app.get("/api/v1/heroes", (context) =>
    context.json(options.assetPack?.heroes(heroes) ?? heroes),
  );
  app.get("/api/v1/assets/status", (context) =>
    context.json(
      options.assetPack?.status(heroIds) ?? emptyAssetStatus(heroIds),
    ),
  );
  app.get("/api/v1/detector/status", (context) =>
    context.json(options.detector?.status() ?? null),
  );
  app.get("/api/v1/detector/profile", async (context) =>
    context.json(
      options.detectorCalibration
        ? await options.detectorCalibration.load()
        : null,
    ),
  );
  app.post(
    "/api/v1/detector/calibration/frame",
    requireControlToken,
    async (context) => {
      if (!options.detectorCalibration)
        return context.json(
          { error: "Detector calibration is not configured." },
          503,
        );
      try {
        const { sourceName } = DetectorFrameRequestSchema.parse(
          await context.req.json(),
        );
        return context.json({
          imageData: await options.detectorCalibration.capture(sourceName),
        });
      } catch (error) {
        return context.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Calibration capture failed.",
          },
          400,
        );
      }
    },
  );
  app.put("/api/v1/detector/profile", requireControlToken, async (context) => {
    if (!options.detectorCalibration)
      return context.json(
        { error: "Detector calibration is not configured." },
        503,
      );
    try {
      const input = DetectorCalibrationSaveSchema.parse(
        await context.req.json(),
      );
      const profile = await options.detectorCalibration.save(input);
      return context.json({ profile, restartRequired: true });
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof Error ? error.message : "Calibration save failed.",
        },
        400,
      );
    }
  });
  app.put("/api/v1/detector/mode", requireControlToken, async (context) => {
    if (!options.detector)
      return context.json({ error: "The detector is not configured." }, 503);
    try {
      const { mode } = DetectorModeCommandSchema.parse(
        await context.req.json(),
      );
      if (mode === "off") options.detectorLifecycle?.stop();
      return context.json(options.detector.setMode(mode));
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "Invalid mode." },
        400,
      );
    }
  });
  for (const action of ["start", "stop"] as const) {
    app.post(
      `/api/v1/detector/${action}`,
      requireControlToken,
      async (context) => {
        if (!options.detector || !options.detectorLifecycle)
          return context.json(
            { error: "The detector is not configured." },
            503,
          );
        try {
          if (action === "start") await options.detectorLifecycle.start();
          else options.detectorLifecycle.stop();
          return context.json(options.detector.status());
        } catch (error) {
          return context.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Detector lifecycle failed.",
            },
            409,
          );
        }
      },
    );
  }
  for (const action of ["accept", "reject"] as const) {
    app.post(
      `/api/v1/detector/proposals/:id/${action}`,
      requireControlToken,
      async (context) => {
        if (!options.detector)
          return context.json(
            { error: "The detector is not configured." },
            503,
          );
        try {
          const proposal =
            action === "accept"
              ? await options.detector.accept(context.req.param("id"))
              : options.detector.reject(context.req.param("id"));
          return context.json(proposal);
        } catch (error) {
          return context.json(
            {
              error:
                error instanceof Error ? error.message : "Invalid proposal.",
            },
            409,
          );
        }
      },
    );
  }
  app.get("/api/v1/media/heroes/:id/:kind", (context) => {
    const kind = context.req.param("kind") as HeroMediaKind;
    if (!(["portrait", "poster", "voice"] as string[]).includes(kind))
      return context.notFound();
    const asset = options.assetPack?.hero(context.req.param("id"), kind);
    return asset ? mediaResponse(context.req.raw, asset) : context.notFound();
  });
  app.get("/api/v1/media/cues/:id", (context) => {
    const asset = options.assetPack?.cue(context.req.param("id"));
    return asset ? mediaResponse(context.req.raw, asset) : context.notFound();
  });
  app.get("/api/v1/media/roles/:role", (context) => {
    const role = PlayerRoleSchema.safeParse(context.req.param("role"));
    if (!role.success) return context.notFound();
    const asset = options.assetPack?.role(role.data);
    return asset ? mediaResponse(context.req.raw, asset) : context.notFound();
  });
  app.post("/api/v1/team-logos/:side", requireControlToken, async (context) => {
    if (!options.teamLogos)
      return context.json({ error: "Team logo storage is unavailable." }, 503);
    try {
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(context.req.param("side")))
        throw new Error("Team ID is invalid.");
      const logo = (await context.req.raw.formData()).get("logo");
      if (!(logo instanceof File))
        return context.json({ error: "A logo file is required." }, 400);
      return context.json(await options.teamLogos.save(logo));
    } catch (error) {
      return context.json(
        {
          error: error instanceof Error ? error.message : "Logo upload failed.",
        },
        400,
      );
    }
  });
  app.get("/api/v1/media/team-logos/:filename", async (context) => {
    const asset = await options.teamLogos?.resolve(
      context.req.param("filename"),
    );
    return asset ? mediaResponse(context.req.raw, asset) : context.notFound();
  });
  app.post(
    "/api/v1/player-photos/:teamId/:playerId",
    requireControlToken,
    async (context) => {
      if (!options.playerPhotos || !options.displayStore)
        return context.json(
          { error: "Player photo storage is unavailable." },
          503,
        );
      const team = options.displayStore.state.teams.find(
        (item) => item.id === context.req.param("teamId"),
      );
      if (
        !team?.starters.some(
          (player) => player.id === context.req.param("playerId"),
        )
      )
        return context.json({ error: "The starter does not exist." }, 404);
      try {
        const photo = (await context.req.raw.formData()).get("photo");
        if (!(photo instanceof File))
          return context.json({ error: "A player photo is required." }, 400);
        return context.json(await options.playerPhotos.save(photo));
      } catch (error) {
        return context.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Player photo upload failed.",
          },
          400,
        );
      }
    },
  );
  app.get("/api/v1/media/player-photos/:filename", async (context) => {
    const asset = await options.playerPhotos?.resolve(
      context.req.param("filename"),
    );
    return asset ? mediaResponse(context.req.raw, asset) : context.notFound();
  });
  app.post("/api/v1/display/commands", requireControlToken, async (context) => {
    if (!options.displayStore)
      return context.json({ error: "Display storage is unavailable." }, 503);
    try {
      const command = DisplayCommandSchema.parse(await context.req.json());
      const state = options.displayStore.dispatch(command);
      emit("display-updated", state);
      return context.json(state);
    } catch (error) {
      if (error instanceof RevisionConflictError)
        return context.json(
          { error: error.message, currentRevision: error.currentRevision },
          409,
        );
      return context.json(
        { error: error instanceof Error ? error.message : "Invalid command." },
        400,
      );
    }
  });

  app.post("/api/v1/matches/activate", requireControlToken, async (context) => {
    if (!options.displayStore)
      return context.json({ error: "Display storage is unavailable." }, 503);
    try {
      const command = ActivateMatchCommandSchema.parse(
        await context.req.json(),
      );
      const seriesCommand: SeriesCommand =
        command.type === "activate-match"
          ? { ...command, type: "start-series" }
          : { ...command, type: "start-quick-series" };
      return context.json(await runSeriesCommand(seriesCommand));
    } catch (error) {
      if (error instanceof SeriesRevisionConflictError)
        return context.json(
          {
            error: error.message,
            currentDraftRevision: error.currentDraftRevision,
            currentDisplayRevision: error.currentDisplayRevision,
          },
          409,
        );
      return context.json(
        {
          error: error instanceof Error ? error.message : "Activation failed.",
        },
        400,
      );
    }
  });

  app.post("/api/v1/series/commands", requireControlToken, async (context) => {
    if (!options.displayStore)
      return context.json({ error: "Display storage is unavailable." }, 503);
    try {
      return context.json(
        await runSeriesCommand(
          SeriesCommandSchema.parse(await context.req.json()),
        ),
      );
    } catch (error) {
      if (error instanceof SeriesRevisionConflictError)
        return context.json(
          {
            error: error.message,
            currentDraftRevision: error.currentDraftRevision,
            currentDisplayRevision: error.currentDisplayRevision,
          },
          409,
        );
      return context.json(
        {
          error:
            error instanceof Error ? error.message : "Series command failed.",
        },
        400,
      );
    }
  });

  app.post("/api/v1/draft/commands", requireControlToken, async (context) => {
    try {
      const command = DraftCommandSchema.parse(await context.req.json());
      const state = await options.store.dispatch(command);
      emit("draft-updated", state);
      if (
        options.displayStore &&
        ["set-scoreboard-score", "reset-scoreboard"].includes(command.type)
      ) {
        const display = options.displayStore.syncActiveScores(
          state.scoreboard.scores,
        );
        emit("display-updated", display);
      }
      return context.json(state);
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        return context.json(
          { error: error.message, currentRevision: error.currentRevision },
          409,
        );
      }
      const message =
        error instanceof Error ? error.message : "Invalid command.";
      return context.json({ error: message }, 400);
    }
  });

  const legacyRoutes = [
    "/control.html",
    "/controlban6.html",
    "/display.html",
    "/display2.html",
    "/displayban6.html",
    "/display2ban6.html",
    "/displaycostum.html",
    "/displaycostumban6.html",
    "/scoreboard.html",
  ];
  for (const route of legacyRoutes) {
    app.get(route, (context) =>
      context.redirect(
        route === "/scoreboard.html"
          ? "/overlay/scoreboard"
          : route.includes("control")
            ? "/control/draft"
            : "/overlay/draft",
        308,
      ),
    );
  }

  if (options.webRoot && existsSync(options.webRoot)) {
    app.use("/assets/*", serveStatic({ root: options.webRoot }));
    app.get("*", serveStatic({ root: options.webRoot, path: "index.html" }));
  } else {
    app.notFound((context) =>
      context.json({ error: "The web application has not been built." }, 404),
    );
  }

  return app;
}

function mediaResponse(
  request: Request,
  asset: { absolutePath: string; mimeType: string },
): Response {
  const file = Bun.file(asset.absolutePath);
  const headers = {
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "content-type": asset.mimeType,
  };
  const match = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return new Response(file, { headers });
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : file.size - 1;
  if (start > end || end >= file.size)
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${file.size}` },
    });
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${file.size}`,
    },
  });
}
