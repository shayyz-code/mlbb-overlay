import { existsSync } from "node:fs";
import type { EventEnvelope } from "@shayyz/contracts";
import {
  DetectorCalibrationSaveSchema,
  DetectorFrameRequestSchema,
  DetectorModeCommandSchema,
  DisplayCommandSchema,
  DraftCommandSchema,
  SideSchema,
} from "@shayyz/contracts";
import { serveStatic } from "hono/bun";
import { Hono } from "hono";
import {
  emptyAssetStatus,
  type HeroMediaKind,
  type LocalAssetPack,
} from "./assets";
import { heroes } from "./heroes";
import { RevisionConflictError, type DraftStore } from "./store";
import type { DetectorCoordinator } from "./detector";
import type { DetectorLifecycle } from "./detector-lifecycle";
import type { DetectorCalibrationService } from "./calibration";
import type { TeamLogoStore } from "./team-logos";
import type { DisplayMediaStore } from "./display-media";
import type { DisplayStore } from "./display-store";

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
  displayMedia?: DisplayMediaStore;
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
  app.post("/api/v1/team-logos/:side", requireControlToken, async (context) => {
    if (!options.teamLogos)
      return context.json({ error: "Team logo storage is unavailable." }, 503);
    try {
      SideSchema.parse(context.req.param("side"));
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
  app.post("/api/v1/display-media", requireControlToken, async (context) => {
    if (!options.displayMedia)
      return context.json(
        { error: "Display media storage is unavailable." },
        503,
      );
    try {
      const media = (await context.req.raw.formData()).get("media");
      if (!(media instanceof File))
        return context.json({ error: "A media file is required." }, 400);
      return context.json(await options.displayMedia.save(media));
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof Error ? error.message : "Media upload failed.",
        },
        400,
      );
    }
  });
  app.get("/api/v1/media/displays/:filename", async (context) => {
    const asset = await options.displayMedia?.resolve(
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

  app.post("/api/v1/draft/commands", requireControlToken, async (context) => {
    try {
      const command = DraftCommandSchema.parse(await context.req.json());
      const state = await options.store.dispatch(command);
      emit("draft-updated", state);
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
