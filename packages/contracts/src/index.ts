import { z } from "zod";

export const SideSchema = z.enum(["blue", "red"]);
export type Side = z.infer<typeof SideSchema>;

export const SelectionKindSchema = z.enum(["ban", "pick"]);
export type SelectionKind = z.infer<typeof SelectionKindSchema>;

export const SelectionSourceSchema = z.enum(["manual", "detector"]);
export type SelectionSource = z.infer<typeof SelectionSourceSchema>;

export const HeroSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  portraitUrl: z.string().optional(),
  posterUrl: z.string().optional(),
  voiceUrl: z.string().optional(),
});
export type Hero = z.infer<typeof HeroSchema>;

export const AssetFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine(
      (value) =>
        !value.startsWith("/") &&
        !value.includes("\\") &&
        !value.split("/").some((part) => part === "" || part === ".."),
      "Asset paths must be safe relative POSIX paths.",
    ),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum([
    "image/png",
    "image/gif",
    "video/webm",
    "video/mp4",
    "audio/ogg",
  ]),
});
export type AssetFile = z.infer<typeof AssetFileSchema>;

export const HeroMediaSchema = z.object({
  portrait: AssetFileSchema.optional(),
  poster: AssetFileSchema.optional(),
  voice: AssetFileSchema.optional(),
});
export type HeroMedia = z.infer<typeof HeroMediaSchema>;

export const AssetPackManifestSchema = z.object({
  schemaVersion: z.literal(1),
  pack: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(1).max(80),
    usage: z.literal("personal-local-no-redistribution"),
    createdAt: z.string().datetime(),
    gameBuild: z.string().optional(),
  }),
  heroes: z.record(z.string().regex(/^[a-z0-9-]+$/), HeroMediaSchema),
  cues: z
    .object({
      bluePick: AssetFileSchema.optional(),
      redPick: AssetFileSchema.optional(),
      blueBan: AssetFileSchema.optional(),
      redBan: AssetFileSchema.optional(),
    })
    .default({}),
});
export type AssetPackManifest = z.infer<typeof AssetPackManifestSchema>;

export const AssetPackStatusSchema = z.object({
  enabled: z.boolean(),
  packId: z.string().optional(),
  displayName: z.string().optional(),
  gameBuild: z.string().optional(),
  coverage: z.object({
    heroes: z.number().int().nonnegative(),
    portraits: z.number().int().nonnegative(),
    posters: z.number().int().nonnegative(),
    voices: z.number().int().nonnegative(),
  }),
  missingHeroIds: z.array(z.string()),
  cueUrls: z.record(z.string(), z.string()),
});
export type AssetPackStatus = z.infer<typeof AssetPackStatusSchema>;

export const PixelRectSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type PixelRect = z.infer<typeof PixelRectSchema>;

export const DraftReferenceMapSchema = z.object({
  schemaVersion: z.literal(1),
  gameBuild: z.string().min(1),
  crop: PixelRectSchema.nullable(),
  output: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  clips: z.array(
    z.object({
      heroId: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1).optional(),
      input: z.string(),
      atSeconds: z.number().finite().nonnegative().nullable(),
    }),
  ),
});
export type DraftReferenceMap = z.infer<typeof DraftReferenceMapSchema>;

export const TeamSchema = z.object({
  name: z.string().min(1).max(60),
  shortName: z.string().min(1).max(8),
  logoUrl: z.string().default(""),
});
export type Team = z.infer<typeof TeamSchema>;

export const DraftPhaseSchema = z.object({
  side: SideSchema,
  kind: SelectionKindSchema,
  slot: z.number().int().min(0).max(5),
});
export type DraftPhase = z.infer<typeof DraftPhaseSchema>;

export const DraftFormatSchema = z.object({
  id: z.string(),
  name: z.string(),
  phases: z.array(DraftPhaseSchema).min(1),
});
export type DraftFormat = z.infer<typeof DraftFormatSchema>;

export const DraftSelectionSchema = z.object({
  heroId: z.string(),
  phaseIndex: z.number().int().nonnegative(),
  source: SelectionSourceSchema,
  confidence: z.number().min(0).max(1).optional(),
});
export type DraftSelection = z.infer<typeof DraftSelectionSchema>;

const SelectionSlotsSchema = z.array(DraftSelectionSchema.nullable()).length(5);
const SideSelectionsSchema = z.object({
  bans: SelectionSlotsSchema,
  picks: SelectionSlotsSchema,
});

export const DraftTimerSchema = z.object({
  durationSeconds: z.number().int().min(5).max(300),
  remainingSeconds: z.number().int().min(0).max(300),
  running: z.boolean(),
  startedAt: z.number().int().nonnegative().nullable(),
});
export type DraftTimer = z.infer<typeof DraftTimerSchema>;

export const PresentationSettingsSchema = z
  .object({
    voiceEnabled: z.boolean().default(false),
  })
  .default({ voiceEnabled: false });
export type PresentationSettings = z.infer<typeof PresentationSettingsSchema>;

export const DraftStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  status: z.enum(["setup", "drafting", "complete"]),
  phaseIndex: z.number().int().nonnegative(),
  format: DraftFormatSchema,
  teams: z.object({ blue: TeamSchema, red: TeamSchema }),
  selections: z.object({
    blue: SideSelectionsSchema,
    red: SideSelectionsSchema,
  }),
  timer: DraftTimerSchema,
  presentation: PresentationSettingsSchema,
});
export type DraftState = z.infer<typeof DraftStateSchema>;

const CommandBaseSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
});

export const DraftCommandSchema = z.discriminatedUnion("type", [
  CommandBaseSchema.extend({
    type: z.literal("select-hero"),
    heroId: z.string(),
    source: SelectionSourceSchema.default("manual"),
    confidence: z.number().min(0).max(1).optional(),
  }),
  CommandBaseSchema.extend({ type: z.literal("undo") }),
  CommandBaseSchema.extend({ type: z.literal("reset") }),
  CommandBaseSchema.extend({ type: z.literal("swap-sides") }),
  CommandBaseSchema.extend({
    type: z.literal("set-team"),
    side: SideSchema,
    team: TeamSchema,
  }),
  CommandBaseSchema.extend({
    type: z.literal("set-timer"),
    durationSeconds: z.number().int().min(5).max(300),
  }),
  CommandBaseSchema.extend({ type: z.literal("start-timer") }),
  CommandBaseSchema.extend({ type: z.literal("pause-timer") }),
  CommandBaseSchema.extend({
    type: z.literal("set-presentation"),
    presentation: PresentationSettingsSchema,
  }),
]);
export type DraftCommand = z.infer<typeof DraftCommandSchema>;

export const EventEnvelopeSchema = z.object({
  sequence: z.number().int().positive(),
  type: z.enum([
    "draft-snapshot",
    "draft-updated",
    "detector-proposal",
    "system-status",
  ]),
  emittedAt: z.string().datetime(),
  data: z.unknown(),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const STANDARD_TEN_BAN_FORMAT: DraftFormat = {
  id: "standard-ten-ban",
  name: "Standard 10-Ban Draft",
  phases: [
    { side: "blue", kind: "ban", slot: 0 },
    { side: "red", kind: "ban", slot: 0 },
    { side: "blue", kind: "ban", slot: 1 },
    { side: "red", kind: "ban", slot: 1 },
    { side: "blue", kind: "ban", slot: 2 },
    { side: "red", kind: "ban", slot: 2 },
    { side: "blue", kind: "pick", slot: 0 },
    { side: "red", kind: "pick", slot: 0 },
    { side: "red", kind: "pick", slot: 1 },
    { side: "blue", kind: "pick", slot: 1 },
    { side: "blue", kind: "pick", slot: 2 },
    { side: "red", kind: "pick", slot: 2 },
    { side: "red", kind: "ban", slot: 3 },
    { side: "blue", kind: "ban", slot: 3 },
    { side: "red", kind: "ban", slot: 4 },
    { side: "blue", kind: "ban", slot: 4 },
    { side: "red", kind: "pick", slot: 3 },
    { side: "blue", kind: "pick", slot: 3 },
    { side: "blue", kind: "pick", slot: 4 },
    { side: "red", kind: "pick", slot: 4 },
  ],
};

const emptySlots = (): Array<DraftSelection | null> =>
  Array.from({ length: 5 }, () => null);

export function createDefaultDraftState(now = new Date()): DraftState {
  return {
    revision: 0,
    updatedAt: now.toISOString(),
    status: "setup",
    phaseIndex: 0,
    format: STANDARD_TEN_BAN_FORMAT,
    teams: {
      blue: { name: "Blue Team", shortName: "BLUE", logoUrl: "" },
      red: { name: "Red Team", shortName: "RED", logoUrl: "" },
    },
    selections: {
      blue: { bans: emptySlots(), picks: emptySlots() },
      red: { bans: emptySlots(), picks: emptySlots() },
    },
    timer: {
      durationSeconds: 60,
      remainingSeconds: 60,
      running: false,
      startedAt: null,
    },
    presentation: { voiceEnabled: false },
  };
}

export function selectedHeroIds(state: DraftState): Set<string> {
  const ids = new Set<string>();
  for (const side of ["blue", "red"] as const) {
    for (const kind of ["bans", "picks"] as const) {
      for (const selection of state.selections[side][kind]) {
        if (selection) ids.add(selection.heroId);
      }
    }
  }
  return ids;
}

export function currentPhase(state: DraftState): DraftPhase | null {
  return state.format.phases[state.phaseIndex] ?? null;
}

export function applySelection(
  state: DraftState,
  input: { heroId: string; source: SelectionSource; confidence?: number },
  now = new Date(),
): DraftState {
  const phase = currentPhase(state);
  if (!phase) throw new Error("The draft is already complete.");
  if (selectedHeroIds(state).has(input.heroId))
    throw new Error("That hero is already selected.");

  const next = structuredClone(state);
  const slots =
    phase.kind === "ban"
      ? next.selections[phase.side].bans
      : next.selections[phase.side].picks;
  slots[phase.slot] = {
    heroId: input.heroId,
    phaseIndex: state.phaseIndex,
    source: input.source,
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
  };
  next.phaseIndex += 1;
  next.revision += 1;
  next.updatedAt = now.toISOString();
  next.status =
    next.phaseIndex >= next.format.phases.length ? "complete" : "drafting";
  next.timer = {
    ...next.timer,
    remainingSeconds: next.timer.durationSeconds,
    running: false,
    startedAt: null,
  };
  return DraftStateSchema.parse(next);
}
