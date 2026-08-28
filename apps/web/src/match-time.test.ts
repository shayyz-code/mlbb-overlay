import { expect, test } from "bun:test";
import {
  formatMatchTime,
  matchTimeFromInput,
  matchTimeInputValue,
} from "./match-time";

test("preserves the organizer's wall-clock match time", () => {
  const saved = matchTimeFromInput("2026-08-28T19:30");
  expect(saved).toBe("2026-08-28T19:30:00.000Z");
  expect(matchTimeInputValue(saved)).toBe("2026-08-28T19:30");
  expect(formatMatchTime(saved, "TBD")).toBe("07:30 PM");
});

test("handles empty and boundary match times without timezone conversion", () => {
  expect(matchTimeFromInput("")).toBeNull();
  expect(matchTimeInputValue(null)).toBe("");
  expect(formatMatchTime(null, "UP NEXT")).toBe("UP NEXT");
  expect(formatMatchTime("2026-08-28T00:05:00.000Z", "TBD")).toBe("12:05 AM");
  expect(formatMatchTime("2026-08-28T12:00:00.000Z", "TBD")).toBe("12:00 PM");
});
