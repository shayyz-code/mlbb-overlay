import type { DetectorCoordinator } from "./detector";

export interface RecognitionLoop {
  start(): Promise<void>;
  stop(): void;
}

export function validateObsUrl(value: string): string {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!loopback || !["ws:", "wss:"].includes(url.protocol))
    throw new Error("OBS WebSocket must use a loopback ws:// or wss:// URL.");
  return url.toString();
}

export class DetectorLifecycle {
  private loop: RecognitionLoop | null = null;

  constructor(
    private readonly coordinator: DetectorCoordinator,
    private readonly createLoop: () => Promise<RecognitionLoop>,
  ) {}

  async start(): Promise<void> {
    const status = this.coordinator.status();
    if (status.mode === "off")
      throw new Error("Choose a detector mode before starting.");
    if (!status.profileConfigured || status.referenceCount === 0)
      throw new Error("A profile and local hero references are required.");
    try {
      this.loop ??= await this.createLoop();
      await this.loop.start();
      this.coordinator.setError(null);
      this.coordinator.setRunning(true);
    } catch (error) {
      const result =
        error instanceof Error ? error : new Error("Unable to start detector.");
      this.coordinator.setError(result);
      this.coordinator.setRunning(false);
      throw result;
    }
  }

  stop(): void {
    this.loop?.stop();
    this.loop = null;
    this.coordinator.setRunning(false);
  }

  report(error: Error): void {
    this.coordinator.setError(error);
  }
}
