import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "@shayyz/contracts";
import { DraftCommandSchema } from "@shayyz/contracts";
import { serveStatic } from "hono/bun";
import { Hono } from "hono";
import { heroes } from "./heroes";
import { RevisionConflictError, type DraftStore } from "./store";

export interface AppOptions {
  store: DraftStore;
  controlToken?: string;
  webRoot?: string;
  broadcast?: (event: EventEnvelope) => void;
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

  app.get("/api/v1/system/status", (context) =>
    context.json({
      status: "ok",
      product: "SHAYYZ MLBB OVERLAY",
      version: "0.1.0",
    }),
  );
  app.get("/api/v1/draft", (context) => context.json(options.store.state));
  app.get("/api/v1/heroes", (context) => context.json(heroes));

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
    app.get("*", serveStatic({ path: join(options.webRoot, "index.html") }));
  } else {
    app.notFound((context) =>
      context.json({ error: "The web application has not been built." }, 404),
    );
  }

  return app;
}
