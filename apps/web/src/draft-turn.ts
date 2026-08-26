import type { DraftFormat } from "@shayyz/contracts";

function belongsToSameTurn(
  format: DraftFormat,
  leftIndex: number,
  rightIndex: number,
): boolean {
  const left = format.phases[leftIndex];
  const right = format.phases[rightIndex];
  return left?.side === right?.side && left?.kind === right?.kind;
}

export function operatorPhaseLabel(
  format: DraftFormat,
  phaseIndex: number,
): string {
  const phase = format.phases[phaseIndex];
  if (!phase) return "DRAFT COMPLETE";

  let firstIndex = phaseIndex;
  while (belongsToSameTurn(format, firstIndex - 1, phaseIndex)) {
    firstIndex -= 1;
  }

  let lastIndex = phaseIndex;
  while (belongsToSameTurn(format, phaseIndex, lastIndex + 1)) {
    lastIndex += 1;
  }

  const turnLength = lastIndex - firstIndex + 1;
  if (turnLength === 1) {
    return `${phase.side.toUpperCase()} ${phase.kind.toUpperCase()} ${phase.slot + 1}`;
  }

  const firstSlot = format.phases[firstIndex]?.slot ?? phase.slot;
  const lastSlot = format.phases[lastIndex]?.slot ?? phase.slot;
  const position = phaseIndex - firstIndex + 1;
  return `${phase.side.toUpperCase()} ${phase.kind.toUpperCase()}S ${firstSlot + 1}-${lastSlot + 1} · ${position} OF ${turnLength}`;
}
