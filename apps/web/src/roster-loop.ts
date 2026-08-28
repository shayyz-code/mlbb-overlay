export type RosterPhase = "entering" | "visible" | "exiting" | "gap";

export type RosterFrame = {
  phase: RosterPhase;
  teamIndex: number;
};

export function advanceRosterFrame(
  frame: RosterFrame,
  teamCount: number,
): RosterFrame {
  if (teamCount === 0) return { phase: "gap", teamIndex: 0 };
  if (frame.phase === "entering") return { ...frame, phase: "visible" };
  if (frame.phase === "visible") return { ...frame, phase: "exiting" };
  if (frame.phase === "exiting") return { ...frame, phase: "gap" };
  return {
    phase: "entering",
    teamIndex: (frame.teamIndex + 1) % teamCount,
  };
}

export function rosterPhaseDuration(
  phase: RosterPhase,
  holdSeconds: number,
  transitionSeconds: number,
) {
  if (phase === "visible") return holdSeconds * 1000;
  if (phase === "gap") return 500;
  return transitionSeconds * 1000;
}
