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
  roles: z
    .object({
      exp: AssetFileSchema.optional(),
      jungle: AssetFileSchema.optional(),
      mid: AssetFileSchema.optional(),
      gold: AssetFileSchema.optional(),
      roam: AssetFileSchema.optional(),
    })
    .default({}),
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

export const DetectorModeSchema = z.enum([
  "off",
  "proposal",
  "confidence-tiered",
]);
export type DetectorMode = z.infer<typeof DetectorModeSchema>;

const SafeRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").some((part) => part === "" || part === ".."),
    "Paths must be safe relative POSIX paths.",
  );

export const DetectorModelManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]+$/),
    revision: z.string().regex(/^[a-f0-9]{7,64}$/),
    architecture: z.literal("mobilenet-v3-small"),
    model: z.object({
      path: SafeRelativePathSchema,
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      sizeBytes: z
        .number()
        .int()
        .positive()
        .max(16 * 1024 * 1024),
      precision: z.enum(["fp32", "int8"]),
      inputName: z.literal("input"),
      outputName: z.literal("logits"),
    }),
    input: z.object({
      width: z.literal(224),
      height: z.literal(224),
      channels: z.literal(3),
      layout: z.literal("nchw"),
      colorSpace: z.literal("rgb"),
      mean: z.tuple([z.number(), z.number(), z.number()]),
      std: z.tuple([
        z.number().positive(),
        z.number().positive(),
        z.number().positive(),
      ]),
    }),
    labels: z.array(z.string().regex(/^[a-z0-9-]+$/)).length(135),
    validation: z.object({
      validatedAt: z.string().datetime().nullable(),
      top1Accuracy: z.number().min(0).max(1).nullable(),
      macroRecall: z.number().min(0).max(1).nullable(),
      unknownFalseAcceptRate: z.number().min(0).max(1).nullable(),
    }),
  })
  .superRefine((manifest, context) => {
    if (new Set(manifest.labels).size !== manifest.labels.length)
      context.addIssue({
        code: "custom",
        path: ["labels"],
        message: "Model labels must be unique.",
      });
    if (
      manifest.labels.at(-2) !== "empty" ||
      manifest.labels.at(-1) !== "unknown"
    )
      context.addIssue({
        code: "custom",
        path: ["labels"],
        message: "Model labels must end with empty and unknown.",
      });
  });
export type DetectorModelManifest = z.infer<typeof DetectorModelManifestSchema>;

export const DetectorDatasetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string().datetime(),
  samples: z.array(
    z.object({
      heroId: z.string().regex(/^[a-z0-9-]+$/),
      kind: SelectionKindSchema,
      side: SideSchema,
      slot: z.number().int().min(0).max(4),
      gameBuild: z.string().min(1),
      sessionId: z.string().regex(/^[a-zA-Z0-9-]+$/),
      split: z.enum(["train", "validation", "test"]),
      source: z.object({
        kind: z.enum(["local-capture", "roboflow-seed", "synthetic"]),
        license: z.string().min(1),
        attribution: z.string().min(1).optional(),
      }),
      file: z.object({
        path: SafeRelativePathSchema,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    }),
  ),
});
export type DetectorDatasetManifest = z.infer<
  typeof DetectorDatasetManifestSchema
>;

export const DetectorSlotSchema = z.object({
  side: SideSchema,
  kind: SelectionKindSchema,
  slot: z.number().int().min(0).max(4),
  rect: PixelRectSchema,
});
export type DetectorSlot = z.infer<typeof DetectorSlotSchema>;

export const DetectorProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  gameBuild: z.string().min(1),
  language: z.string().min(2).max(16),
  sourceName: z.string().min(1),
  frame: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  slots: z.array(DetectorSlotSchema).length(20),
  thresholds: z.object({
    proposal: z.number().min(0).max(1).default(0.94),
    automatic: z.number().min(0).max(1).default(0.985),
    proposalMargin: z.number().min(0).max(1).default(0.015),
    automaticMargin: z.number().min(0).max(1).default(0.025),
    empty: z.number().min(0).max(1).default(0.98),
  }),
  validation: z.object({
    referenceCount: z.number().int().min(0).max(133),
    validatedAt: z.string().datetime().nullable(),
  }),
});
export type DetectorProfile = z.infer<typeof DetectorProfileSchema>;

export const DetectorProposalSchema = z.object({
  id: z.string().uuid(),
  heroId: z.string().regex(/^[a-z0-9-]+$/),
  side: SideSchema,
  kind: SelectionKindSchema,
  slot: z.number().int().min(0).max(4),
  phaseIndex: z.number().int().nonnegative(),
  draftRevision: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  runnerUpMargin: z.number().min(0).max(1),
  evidenceFrames: z.number().int().positive(),
  proposedAt: z.string().datetime(),
  status: z.enum([
    "pending",
    "accepted",
    "rejected",
    "superseded",
    "auto-applied",
  ]),
});
export type DetectorProposal = z.infer<typeof DetectorProposalSchema>;

export const DetectorStatusSchema = z.object({
  mode: DetectorModeSchema,
  running: z.boolean(),
  profileConfigured: z.boolean(),
  referenceCount: z.number().int().nonnegative(),
  expectedReferenceCount: z.literal(133),
  automaticReady: z.boolean(),
  pendingProposal: DetectorProposalSchema.nullable(),
  lastError: z.string().nullable(),
});
export type DetectorStatus = z.infer<typeof DetectorStatusSchema>;

export const DetectorModeCommandSchema = z.object({ mode: DetectorModeSchema });
export type DetectorModeCommand = z.infer<typeof DetectorModeCommandSchema>;

export const DetectorFrameRequestSchema = z.object({
  sourceName: z.string().trim().min(1).max(120),
});
export const DetectorFrameSchema = z.object({
  imageData: z.string().regex(/^data:image\/png;base64,/),
});
export const DetectorCalibrationSaveSchema = z.object({
  profile: DetectorProfileSchema,
  emptyFrameData: z.string().regex(/^data:image\/png;base64,/),
});
export const DetectorCalibrationResultSchema = z.object({
  profile: DetectorProfileSchema,
  restartRequired: z.literal(true),
});
export type DetectorFrameRequest = z.infer<typeof DetectorFrameRequestSchema>;
export type DetectorCalibrationSave = z.infer<
  typeof DetectorCalibrationSaveSchema
>;

const ReplayFramePathSchema = z
  .string()
  .regex(/\.(?:png|jpe?g)$/i)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").some((part) => part === "" || part === ".."),
    "Replay frame paths must be safe and relative.",
  );
export const DetectorReplayManifestSchema = z.object({
  schemaVersion: z.literal(1),
  drafts: z.array(
    z.object({
      id: z.string().min(1),
      selections: z
        .array(
          z.object({
            expectedHeroId: z.string().regex(/^[a-z0-9-]+$/),
            transitionAtMs: z.number().int().nonnegative(),
            frames: z
              .array(
                z.object({
                  path: ReplayFramePathSchema,
                  observedAtMs: z.number().int().nonnegative(),
                }),
              )
              .min(4),
          }),
        )
        .length(20),
    }),
  ),
});
export type DetectorReplayManifest = z.infer<
  typeof DetectorReplayManifestSchema
>;

export const DetectorBenchmarkReportSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: z.string(),
  generatedAt: z.string().datetime(),
  draftCount: z.number().int().nonnegative(),
  referenceCount: z.number().int().nonnegative(),
  selections: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  p95LatencyMs: z.number().nonnegative().nullable(),
  eligible: z.boolean(),
  failures: z.array(z.string()),
});
export type DetectorBenchmarkReport = z.infer<
  typeof DetectorBenchmarkReportSchema
>;

export const IdlePosterJobsSchema = z.object({
  schemaVersion: z.literal(1),
  model: z.object({
    checkpoint: z.string().min(1),
    revision: z.string().min(1),
  }),
  parameters: z.object({
    width: z.literal(576),
    height: z.literal(1024),
    frames: z.literal(25),
    sourceFps: z.literal(6),
    motionBucketId: z.number().int().min(1).max(255),
    augmentationLevel: z.number().min(0).max(0.03),
  }),
  jobs: z.array(
    z.object({
      heroId: z.string().regex(/^[a-z0-9-]+$/),
      source: z.string().min(1),
      sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
      seed: z.number().int().nonnegative(),
      status: z.enum(["pending", "generated", "rejected"]),
      outputSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    }),
  ),
});
export type IdlePosterJobs = z.infer<typeof IdlePosterJobsSchema>;

export const PrivateAssetProvenanceSchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.record(
    z.string(),
    z.object({
      sourceUrl: z.string().url(),
      retrievedAt: z.string().datetime(),
      sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
      rights: z.literal("personal-local-no-redistribution"),
      transformations: z.array(z.string()),
    }),
  ),
});
export type PrivateAssetProvenance = z.infer<
  typeof PrivateAssetProvenanceSchema
>;

export const TeamSchema = z.object({
  name: z.string().min(1).max(60),
  shortName: z.string().min(1).max(8),
  logoUrl: z.string().default(""),
});
export type Team = z.infer<typeof TeamSchema>;

export const TeamLogoUploadResultSchema = z.object({
  logoUrl: z.string().startsWith("/api/v1/media/team-logos/"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
export type TeamLogoUploadResult = z.infer<typeof TeamLogoUploadResultSchema>;

export const PlayerPhotoUploadResultSchema = z.object({
  photoUrl: z.string().startsWith("/api/v1/media/player-photos/"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
export type PlayerPhotoUploadResult = z.infer<
  typeof PlayerPhotoUploadResultSchema
>;

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
  durationSeconds: z.literal(50),
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

export const ScoreboardSettingsSchema = z
  .object({
    scores: z
      .object({
        blue: z.number().int().min(0).max(99).default(0),
        red: z.number().int().min(0).max(99).default(0),
      })
      .default({ blue: 0, red: 0 }),
  })
  .default({ scores: { blue: 0, red: 0 } });
export type ScoreboardSettings = z.infer<typeof ScoreboardSettingsSchema>;

export const PlayerRoleSchema = z.enum([
  "exp",
  "jungle",
  "mid",
  "gold",
  "roam",
]);
export type PlayerRole = z.infer<typeof PlayerRoleSchema>;

export const StarterSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(40),
  role: PlayerRoleSchema,
  heroId: z.string().regex(/^[a-z0-9-]*$/),
});
export type Starter = z.infer<typeof StarterSchema>;

export const RosterPlayerSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(40),
});
export type RosterPlayer = z.infer<typeof RosterPlayerSchema>;

export const ManagedStarterSchema = RosterPlayerSchema.extend({
  role: PlayerRoleSchema,
  photoUrl: z
    .union([
      z.literal(""),
      z.string().startsWith("/api/v1/media/player-photos/"),
    ])
    .default(""),
});
export type ManagedStarter = z.infer<typeof ManagedStarterSchema>;

export const ManagedSubstituteSchema = RosterPlayerSchema.extend({
  role: PlayerRoleSchema.nullable(),
});
export type ManagedSubstitute = z.infer<typeof ManagedSubstituteSchema>;

export const ManagedTeamSchema = TeamSchema.extend({
  id: z.string().min(1).max(80),
  starters: z.array(ManagedStarterSchema).length(5),
  substitutes: z.array(ManagedSubstituteSchema).max(5),
}).superRefine((team, context) => {
  const players = [...team.starters, ...team.substitutes];
  if (new Set(players.map((player) => player.id)).size !== players.length)
    context.addIssue({
      code: "custom",
      path: ["starters"],
      message: "Player IDs must be unique within a managed team.",
    });
  if (new Set(team.starters.map((player) => player.role)).size !== 5)
    context.addIssue({
      code: "custom",
      path: ["starters"],
      message: "Every starter role must be assigned exactly once.",
    });
});
export type ManagedTeam = z.infer<typeof ManagedTeamSchema>;

export const TeamRosterSchema = z
  .array(RosterPlayerSchema)
  .min(5)
  .max(10)
  .superRefine((roster, context) => {
    if (new Set(roster.map((player) => player.id)).size !== roster.length)
      context.addIssue({
        code: "custom",
        message: "Roster player IDs must be unique.",
      });
  });
export type TeamRoster = z.infer<typeof TeamRosterSchema>;

export const MatchLineupSchema = z
  .array(StarterSchema)
  .length(5)
  .superRefine((lineup, context) => {
    if (new Set(lineup.map((player) => player.id)).size !== lineup.length)
      context.addIssue({
        code: "custom",
        message: "Starter IDs must be unique.",
      });
    if (new Set(lineup.map((player) => player.role)).size !== lineup.length)
      context.addIssue({
        code: "custom",
        message: "Starter roles must be unique.",
      });
  });
export type MatchLineup = z.infer<typeof MatchLineupSchema>;

export const ScheduledMatchSchema = z.object({
  id: z.string().min(1).max(80),
  scheduledAt: z.string().datetime().nullable(),
  stage: z.string().max(60),
  round: z.string().max(60),
  bestOf: z.number().int().min(1).max(9),
  blueTeamId: z.string().min(1).max(80),
  redTeamId: z.string().min(1).max(80),
  scores: z.object({
    blue: z.number().int().min(0).max(9),
    red: z.number().int().min(0).max(9),
  }),
  status: z.enum(["scheduled", "live", "complete"]),
});
export type ScheduledMatch = z.infer<typeof ScheduledMatchSchema>;

const TimezoneSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Event timezone must be a valid IANA timezone.");

export const NativeHudFrameSchema = z
  .object({
    x: z.number().int().min(0).max(1919),
    y: z.number().int().min(0).max(1079),
    width: z.number().int().min(40).max(500),
    height: z.number().int().min(100).max(900),
    rowGap: z.number().int().min(0).max(12),
  })
  .superRefine((frame, context) => {
    if (frame.x + frame.width > 1920)
      context.addIssue({
        code: "custom",
        path: ["width"],
        message: "Frame width must stay inside the 1920px canvas.",
      });
    if (frame.y + frame.height > 1080)
      context.addIssue({
        code: "custom",
        path: ["height"],
        message: "Frame height must stay inside the 1080px canvas.",
      });
  });
export type NativeHudFrame = z.infer<typeof NativeHudFrameSchema>;

export const DisplaySettingsSchema = z.object({
  event: z.object({
    name: z.string().min(1).max(80),
    timezone: TimezoneSchema,
  }),
  scoreboard: z.object({
    preset: z.enum(["tournament", "compact"]),
    gameNumber: z.number().int().min(1).max(9),
    bestOf: z.number().int().min(1).max(9),
    stage: z.string().max(60),
    round: z.string().max(60),
    frames: z.object({
      blue: NativeHudFrameSchema,
      red: NativeHudFrameSchema,
    }),
  }),
  teams: z
    .array(ManagedTeamSchema)
    .max(64)
    .superRefine((teams, context) => {
      if (new Set(teams.map((team) => team.id)).size !== teams.length)
        context.addIssue({
          code: "custom",
          message: "Managed team IDs must be unique.",
        });
    }),
  lineups: z.object({
    blue: MatchLineupSchema,
    red: MatchLineupSchema,
  }),
  rosters: z.object({
    blue: TeamRosterSchema,
    red: TeamRosterSchema,
  }),
  schedule: z.array(ScheduledMatchSchema).max(32),
  activeMatchId: z.string().nullable(),
  countdown: z.object({
    durationSeconds: z.number().int().min(0).max(604800),
    remainingSeconds: z.number().int().min(0).max(604800),
    running: z.boolean(),
    startedAt: z.number().int().nonnegative().nullable(),
  }),
  ticker: z.object({
    enabled: z.boolean(),
    messages: z.array(z.string().min(1).max(240)).max(20),
    activeIndex: z.number().int().nonnegative(),
    speedSeconds: z.number().min(5).max(120),
  }),
  rosterLoop: z.object({
    holdSeconds: z.number().min(3).max(30),
    transitionSeconds: z.number().min(0.3).max(2),
  }),
  cueRevision: z.number().int().nonnegative(),
});
export type DisplaySettings = z.infer<typeof DisplaySettingsSchema>;

export const TeamDirectorySchema = DisplaySettingsSchema.shape.teams;
export const MatchScheduleSchema = DisplaySettingsSchema.shape.schedule;
export const OverlayConfigSchema = DisplaySettingsSchema.pick({
  event: true,
  scoreboard: true,
  countdown: true,
  ticker: true,
  rosterLoop: true,
});
export type OverlayConfig = z.infer<typeof OverlayConfigSchema>;

export const DisplayStateSchema = DisplaySettingsSchema.extend({
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
}).superRefine((state, context) => {
  if (
    state.activeMatchId !== null &&
    !state.schedule.some((match) => match.id === state.activeMatchId)
  )
    context.addIssue({
      code: "custom",
      path: ["activeMatchId"],
      message: "The active match must exist in the schedule.",
    });
  for (const side of ["blue", "red"] as const) {
    const rosterIds = new Set(state.rosters[side].map((player) => player.id));
    if (state.lineups[side].some((starter) => !rosterIds.has(starter.id)))
      context.addIssue({
        code: "custom",
        path: ["lineups", side],
        message: "Every starter must belong to the team roster.",
      });
  }
  const teamIds = new Set(state.teams.map((team) => team.id));
  state.schedule.forEach((match, index) => {
    if (!teamIds.has(match.blueTeamId) || !teamIds.has(match.redTeamId))
      context.addIssue({
        code: "custom",
        path: ["schedule", index],
        message: "Every scheduled match team must exist in the team directory.",
      });
    if (match.blueTeamId === match.redTeamId)
      context.addIssue({
        code: "custom",
        path: ["schedule", index, "redTeamId"],
        message: "A team cannot play against itself.",
      });
  });
});
export type DisplayState = z.infer<typeof DisplayStateSchema>;

export const DisplayCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set-display"),
    expectedRevision: z.number().int().nonnegative(),
    display: DisplaySettingsSchema,
  }),
  z.object({
    type: z.literal("set-team-directory"),
    expectedRevision: z.number().int().nonnegative(),
    teams: TeamDirectorySchema,
  }),
  z.object({
    type: z.literal("set-match-schedule"),
    expectedRevision: z.number().int().nonnegative(),
    schedule: MatchScheduleSchema,
  }),
  z.object({
    type: z.literal("set-overlay-config"),
    expectedRevision: z.number().int().nonnegative(),
    config: OverlayConfigSchema,
  }),
  z.object({
    type: z.literal("cue"),
    expectedRevision: z.number().int().nonnegative(),
  }),
]);
export type DisplayCommand = z.infer<typeof DisplayCommandSchema>;

export const ActivateMatchCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("activate-match"),
    matchId: z.string().min(1).max(80),
    expectedDraftRevision: z.number().int().nonnegative(),
    expectedDisplayRevision: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("activate-quick-match"),
    blueTeamId: z.string().min(1).max(80),
    redTeamId: z.string().min(1).max(80),
    expectedDraftRevision: z.number().int().nonnegative(),
    expectedDisplayRevision: z.number().int().nonnegative(),
  }),
]);
export type ActivateMatchCommand = z.infer<typeof ActivateMatchCommandSchema>;

const SeriesRevisionSchema = z.object({
  expectedDraftRevision: z.number().int().nonnegative(),
  expectedDisplayRevision: z.number().int().nonnegative(),
});
export const SeriesCommandSchema = z.discriminatedUnion("type", [
  SeriesRevisionSchema.extend({
    type: z.literal("start-series"),
    matchId: z.string().min(1).max(80),
  }),
  SeriesRevisionSchema.extend({
    type: z.literal("start-quick-series"),
    blueTeamId: z.string().min(1).max(80),
    redTeamId: z.string().min(1).max(80),
  }),
  SeriesRevisionSchema.extend({ type: z.literal("next-game") }),
  SeriesRevisionSchema.extend({ type: z.literal("complete-series") }),
]);
export type SeriesCommand = z.infer<typeof SeriesCommandSchema>;

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
  scoreboard: ScoreboardSettingsSchema,
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
    type: z.literal("activate-match"),
    blue: TeamSchema,
    red: TeamSchema,
  }),
  CommandBaseSchema.extend({
    type: z.literal("set-team"),
    side: SideSchema,
    team: TeamSchema,
  }),
  CommandBaseSchema.extend({ type: z.literal("start-timer") }),
  CommandBaseSchema.extend({ type: z.literal("pause-timer") }),
  CommandBaseSchema.extend({
    type: z.literal("set-scoreboard-score"),
    side: SideSchema,
    score: z.number().int().min(0).max(99),
  }),
  CommandBaseSchema.extend({ type: z.literal("reset-scoreboard") }),
  CommandBaseSchema.extend({
    type: z.literal("set-presentation"),
    presentation: PresentationSettingsSchema,
  }),
]);
export type DraftCommand = z.infer<typeof DraftCommandSchema>;

export const MatchActivationResultSchema = z.object({
  draft: DraftStateSchema,
  display: DisplayStateSchema,
});
export type MatchActivationResult = z.infer<typeof MatchActivationResultSchema>;

export const EventEnvelopeSchema = z.object({
  sequence: z.number().int().positive(),
  type: z.enum([
    "draft-snapshot",
    "draft-updated",
    "display-snapshot",
    "display-updated",
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
      durationSeconds: 50,
      remainingSeconds: 50,
      running: false,
      startedAt: null,
    },
    presentation: { voiceEnabled: false },
    scoreboard: { scores: { blue: 0, red: 0 } },
  };
}

const defaultLineup = (side: Side): MatchLineup =>
  (["exp", "jungle", "mid", "gold", "roam"] as const).map((role, index) => ({
    id: `${side}-${role}`,
    name: `Player ${index + 1}`,
    role,
    heroId: "",
  })) as MatchLineup;

const defaultManagedTeam = (side: Side): ManagedTeam => ({
  id: `${side}-team`,
  name: side === "blue" ? "Blue Team" : "Red Team",
  shortName: side === "blue" ? "BLUE" : "RED",
  logoUrl: "",
  starters: defaultLineup(side).map(({ id, name, role }) => ({
    id,
    name,
    role,
    photoUrl: "",
  })),
  substitutes: [],
});

export function createDefaultDisplayState(now = new Date()): DisplayState {
  return DisplayStateSchema.parse({
    revision: 0,
    updatedAt: now.toISOString(),
    event: {
      name: "MLBB Tournament",
      timezone: "Asia/Yangon",
    },
    scoreboard: {
      preset: "tournament",
      gameNumber: 1,
      bestOf: 3,
      stage: "Group Stage",
      round: "Round 1",
      frames: {
        blue: { x: 0, y: 360, width: 142, height: 430, rowGap: 4 },
        red: { x: 1792, y: 360, width: 128, height: 430, rowGap: 4 },
      },
    },
    teams: [defaultManagedTeam("blue"), defaultManagedTeam("red")],
    lineups: { blue: defaultLineup("blue"), red: defaultLineup("red") },
    rosters: {
      blue: defaultLineup("blue").map(({ id, name }) => ({ id, name })),
      red: defaultLineup("red").map(({ id, name }) => ({ id, name })),
    },
    schedule: [],
    activeMatchId: null,
    countdown: {
      durationSeconds: 600,
      remainingSeconds: 600,
      running: false,
      startedAt: null,
    },
    ticker: {
      enabled: false,
      messages: ["Welcome to the tournament"],
      activeIndex: 0,
      speedSeconds: 24,
    },
    rosterLoop: { holdSeconds: 8, transitionSeconds: 0.8 },
    cueRevision: 0,
  });
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
  next.timer =
    next.status === "complete"
      ? {
          durationSeconds: 50,
          remainingSeconds: 0,
          running: false,
          startedAt: null,
        }
      : {
          durationSeconds: 50,
          remainingSeconds: 50,
          running: true,
          startedAt: now.getTime(),
        };
  return DraftStateSchema.parse(next);
}
