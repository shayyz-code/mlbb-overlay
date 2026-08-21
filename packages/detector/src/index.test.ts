import { describe, expect, test } from "bun:test";
import { ObservationGate, type VisualObservation } from ".";

const observation = (
  key: string,
  observedAt: number,
  confidence = 0.99,
): VisualObservation<{ heroId: string }> => ({
  key,
  kind: "draft-selection",
  confidence,
  observedAt,
  payload: { heroId: key },
});

describe("ObservationGate", () => {
  test("requires repeated high-confidence evidence", () => {
    const gate = new ObservationGate();

    expect(gate.observe(observation("miya", 0))).toBeNull();
    expect(gate.observe(observation("miya", 200))).toBeNull();
    expect(gate.observe(observation("miya", 400))).toMatchObject({
      key: "miya",
      evidenceFrames: 3,
      payload: { heroId: "miya" },
    });
  });

  test("rejects low confidence and changing candidates", () => {
    const gate = new ObservationGate();

    gate.observe(observation("miya", 0));
    expect(gate.observe(observation("miya", 200, 0.8))).toBeNull();
    gate.observe(observation("layla", 400));
    expect(gate.observe(observation("miya", 600))).toBeNull();
    expect(gate.observe(observation("miya", 800))).toBeNull();
  });

  test("suppresses repeated proposals during cooldown", () => {
    const gate = new ObservationGate({ cooldownMs: 5_000 });
    for (const time of [0, 100, 200]) gate.observe(observation("miya", time));

    expect(gate.observe(observation("miya", 300))).toBeNull();
    expect(gate.observe(observation("miya", 400))).toBeNull();
    expect(gate.observe(observation("miya", 500))).toBeNull();
    for (const time of [5_300, 5_400])
      expect(gate.observe(observation("miya", time))).toBeNull();
    expect(gate.observe(observation("miya", 5_500))).not.toBeNull();
  });
});
