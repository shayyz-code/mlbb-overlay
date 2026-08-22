export type DetectionKind = "draft-selection" | "turtle-kill" | "lord-kill";

export {
  DetectorProfileStore,
  describeEncodedImage,
  isAutomaticProfileReady,
  loadReferenceDescriptors,
  validateDetectorProfile,
} from "./profile";
export {
  decodeScreenshot,
  ObsDraftRecognitionLoop,
  type DraftCandidate,
  type DraftDetectionContext,
  type ScreenshotSource,
} from "./runtime";
export {
  classifyLogits,
  loadDetectorModelBundle,
  OnnxSlotClassifier,
  prepareClassifierInput,
  type ClassifierResult,
  type DetectorModelBundle,
} from "./model";

export interface VisualObservation<T = unknown> {
  key: string;
  kind: DetectionKind;
  confidence: number;
  observedAt: number;
  payload: T;
}

export interface DetectorProposal<T = unknown> {
  id: string;
  key: string;
  kind: DetectionKind;
  confidence: number;
  proposedAt: number;
  payload: T;
  evidenceFrames: number;
}

export interface RgbImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface ImageDescriptor {
  luminance: Float32Array;
  edges: Float32Array;
  histogram: Float32Array;
}

export interface ReferenceDescriptor {
  heroId: string;
  descriptor: ImageDescriptor;
}

export interface RankedMatch {
  heroId: string;
  confidence: number;
  runnerUpConfidence: number;
  margin: number;
}

function normalized(values: Float32Array): Float32Array {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let magnitude = 0;
  const centered = values.map((value) => {
    const result = value - mean;
    magnitude += result * result;
    return result;
  });
  const divisor = Math.sqrt(magnitude) || 1;
  return centered.map((value) => value / divisor);
}

export function describeImage(image: RgbImage): ImageDescriptor {
  if (image.width < 2 || image.height < 2)
    throw new Error("Descriptor images must be at least 2x2 pixels.");
  if (image.data.length !== image.width * image.height * 3)
    throw new Error("Descriptor images must contain packed RGB pixels.");
  const luminance = new Float32Array(image.width * image.height);
  const histogram = new Float32Array(24);
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 3;
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    luminance[index] = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const redBin = Math.min(7, Math.floor(red / 32));
    const greenBin = 8 + Math.min(7, Math.floor(green / 32));
    const blueBin = 16 + Math.min(7, Math.floor(blue / 32));
    histogram[redBin] = (histogram[redBin] ?? 0) + 1;
    histogram[greenBin] = (histogram[greenBin] ?? 0) + 1;
    histogram[blueBin] = (histogram[blueBin] ?? 0) + 1;
  }
  for (let index = 0; index < histogram.length; index += 1)
    histogram[index] = (histogram[index] ?? 0) / (luminance.length * 3);
  const edges = new Float32Array(luminance.length);
  for (let y = 0; y < image.height - 1; y += 1) {
    for (let x = 0; x < image.width - 1; x += 1) {
      const index = y * image.width + x;
      const dx = (luminance[index + 1] ?? 0) - (luminance[index] ?? 0);
      const dy =
        (luminance[index + image.width] ?? 0) - (luminance[index] ?? 0);
      edges[index] = Math.sqrt(dx * dx + dy * dy);
    }
  }
  return {
    luminance: normalized(luminance),
    edges: normalized(edges),
    histogram,
  };
}

function dot(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length)
    throw new Error("Descriptor vectors must have matching lengths.");
  let result = 0;
  for (let index = 0; index < left.length; index += 1)
    result += (left[index] ?? 0) * (right[index] ?? 0);
  return result;
}

function normalizedSimilarity(left: Float32Array, right: Float32Array): number {
  const leftEnergy = dot(left, left);
  const rightEnergy = dot(right, right);
  if (leftEnergy === 0 && rightEnergy === 0) return 1;
  if (leftEnergy === 0 || rightEnergy === 0) return 0.5;
  return (dot(left, right) + 1) / 2;
}

export function descriptorSimilarity(
  left: ImageDescriptor,
  right: ImageDescriptor,
  kind: "pick" | "ban" = "pick",
): number {
  const luminance = normalizedSimilarity(left.luminance, right.luminance);
  const edges = normalizedSimilarity(left.edges, right.edges);
  let histogram = 0;
  for (let index = 0; index < left.histogram.length; index += 1)
    histogram += Math.min(
      left.histogram[index] ?? 0,
      right.histogram[index] ?? 0,
    );
  const weights: [number, number, number] =
    kind === "ban" ? [0.6, 0.35, 0.05] : [0.55, 0.25, 0.2];
  return Math.max(
    0,
    Math.min(
      1,
      luminance * weights[0] + edges * weights[1] + histogram * weights[2],
    ),
  );
}

export function rankReferences(
  candidate: ImageDescriptor,
  references: ReferenceDescriptor[],
  kind: "pick" | "ban" = "pick",
): RankedMatch | null {
  const ranked = references
    .map((reference) => ({
      heroId: reference.heroId,
      confidence: descriptorSimilarity(candidate, reference.descriptor, kind),
    }))
    .sort((left, right) => right.confidence - left.confidence);
  const best = ranked[0];
  if (!best) return null;
  const runnerUpConfidence = ranked[1]?.confidence ?? 0;
  return {
    ...best,
    runnerUpConfidence,
    margin: Math.max(0, best.confidence - runnerUpConfidence),
  };
}

export interface SlotMatchObservation {
  observedAt: number;
  emptyConfidence: number;
  match: RankedMatch | null;
}

export interface SlotTransitionOptions extends ObservationGateOptions {
  emptyThreshold?: number;
  proposalThreshold?: number;
  proposalMargin?: number;
}

export class SlotTransitionGate {
  private armed = false;
  private readonly gate: ObservationGate;
  private readonly emptyThreshold: number;
  private readonly proposalThreshold: number;
  private readonly proposalMargin: number;

  constructor(options: SlotTransitionOptions = {}) {
    this.emptyThreshold = options.emptyThreshold ?? 0.98;
    this.proposalThreshold = options.proposalThreshold ?? 0.94;
    this.proposalMargin = options.proposalMargin ?? 0.015;
    this.gate = new ObservationGate(options);
  }

  get isArmed(): boolean {
    return this.armed;
  }

  observe(
    observation: SlotMatchObservation,
  ): DetectorProposal<{ heroId: string; runnerUpMargin: number }> | null {
    if (observation.emptyConfidence >= this.emptyThreshold) {
      this.armed = true;
      this.gate.reset();
      return null;
    }
    if (!this.armed || !observation.match) return null;
    const eligible =
      observation.match.confidence >= this.proposalThreshold &&
      observation.match.margin >= this.proposalMargin;
    const proposal = this.gate.observe({
      key: observation.match.heroId,
      kind: "draft-selection",
      confidence: eligible ? observation.match.confidence : 0,
      observedAt: observation.observedAt,
      payload: {
        heroId: observation.match.heroId,
        runnerUpMargin: observation.match.margin,
      },
    });
    if (proposal) this.armed = false;
    return proposal;
  }
}

export interface ObservationGateOptions {
  minimumConfidence?: number;
  requiredFrames?: number;
  maximumFrameGapMs?: number;
  cooldownMs?: number;
}

const defaults: Required<ObservationGateOptions> = {
  minimumConfidence: 0.98,
  requiredFrames: 3,
  maximumFrameGapMs: 750,
  cooldownMs: 5_000,
};

export class ObservationGate {
  readonly options: Required<ObservationGateOptions>;
  private candidate:
    | { key: string; count: number; lastSeenAt: number }
    | undefined;
  private readonly cooldowns = new Map<string, number>();

  constructor(options: ObservationGateOptions = {}) {
    this.options = { ...defaults, ...options };
    if (this.options.requiredFrames < 1)
      throw new Error("requiredFrames must be at least one.");
  }

  reset(): void {
    this.candidate = undefined;
  }

  observe<T>(observation: VisualObservation<T>): DetectorProposal<T> | null {
    if (observation.confidence < this.options.minimumConfidence) {
      this.candidate = undefined;
      return null;
    }

    const continues =
      this.candidate?.key === observation.key &&
      observation.observedAt >= this.candidate.lastSeenAt &&
      observation.observedAt - this.candidate.lastSeenAt <=
        this.options.maximumFrameGapMs;
    const candidate = continues
      ? {
          key: observation.key,
          count: (this.candidate?.count ?? 0) + 1,
          lastSeenAt: observation.observedAt,
        }
      : { key: observation.key, count: 1, lastSeenAt: observation.observedAt };
    this.candidate = candidate;

    if (candidate.count < this.options.requiredFrames) return null;
    const cooldownUntil = this.cooldowns.get(observation.key) ?? 0;
    this.candidate = undefined;
    if (observation.observedAt < cooldownUntil) return null;

    this.cooldowns.set(
      observation.key,
      observation.observedAt + this.options.cooldownMs,
    );
    return {
      id: crypto.randomUUID(),
      key: observation.key,
      kind: observation.kind,
      confidence: observation.confidence,
      proposedAt: observation.observedAt,
      payload: observation.payload,
      evidenceFrames: this.options.requiredFrames,
    };
  }
}

interface ObsHello {
  op: 0;
  d: {
    rpcVersion: number;
    authentication?: { challenge: string; salt: string };
  };
}

interface ObsResponse {
  op: 7;
  d: {
    requestId: string;
    requestStatus: { result: boolean; comment?: string };
    responseData?: { imageData?: string };
  };
}

export interface ObsScreenshotOptions {
  url?: string;
  password?: string;
  sourceName: string;
  width?: number;
  height?: number;
  quality?: number;
  imageFormat?: "jpg" | "png";
  timeoutMs?: number;
}

type PendingRequest = {
  resolve: (imageData: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

async function sha256Base64(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("base64");
}

export class ObsScreenshotSource {
  private socket: WebSocket | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private identified = false;

  constructor(readonly options: ObsScreenshotOptions) {}

  async connect(): Promise<void> {
    if (this.identified) return;
    const socket = new WebSocket(this.options.url ?? "ws://127.0.0.1:4455");
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("OBS connection timed out.")),
        this.options.timeoutMs ?? 5_000,
      );
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Unable to connect to OBS WebSocket."));
      });
      socket.addEventListener("message", (event) => {
        void this.handleMessage(socket, event, () => {
          clearTimeout(timeout);
          this.identified = true;
          resolve();
        }).catch((reason) => {
          clearTimeout(timeout);
          this.close();
          reject(
            reason instanceof Error
              ? reason
              : new Error("Invalid OBS WebSocket response."),
          );
        });
      });
      socket.addEventListener("close", () => this.close());
    });
  }

  async screenshot(): Promise<string> {
    if (!this.socket || !this.identified)
      throw new Error("Connect to OBS before requesting a screenshot.");
    const requestId = crypto.randomUUID();
    const result = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("OBS screenshot request timed out."));
      }, this.options.timeoutMs ?? 5_000);
      this.pending.set(requestId, { resolve, reject, timer });
    });
    this.socket.send(
      JSON.stringify({
        op: 6,
        d: {
          requestType: "GetSourceScreenshot",
          requestId,
          requestData: {
            sourceName: this.options.sourceName,
            imageFormat: this.options.imageFormat ?? "jpg",
            ...(this.options.width ? { imageWidth: this.options.width } : {}),
            ...(this.options.height
              ? { imageHeight: this.options.height }
              : {}),
            imageCompressionQuality: this.options.quality ?? 80,
          },
        },
      }),
    );
    return result;
  }

  close(): void {
    this.identified = false;
    this.socket?.close();
    this.socket = undefined;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("OBS connection closed."));
    }
    this.pending.clear();
  }

  private async authentication(authentication: {
    challenge: string;
    salt: string;
  }): Promise<string> {
    if (!this.options.password)
      throw new Error("OBS requires a WebSocket password.");
    const secret = await sha256Base64(
      this.options.password + authentication.salt,
    );
    return sha256Base64(secret + authentication.challenge);
  }

  private async handleMessage(
    socket: WebSocket,
    event: MessageEvent,
    onIdentified: () => void,
  ): Promise<void> {
    const message = JSON.parse(String(event.data)) as
      | ObsHello
      | ObsResponse
      | { op: number; d: Record<string, unknown> };
    if (message.op === 0) {
      const hello = message as ObsHello;
      const authentication = hello.d.authentication
        ? await this.authentication(hello.d.authentication)
        : undefined;
      socket.send(
        JSON.stringify({
          op: 1,
          d: {
            rpcVersion: 1,
            eventSubscriptions: 0,
            ...(authentication ? { authentication } : {}),
          },
        }),
      );
    } else if (message.op === 2) {
      onIdentified();
    } else if (message.op === 7) {
      this.handleResponse(message as ObsResponse);
    }
  }

  private handleResponse(message: ObsResponse): void {
    const request = this.pending.get(message.d.requestId);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(message.d.requestId);
    const imageData = message.d.responseData?.imageData;
    if (!message.d.requestStatus.result || !imageData) {
      request.reject(
        new Error(message.d.requestStatus.comment ?? "OBS screenshot failed."),
      );
      return;
    }
    request.resolve(imageData);
  }
}
