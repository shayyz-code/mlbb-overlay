import {
  AssetPackStatusSchema,
  DraftStateSchema,
  EventEnvelopeSchema,
  HeroSchema,
  type AssetPackStatus,
  type DraftCommand,
  type DraftState,
  type Hero,
} from "@shayyz/contracts";

const HeroesSchema = HeroSchema.array();

export async function fetchAssetStatus(): Promise<AssetPackStatus> {
  const response = await fetch("/api/v1/assets/status");
  if (!response.ok) throw new Error("Unable to load private asset status.");
  return AssetPackStatusSchema.parse(await response.json());
}

export async function fetchDraft(): Promise<DraftState> {
  const response = await fetch("/api/v1/draft");
  if (!response.ok) throw new Error("Unable to load draft state.");
  return DraftStateSchema.parse(await response.json());
}

export async function fetchHeroes(): Promise<Hero[]> {
  const response = await fetch("/api/v1/heroes");
  if (!response.ok) throw new Error("Unable to load hero catalog.");
  return HeroesSchema.parse(await response.json());
}

export async function sendCommand(
  command: DraftCommand,
  token: string,
): Promise<DraftState> {
  const response = await fetch("/api/v1/draft/commands", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(command),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Draft command failed.");
  return DraftStateSchema.parse(body);
}

export function subscribeToDraft(
  onState: (state: DraftState, source: "snapshot" | "update") => void,
  onStatus: (connected: boolean) => void,
): () => void {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  let stopped = false;
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;

  const connect = () => {
    socket = new WebSocket(
      `${protocol}//${window.location.host}/api/v1/events`,
    );
    socket.addEventListener("open", () => onStatus(true));
    socket.addEventListener("message", (event) => {
      const envelope = EventEnvelopeSchema.safeParse(
        JSON.parse(String(event.data)),
      );
      if (
        !envelope.success ||
        !["draft-snapshot", "draft-updated"].includes(envelope.data.type)
      )
        return;
      const state = DraftStateSchema.safeParse(envelope.data.data);
      if (state.success)
        onState(
          state.data,
          envelope.data.type === "draft-updated" ? "update" : "snapshot",
        );
    });
    socket.addEventListener("close", () => {
      onStatus(false);
      if (!stopped) reconnectTimer = window.setTimeout(connect, 1500);
    });
  };

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}
