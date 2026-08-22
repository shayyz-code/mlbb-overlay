import { existsSync } from "node:fs";
import type { EventEnvelope } from "@shayyz/contracts";
import {
  DetectorModeCommandSchema,
  DraftCommandSchema,
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

export interface AppOptions {
  store: DraftStore;
  controlToken?: string;
  webRoot?: string;
  broadcast?: (event: EventEnvelope) => void;
  assetPack?: LocalAssetPack;
  detector?: DetectorCoordinator;
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
  app.put("/api/v1/detector/mode", requireControlToken, async (context) => {
    if (!options.detector)
      return context.json({ error: "The detector is not configured." }, 503);
    try {
      const { mode } = DetectorModeCommandSchema.parse(
        await context.req.json(),
      );
      return context.json(options.detector.setMode(mode));
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "Invalid mode." },
        400,
      );
    }
  });
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
  ];
  for (const route of legacyRoutes) {
    app.get(route, (context) =>
      context.redirect(
        route.includes("control") ? "/control/draft" : "/overlay/draft",
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
