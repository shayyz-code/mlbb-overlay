import { describe, expect, test } from "bun:test";
import { parseTickerMessages } from "./TickerMessagesInput";

describe("parseTickerMessages", () => {
  test("keeps each non-empty trimmed line as a message", () => {
    expect(parseTickerMessages(" First update \n\nSecond update\n")).toEqual([
      "First update",
      "Second update",
    ]);
  });

  test("limits ticker input to twenty messages", () => {
    const input = Array.from(
      { length: 21 },
      (_, index) => `Update ${index + 1}`,
    ).join("\n");

    expect(parseTickerMessages(input)).toHaveLength(20);
    expect(parseTickerMessages(input).at(-1)).toBe("Update 20");
  });
});
