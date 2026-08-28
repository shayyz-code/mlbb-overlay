import { describe, expect, test } from "bun:test";
import {
  advanceRosterFrame,
  type RosterFrame,
} from "./roster-loop";

describe("roster loop", () => {
  test("cycles every team in saved order", () => {
    let frame: RosterFrame = { phase: "entering", teamIndex: 0 };
    const visited = [frame];
    for (let index = 0; index < 8; index += 1) {
      frame = advanceRosterFrame(frame, 2);
      visited.push(frame);
    }
    expect(visited).toEqual([
      { phase: "entering", teamIndex: 0 },
      { phase: "visible", teamIndex: 0 },
      { phase: "exiting", teamIndex: 0 },
      { phase: "gap", teamIndex: 0 },
      { phase: "entering", teamIndex: 1 },
      { phase: "visible", teamIndex: 1 },
      { phase: "exiting", teamIndex: 1 },
      { phase: "gap", teamIndex: 1 },
      { phase: "entering", teamIndex: 0 },
    ]);
  });

  test("repeats a single team and handles an empty directory", () => {
    expect(advanceRosterFrame({ phase: "gap", teamIndex: 0 }, 1)).toEqual({
      phase: "entering",
      teamIndex: 0,
    });
    expect(advanceRosterFrame({ phase: "visible", teamIndex: 3 }, 0)).toEqual({
      phase: "gap",
      teamIndex: 0,
    });
  });

});
