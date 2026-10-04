import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectLine, type Signal } from "../src/lib/predict";
import type { Draw } from "../src/types";

function dateAt(index: number): string {
  const day = new Date(Date.UTC(2020, 0, 1 + index));
  return day.toISOString().slice(0, 10);
}

function series(whiteFor: (index: number) => number[], powerballFor: (index: number) => number = () => 1): Draw[] {
  return Array.from({ length: 40 }, (_, index) => ({
    date: dateAt(index),
    white: whiteFor(index),
    powerball: powerballFor(index),
  }));
}

function repeat(white: number[], count: number, start: number, powerball = 1): Draw[] {
  return Array.from({ length: count }, (_, index) => ({
    date: dateAt(start + index),
    white,
    powerball,
  }));
}

function key(line: { white: { number: number }[]; powerball: { number: number } }): string {
  return `${line.white.map((pick) => pick.number).join("-")}+${line.powerball.number}`;
}

const baseDraws = series(() => [40, 41, 42, 43, 44]);
const patternWords = /odds|chance|chances|winning|probability/i;

describe("pattern line selection", () => {
  it("returns the same line for the same history and click count", () => {
    const first = selectLine(baseDraws, "2026-10-03", 0);
    const second = selectLine(baseDraws, "2026-10-03", 0);
    expect(second).toEqual(first);
    expect(first.white).toHaveLength(5);
    expect(new Set(first.white.map((pick) => pick.number)).size).toBe(5);
    expect(first.white.map((pick) => pick.number)).toEqual([40, 41, 42, 43, 44]);
    expect(first.powerball.number).toBe(1);
  });

  it("returns a different second line that stays the same when asked again", () => {
    const first = selectLine(baseDraws, "2026-10-03", 0);
    const second = selectLine(baseDraws, "2026-10-03", 1);
    const repeated = selectLine(baseDraws, "2026-10-03", 1);
    expect(key(second)).not.toBe(key(first));
    expect(repeated).toEqual(second);
    expect(second.white.map((pick) => pick.number)).toEqual([1, 40, 41, 42, 43]);
    expect(second.powerball.number).toBe(1);
    expect(new Set(second.white.map((pick) => pick.number)).size).toBe(5);
  });

  it("keeps the numbers when only the target drawing changes", () => {
    const saturday = selectLine(baseDraws, "2026-10-03", 1);
    const monday = selectLine(baseDraws, "2026-10-05", 1);
    expect(monday.white.map((pick) => pick.number)).toEqual(saturday.white.map((pick) => pick.number));
    expect(monday.powerball.number).toBe(saturday.powerball.number);
    expect(monday.targetDrawDate).toBe("2026-10-05");
    expect(saturday.targetDrawDate).toBe("2026-10-03");
  });

  it("does not depend on the order of the history", () => {
    const reversed = [...baseDraws].reverse();
    expect(selectLine(reversed, "2026-10-03", 0)).toEqual(selectLine(baseDraws, "2026-10-03", 0));
    expect(selectLine(reversed, "2026-10-03", 1)).toEqual(selectLine(baseDraws, "2026-10-03", 1));
  });

  it("changes the line when the drawing history changes", () => {
    const extended = [...baseDraws, ...repeat([1, 2, 3, 4, 5], 80, 40, 7)];
    const next = selectLine(extended, "2026-10-05", 0);
    expect(key(next)).not.toBe(key(selectLine(baseDraws, "2026-10-03", 0)));
    expect(next.white.map((pick) => pick.number)).toEqual([1, 2, 3, 4, 5]);
    expect(next.powerball.number).toBe(7);
  });

  it("prefers a line whose numbers have been drawn together over a more frequent loner", () => {
    const history = [
      ...[11, 12, 13, 14].flatMap((extra, group) => repeat([6, extra, extra + 10, extra + 20, extra + 30], 4, group * 4)),
      ...repeat([1, 2, 3, 4, 5], 12, 16),
    ];
    const line = selectLine(history, "2026-10-03", 0);
    expect(line.white.map((pick) => pick.number)).toEqual([1, 2, 3, 4, 5]);
    expect(line.white.some((pick) => pick.signal === "pairing")).toBe(true);
  });

  it("writes a pattern reason for every number without chances language", () => {
    const first = selectLine(baseDraws, "2026-10-03", 0);
    const second = selectLine(baseDraws, "2026-10-03", 1);
    const signals = new Set<Signal>(["frequency", "gap", "recent", "pairing"]);
    const gap = second.white.find((pick) => pick.number === 1);
    expect(gap?.signal).toBe("gap");
    expect(gap?.reason.startsWith("Gap since it last appeared:")).toBe(true);
    expect(gap?.reason).toContain("has not appeared");
    expect(first.white.every((pick) => pick.reason.startsWith("Drawn together:"))).toBe(true);
    expect(first.powerball.reason.startsWith("Drawn together:")).toBe(true);

    for (const line of [first, second]) {
      for (const pick of [...line.white, line.powerball]) {
        expect(signals.has(pick.signal)).toBe(true);
        expect(pick.reason.length).toBeGreaterThan(20);
        expect(pick.reason).not.toMatch(patternWords);
        expect(pick.number).toBeGreaterThan(0);
      }
    }
  });

  it("selects stable distinct lines from the bundled official history", () => {
    const bundled = JSON.parse(
      readFileSync(new URL("../src/data/bundled-draws.json", import.meta.url), "utf8"),
    ) as { draws: Draw[] };
    const first = selectLine(bundled.draws, "2026-10-03", 0);
    const firstAgain = selectLine(bundled.draws, "2026-10-03", 0);
    const second = selectLine(bundled.draws, "2026-10-03", 1);
    const secondAgain = selectLine(bundled.draws, "2026-10-03", 1);

    expect(firstAgain).toEqual(first);
    expect(secondAgain).toEqual(second);
    expect(key(second)).not.toBe(key(first));
    expect(first.white).toHaveLength(5);
    expect(new Set(first.white.map((pick) => pick.number)).size).toBe(5);
    expect(new Set(second.white.map((pick) => pick.number)).size).toBe(5);
    expect(first.white.every((pick) => pick.number >= 1 && pick.number <= 69)).toBe(true);
    expect(second.white.every((pick) => pick.number >= 1 && pick.number <= 69)).toBe(true);
    expect(first.powerball.number).toBeGreaterThanOrEqual(1);
    expect(first.powerball.number).toBeLessThanOrEqual(26);
    expect(second.powerball.number).toBeGreaterThanOrEqual(1);
    expect(second.powerball.number).toBeLessThanOrEqual(26);
    expect(first.white.map((pick) => pick.number)).toEqual([3, 16, 61, 63, 64]);
    expect(first.powerball.number).toBe(25);
    expect(second.white.map((pick) => pick.number)).toEqual([3, 16, 32, 36, 58]);
    expect(second.powerball.number).toBe(14);
    expect(first.white.find((pick) => pick.number === 3)?.reason).toContain("appeared with 16");
    expect(first.white.find((pick) => pick.number === 61)?.reason).toContain("126");
    expect(second.white.find((pick) => pick.number === 58)?.reason).toContain("6 times");

    for (const pick of [...first.white, first.powerball, ...second.white, second.powerball]) {
      expect(pick.reason).not.toMatch(patternWords);
      expect(pick.reason).toMatch(/^(Long-run frequency:|Gap since it last appeared:|Recent window:|Drawn together:)/);
    }
  });
});
