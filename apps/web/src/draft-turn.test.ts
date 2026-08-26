import { expect, test } from "bun:test";
import { STANDARD_TEN_BAN_FORMAT } from "@shayyz/contracts";
import { operatorPhaseLabel } from "./draft-turn";

test("labels single-action and consecutive tournament turns", () => {
  expect(operatorPhaseLabel(STANDARD_TEN_BAN_FORMAT, 0)).toBe("BLUE BAN 1");
  expect(operatorPhaseLabel(STANDARD_TEN_BAN_FORMAT, 7)).toBe(
    "RED PICKS 1-2 · 1 OF 2",
  );
  expect(operatorPhaseLabel(STANDARD_TEN_BAN_FORMAT, 8)).toBe(
    "RED PICKS 1-2 · 2 OF 2",
  );
  expect(operatorPhaseLabel(STANDARD_TEN_BAN_FORMAT, 17)).toBe(
    "BLUE PICKS 4-5 · 1 OF 2",
  );
  expect(operatorPhaseLabel(STANDARD_TEN_BAN_FORMAT, 20)).toBe(
    "DRAFT COMPLETE",
  );
});
