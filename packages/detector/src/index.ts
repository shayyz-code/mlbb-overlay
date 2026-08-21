export type DetectionKind = "draft-selection" | "turtle-kill" | "lord-kill";

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
            imageFormat: "jpg",
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
