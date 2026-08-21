import type { DraftState } from "@shayyz/contracts";
import { selectedHeroIds } from "@shayyz/contracts";

export function newestAddedHeroId(
  previous: DraftState,
  next: DraftState,
): string | undefined {
  const previousIds = selectedHeroIds(previous);
  let newest: { heroId: string; phaseIndex: number } | undefined;
  for (const side of ["blue", "red"] as const) {
    for (const kind of ["bans", "picks"] as const) {
      for (const selection of next.selections[side][kind]) {
        if (
          selection &&
          !previousIds.has(selection.heroId) &&
          (!newest || selection.phaseIndex > newest.phaseIndex)
        ) {
          newest = selection;
        }
      }
    }
  }
  return newest?.heroId;
}
