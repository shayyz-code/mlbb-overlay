import { expect, test } from "bun:test";
import { applySelection, createDefaultDraftState } from "@shayyz/contracts";
import { newestAddedHeroId } from "./voice";

test("finds only the newest hero added between draft states", () => {
  const initial = createDefaultDraftState();
  const first = applySelection(initial, { heroId: "miya", source: "manual" });
  const second = applySelection(first, { heroId: "layla", source: "manual" });
  expect(newestAddedHeroId(initial, second)).toBe("layla");
  expect(newestAddedHeroId(second, second)).toBeUndefined();
});
