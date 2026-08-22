import type {
  DetectorProfile,
  DraftPhase,
  SelectionKind,
} from "@shayyz/contracts";
import {
  descriptorSimilarity,
  rankReferences,
  SlotTransitionGate,
  type ImageDescriptor,
  type ReferenceDescriptor,
} from ".";
import { describeEncodedImage } from "./profile";

export interface ScreenshotSource {
  connect(): Promise<void>;
  screenshot(): Promise<string>;
  close(): void;
}

export interface DraftDetectionContext {
  revision: number;
  phaseIndex: number;
  phase: DraftPhase | null;
  usedHeroIds: string[];
}

export interface DraftCandidate {
  heroId: string;
  side: DraftPhase["side"];
  kind: SelectionKind;
  slot: number;
  phaseIndex: number;
  draftRevision: number;
  confidence: number;
  runnerUpMargin: number;
  evidenceFrames: number;
  observedAt: number;
}

type EmptyDescriptors = Map<string, ImageDescriptor>;

function slotKey(phase: DraftPhase): string {
  return `${phase.side}:${phase.kind}:${phase.slot}`;
}

export function decodeScreenshot(dataUri: string): Uint8Array {
  const match = dataUri.match(/^data:image\/(?:jpeg|png);base64,(.+)$/s);
  if (!match?.[1]) throw new Error("OBS returned an invalid screenshot.");
  return new Uint8Array(Buffer.from(match[1], "base64"));
}

export class ObsDraftRecognitionLoop {
  private readonly emptyDescriptors: EmptyDescriptors = new Map();
  private gate: SlotTransitionGate | undefined;
  private contextKey: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(
    private readonly options: {
      source: ScreenshotSource;
      profile: DetectorProfile;
      references: ReferenceDescriptor[];
      emptyFrame: Uint8Array;
      context: () => DraftDetectionContext;
      candidate: (candidate: DraftCandidate) => void | Promise<void>;
      intervalMs?: number;
      onError?: (error: Error) => void;
    },
  ) {}

  async initialize(): Promise<void> {
    await this.options.source.connect();
    for (const slot of this.options.profile.slots) {
      this.emptyDescriptors.set(
        `${slot.side}:${slot.kind}:${slot.slot}`,
        await describeEncodedImage(this.options.emptyFrame, slot.rect),
      );
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.initialize();
    this.running = true;
    void this.runLoop();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.options.source.close();
  }

  async sampleOnce(observedAt = Date.now()): Promise<void> {
    const context = this.options.context();
    if (!context.phase) return;
    const key = `${context.revision}:${context.phaseIndex}:${slotKey(context.phase)}`;
    if (key !== this.contextKey) {
      this.contextKey = key;
      this.gate = new SlotTransitionGate({
        emptyThreshold: this.options.profile.thresholds.empty,
        proposalThreshold: this.options.profile.thresholds.proposal,
        proposalMargin: this.options.profile.thresholds.proposalMargin,
        minimumConfidence: this.options.profile.thresholds.proposal,
      });
    }
    const slot = this.options.profile.slots.find(
      (item) => slotKey(item) === slotKey(context.phase as DraftPhase),
    );
    const empty = this.emptyDescriptors.get(slotKey(context.phase));
    if (!slot || !empty) throw new Error("The active draft slot is not calibrated.");
    const screenshot = decodeScreenshot(await this.options.source.screenshot());
    const descriptor = await describeEncodedImage(screenshot, slot.rect);
    const used = new Set(context.usedHeroIds);
    const match = rankReferences(
      descriptor,
      this.options.references.filter(({ heroId }) => !used.has(heroId)),
      context.phase.kind,
    );
    const proposal = this.gate?.observe({
      observedAt,
      emptyConfidence: descriptorSimilarity(descriptor, empty, context.phase.kind),
      match,
    });
    if (!proposal || !match) return;
    await this.options.candidate({
      heroId: match.heroId,
      side: context.phase.side,
      kind: context.phase.kind,
      slot: context.phase.slot,
      phaseIndex: context.phaseIndex,
      draftRevision: context.revision,
      confidence: match.confidence,
      runnerUpMargin: match.margin,
      evidenceFrames: proposal.evidenceFrames,
      observedAt,
    });
  }

  private async runLoop(): Promise<void> {
    try {
      await this.sampleOnce();
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error("Detector frame failed."),
      );
    } finally {
      if (this.running)
        this.timer = setTimeout(
          () => void this.runLoop(),
          this.options.intervalMs ?? 250,
        );
    }
  }
}
