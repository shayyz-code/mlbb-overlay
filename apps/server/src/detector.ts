import {
  DetectorProposalSchema,
  type DetectorMode,
  type DetectorProfile,
  type DetectorProposal,
  type DetectorStatus,
  currentPhase,
} from "@shayyz/contracts";
import type { DraftCandidate } from "@shayyz/detector";
import type { DraftStore } from "./store";

type EventSink = (
  type: "detector-proposal" | "draft-updated",
  data: unknown,
) => void;

export class DetectorCoordinator {
  private mode: DetectorMode = "off";
  private running = false;
  private lastError: string | null = null;
  private pending: DetectorProposal | null = null;
  private sink: EventSink = () => undefined;

  constructor(
    private readonly options: {
      store: DraftStore;
      profile: DetectorProfile | null;
      referenceCount: number;
      automaticReady: boolean;
    },
  ) {}

  setEventSink(sink: EventSink): void {
    this.sink = sink;
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  setError(error: Error | null): void {
    this.lastError = error?.message ?? null;
  }

  status(): DetectorStatus {
    this.supersedeStale();
    return {
      mode: this.mode,
      running: this.running,
      profileConfigured: this.options.profile !== null,
      referenceCount: this.options.referenceCount,
      expectedReferenceCount: 133,
      automaticReady: this.options.automaticReady,
      pendingProposal: this.pending,
      lastError: this.lastError,
    };
  }

  setMode(mode: DetectorMode): DetectorStatus {
    this.mode = mode;
    if (mode === "off") {
      this.running = false;
      this.updatePending("superseded");
    }
    return this.status();
  }

  async observe(candidate: DraftCandidate): Promise<DetectorProposal | null> {
    if (this.mode === "off" || !this.isCurrent(candidate)) return null;
    this.updatePending("superseded");
    const proposal = DetectorProposalSchema.parse({
      id: crypto.randomUUID(),
      ...candidate,
      proposedAt: new Date(candidate.observedAt).toISOString(),
      status: "pending",
    });
    this.pending = proposal;

    const thresholds = this.options.profile?.thresholds;
    const automatic =
      this.mode === "confidence-tiered" &&
      this.options.automaticReady &&
      thresholds !== undefined &&
      candidate.confidence >= thresholds.automatic &&
      candidate.runnerUpMargin >= thresholds.automaticMargin;
    if (automatic) return this.apply(proposal, "auto-applied");
    this.sink("detector-proposal", proposal);
    return proposal;
  }

  async accept(id: string): Promise<DetectorProposal> {
    const proposal = this.requirePending(id);
    if (!this.isCurrent(proposal)) {
      this.updatePending("superseded");
      throw new Error("The detector proposal is stale.");
    }
    return this.apply(proposal, "accepted");
  }

  reject(id: string): DetectorProposal {
    const proposal = this.requirePending(id);
    this.updatePending("rejected");
    return { ...proposal, status: "rejected" };
  }

  private async apply(
    proposal: DetectorProposal,
    status: "accepted" | "auto-applied",
  ): Promise<DetectorProposal> {
    const state = await this.options.store.dispatch({
      type: "select-hero",
      expectedRevision: proposal.draftRevision,
      heroId: proposal.heroId,
      source: "detector",
      confidence: proposal.confidence,
    });
    const applied = { ...proposal, status } satisfies DetectorProposal;
    this.pending = null;
    this.sink("detector-proposal", applied);
    this.sink("draft-updated", state);
    return applied;
  }

  private requirePending(id: string): DetectorProposal {
    this.supersedeStale();
    if (!this.pending || this.pending.id !== id)
      throw new Error("The detector proposal is not pending.");
    return this.pending;
  }

  private isCurrent(
    candidate: Pick<
      DraftCandidate,
      "draftRevision" | "phaseIndex" | "side" | "kind" | "slot"
    >,
  ): boolean {
    const state = this.options.store.state;
    const phase = currentPhase(state);
    return (
      state.revision === candidate.draftRevision &&
      state.phaseIndex === candidate.phaseIndex &&
      phase !== null &&
      phase.side === candidate.side &&
      phase.kind === candidate.kind &&
      phase.slot === candidate.slot
    );
  }

  private supersedeStale(): void {
    if (this.pending && !this.isCurrent(this.pending))
      this.updatePending("superseded");
  }

  private updatePending(status: "rejected" | "superseded"): void {
    if (!this.pending) return;
    const updated = { ...this.pending, status } satisfies DetectorProposal;
    this.pending = null;
    this.sink("detector-proposal", updated);
  }
}
