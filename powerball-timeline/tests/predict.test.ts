import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectLine, type Signal } from "../src/lib/predict";
import type { Draw } from "../src/types";

function dateAt(index: number): string {
  const day = new Date(Date.UTC(2020, 0, 1 + index));
  return day.toISOString().slice(0, 10);
}

function series(whiteFor: (index: number) => number[]): Draw[] {
  return Array.from({ length: 40 }, (_, index) => ({
    date: dateAt(index),
    white: whiteFor(index),
    powerball: 1,
  }));
}

const baseDraws = series(() => [40, 41, 42, 43, 44]);

describe("deterministic line selection", () => {
  it("returns the same line for the same history and target", () => {
    const first = selectLine(baseDraws, "2026-10-03");
    const second = selectLine(baseDraws, "2026-10-03");
    expect(second).toEqual(first);
    expect(first.white).toHaveLength(5);
    expect(new Set(first.white.map((pick) => pick.number)).size).toBe(5);
    expect(first.white.map((pick) => pick.number)).toEqual([1, 2, 40, 41, 42]);
    expect(first.powerball.number).toBe(1);
    expect(first.powerball.signal).toBe("frequency");
  });

  it("keeps the numbers when only the target drawing changes", () => {
    const saturday = selectLine(baseDraws, "2026-10-03");
    const monday = selectLine(baseDraws, "2026-10-05");
    expect(monday.white.map((pick) => pick.number)).toEqual(saturday.white.map((pick) => pick.number));
    expect(monday.powerball.number).toBe(saturday.powerball.number);
    expect(monday.targetDrawDate).toBe("2026-10-05");
    expect(saturday.targetDrawDate).toBe("2026-10-03");
  });

  it("does not depend on the order of the history", () => {
    const reversed = [...baseDraws].reverse();
    expect(selectLine(reversed, "2026-10-03")).toEqual(selectLine(baseDraws, "2026-10-03"));
  });

  it("changes the line when a new drawing is added", () => {
    const extended = [
      ...baseDraws,
      { date: "2020-02-20", white: [1, 41, 42, 43, 44], powerball: 1 },
    ];
    const next = selectLine(extended, "2026-10-05");
    expect(next.white.map((pick) => pick.number)).not.toEqual([1, 2, 40, 41, 42]);
  });

  it("fills each signal from the strongest remaining number, breaking ties low", () => {
    const line = selectLine(baseDraws, "2026-10-03");
    const bySignal = new Map<Signal, number[]>();
    for (const pick of line.white) {
      const numbers = bySignal.get(pick.signal) ?? [];
      numbers.push(pick.number);
      bySignal.set(pick.signal, numbers);
    }
    expect(bySignal.get("frequency")).toEqual([40, 42]);
    expect(bySignal.get("gap")).toEqual([1, 2]);
    expect(bySignal.get("recent")).toEqual([41]);
  });

  it("writes a plain-language reason for the signal that selected each number", () => {
    const line = selectLine(baseDraws, "2026-10-03");
    const gap = line.white.find((pick) => pick.number === 1);
    const frequency = line.white.find((pick) => pick.number === 40);
    const recent = line.white.find((pick) => pick.number === 41);
    expect(gap?.reason.startsWith("Gap since it last hit:")).toBe(true);
    expect(gap?.reason).toContain("has not appeared");
    expect(frequency?.reason.startsWith("Long-run frequency:")).toBe(true);
    expect(frequency?.reason).toContain("40");
    expect(recent?.reason.startsWith("Recent window:")).toBe(true);
    expect(line.powerball.reason.startsWith("Long-run frequency:")).toBe(true);
    for (const pick of [...line.white, line.powerball]) {
      expect(pick.reason.length).toBeGreaterThan(40);
      expect(pick.number).toBeGreaterThan(0);
    }
  });

  it("selects one stable line from the bundled official history", () => {
    const bundled = JSON.parse(
      readFileSync(new URL("../src/data/bundled-draws.json", import.meta.url), "utf8"),
    ) as { draws: Draw[] };
    const first = selectLine(bundled.draws, "2026-10-03");
    const second = selectLine(bundled.draws, "2026-10-03");
    expect(second).toEqual(first);
    expect(first.white.map((pick) => pick.number)).toEqual([1, 21, 51, 58, 61]);
    expect(first.powerball.number).toBe(19);
    expect(first.white.every((pick) => pick.number >= 1 && pick.number <= 69)).toBe(true);
    expect(first.powerball.number).toBeGreaterThanOrEqual(1);
    expect(first.powerball.number).toBeLessThanOrEqual(26);

    const reasonFor = (number: number) => first.white.find((pick) => pick.number === number)?.reason ?? "";
    expect(reasonFor(21)).toContain("Long-run frequency:");
    expect(reasonFor(21)).toContain("126");
    expect(reasonFor(61)).toContain("Long-run frequency:");
    expect(reasonFor(51)).toContain("Gap since it last hit:");
    expect(reasonFor(51)).toContain("54 drawings ago");
    expect(reasonFor(1)).toContain("Gap since it last hit:");
    expect(reasonFor(58)).toContain("Recent window:");
    expect(reasonFor(58)).toContain("6 times");
    expect(first.powerball.reason).toContain("Gap since it last hit:");
  });
});
