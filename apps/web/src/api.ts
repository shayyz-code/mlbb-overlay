import {
  type ActivateMatchCommand,
  type AssetPackStatus,
  AssetPackStatusSchema,
  DetectorCalibrationResultSchema,
  type DetectorCalibrationSave,
  DetectorFrameSchema,
  type DetectorMode,
  type DetectorProposal,
  DetectorProposalSchema,
  type DetectorStatus,
  DetectorStatusSchema,
  type DisplayCommand,
  type DisplayState,
  DisplayStateSchema,
  type DraftCommand,
  type DraftState,
  DraftStateSchema,
  EventEnvelopeSchema,
  type Hero,
  HeroSchema,
  type MatchActivationResult,
  MatchActivationResultSchema,
  type TeamLogoUploadResult,
  TeamLogoUploadResultSchema,
} from "@shayyz/contracts";

const HeroesSchema = HeroSchema.array();

async function detectorRequest(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<DetectorStatus> {
  const response = await fetch(`/api/v1/detector/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Detector request failed.");
  return DetectorStatusSchema.parse(body);
}

export async function fetchDetectorStatus(): Promise<DetectorStatus> {
  const response = await fetch("/api/v1/detector/status");
  if (!response.ok) throw new Error("Unable to load detector status.");
  return DetectorStatusSchema.parse(await response.json());
}

export function setDetectorMode(
  mode: DetectorMode,
  token: string,
): Promise<DetectorStatus> {
  return detectorRequest("mode", token, {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
}

export function setDetectorRunning(
  running: boolean,
  token: string,
): Promise<DetectorStatus> {
  return detectorRequest(running ? "start" : "stop", token, {
    method: "POST",
  });
}

export async function reviewDetectorProposal(
  id: string,
  action: "accept" | "reject",
  token: string,
): Promise<DetectorProposal> {
  const response = await fetch(
    `/api/v1/detector/proposals/${encodeURIComponent(id)}/${action}`,
    {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Proposal review failed.");
  return DetectorProposalSchema.parse(body);
}

export async function captureDetectorFrame(
  sourceName: string,
  token: string,
): Promise<string> {
  const response = await fetch("/api/v1/detector/calibration/frame", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sourceName }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Frame capture failed.");
  return DetectorFrameSchema.parse(body).imageData;
}

export async function saveDetectorCalibration(
  input: DetectorCalibrationSave,
  token: string,
): Promise<true> {
  const response = await fetch("/api/v1/detector/profile", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Calibration save failed.");
  return DetectorCalibrationResultSchema.parse(body).restartRequired;
}

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

export async function fetchDisplay(): Promise<DisplayState> {
  const response = await fetch("/api/v1/display");
  if (!response.ok) throw new Error("Unable to load display state.");
  return DisplayStateSchema.parse(await response.json());
}

export async function sendDisplayCommand(
  command: DisplayCommand,
  token: string,
): Promise<DisplayState> {
  const response = await fetch("/api/v1/display/commands", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(command),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Display command failed.");
  return DisplayStateSchema.parse(body);
}

export async function activateMatch(
  command: ActivateMatchCommand,
  token: string,
): Promise<MatchActivationResult> {
  const response = await fetch("/api/v1/matches/activate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(command),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Match activation failed.");
  return MatchActivationResultSchema.parse(body);
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

export async function uploadTeamLogo(
  teamId: string,
  file: File,
  token: string,
): Promise<TeamLogoUploadResult> {
  const form = new FormData();
  form.set("logo", file);
  const response = await fetch(
    `/api/v1/team-logos/${encodeURIComponent(teamId)}`,
    {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Logo upload failed.");
  return TeamLogoUploadResultSchema.parse(body);
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

export function subscribeToDisplay(
  onState: (state: DisplayState) => void,
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
        !["display-snapshot", "display-updated"].includes(envelope.data.type)
      )
        return;
      const state = DisplayStateSchema.safeParse(envelope.data.data);
      if (state.success) onState(state.data);
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
