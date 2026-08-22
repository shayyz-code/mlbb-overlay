import { describe, expect, test } from "bun:test";
import {
  describeImage,
  descriptorSimilarity,
  ObservationGate,
  rankReferences,
  type RgbImage,
  SlotTransitionGate,
  type VisualObservation,
} from ".";

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

function image(colors: number[][]): RgbImage {
  return {
    width: 2,
    height: 2,
    data: Uint8Array.from(colors.flat()),
  };
}

describe("draft reference descriptors", () => {
  const miya = image([
    [30, 80, 220],
    [60, 110, 240],
    [20, 40, 100],
    [200, 180, 120],
  ]);
  const layla = image([
    [200, 40, 80],
    [240, 90, 120],
    [80, 20, 40],
    [100, 180, 200],
  ]);

  test("ranks the matching hero above a different reference", () => {
    const candidate = describeImage(miya);
    const result = rankReferences(candidate, [
      { heroId: "layla", descriptor: describeImage(layla) },
      { heroId: "miya", descriptor: describeImage(miya) },
    ]);

    expect(result?.heroId).toBe("miya");
    expect(result?.confidence).toBeCloseTo(1);
    expect(result?.margin).toBeGreaterThan(0);
  });

  test("reduces color influence for ban treatments", () => {
    const grayscale = image([
      [72, 72, 72],
      [106, 106, 106],
      [40, 40, 40],
      [181, 181, 181],
    ]);
    const reference = describeImage(miya);
    const candidate = describeImage(grayscale);

    expect(descriptorSimilarity(candidate, reference, "ban")).toBeGreaterThan(
      descriptorSimilarity(candidate, reference, "pick"),
    );
  });

  test("rejects malformed packed pixels", () => {
    expect(() =>
      describeImage({ width: 2, height: 2, data: new Uint8Array(3) }),
    ).toThrow("packed RGB");
  });
});

test("slot transitions require an empty slot before stable recognition", () => {
  const gate = new SlotTransitionGate();
  const filled = (observedAt: number) => ({
    observedAt,
    emptyConfidence: 0.1,
    match: {
      heroId: "miya",
      confidence: 0.99,
      runnerUpConfidence: 0.8,
      margin: 0.19,
    },
  });

  for (const time of [0, 200, 400]) expect(gate.observe(filled(time))).toBeNull();
  expect(gate.isArmed).toBe(false);
  expect(
    gate.observe({ observedAt: 600, emptyConfidence: 0.99, match: null }),
  ).toBeNull();
  expect(gate.isArmed).toBe(true);
  expect(gate.observe(filled(800))).toBeNull();
  expect(gate.observe(filled(1_000))).toBeNull();
  expect(gate.observe(filled(1_200)))?.toMatchObject({
    payload: { heroId: "miya", runnerUpMargin: 0.19 },
  });
  expect(gate.isArmed).toBe(false);
});
