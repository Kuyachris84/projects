import type { Draw } from "../types";
import { formatLongDate } from "./schedule";

export const RECENT_WINDOW = 30;

export type Signal = "frequency" | "gap" | "recent";

export interface PickedNumber {
  number: number;
  signal: Signal;
  reason: string;
}

export interface Line {
  targetDrawDate: string;
  white: PickedNumber[];
  powerball: PickedNumber;
}

interface Stats {
  number: number;
  count: number;
  gap: number;
  recent: number;
  lastDate: string | null;
}

const SIGNAL_ORDER: Signal[] = ["gap", "frequency", "recent"];

function times(count: number): string {
  return `${count} time${count === 1 ? "" : "s"}`;
}

function formatApprox(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function aboutTimes(value: number): string {
  const label = formatApprox(value);
  return label === "1" ? "1 time" : `${label} times`;
}

function aboutEvery(value: number): string {
  const label = formatApprox(value);
  return label === "1" ? "every 1 drawing" : `every ${label} drawings`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function statsFor(draws: readonly Draw[], min: number, max: number, read: (draw: Draw) => number[]): Stats[] {
  const total = draws.length;
  const windowStart = Math.max(0, total - RECENT_WINDOW);
  const stats = new Map<number, Stats>();
  for (let number = min; number <= max; number += 1) {
    stats.set(number, { number, count: 0, gap: total, recent: 0, lastDate: null });
  }

  draws.forEach((draw, index) => {
    for (const number of read(draw)) {
      const entry = stats.get(number);
      if (!entry) continue;
      entry.count += 1;
      entry.lastDate = draw.date;
      entry.gap = total - 1 - index;
      if (index >= windowStart) entry.recent += 1;
    }
  });

  return [...stats.values()];
}

function takeBest(stats: readonly Stats[], used: ReadonlySet<number>, score: (entry: Stats) => number): Stats {
  let best: Stats | null = null;
  for (const entry of stats) {
    if (used.has(entry.number)) continue;
    if (
      !best ||
      score(entry) > score(best) ||
      (score(entry) === score(best) && entry.number < best.number)
    ) {
      best = entry;
    }
  }
  if (!best) throw new Error("No number was available to select.");
  return best;
}

function signalScores(entry: Stats, total: number, pool: "white" | "powerball"): Record<Signal, number> {
  const perDraw = pool === "white" ? 5 / 69 : 1 / 26;
  const expectedCount = total * perDraw;
  const expectedGap = perDraw === 0 ? 0 : 1 / perDraw;
  const window = Math.min(RECENT_WINDOW, total);
  const expectedRecent = window * perDraw;
  return {
    frequency: expectedCount === 0 ? 0 : (entry.count - expectedCount) / expectedCount,
    gap: expectedGap === 0 ? 0 : (entry.gap - expectedGap) / expectedGap,
    recent: expectedRecent === 0 ? 0 : (entry.recent - expectedRecent) / expectedRecent,
  };
}

function dominantSignal(scores: Record<Signal, number>): Signal {
  let best: Signal = SIGNAL_ORDER[0]!;
  let bestScore = -Infinity;
  for (const signal of SIGNAL_ORDER) {
    if (scores[signal] > bestScore) {
      best = signal;
      bestScore = scores[signal];
    }
  }
  return best;
}

function describe(entry: Stats, signal: Signal, total: number, pool: "white" | "powerball"): string {
  const kind = pool === "white" ? "white ball" : "Powerball";
  const perDraw = pool === "white" ? 5 / 69 : 1 / 26;
  const window = Math.min(RECENT_WINDOW, total);
  const expectedCount = total * perDraw;
  const expectedGap = 1 / perDraw;
  const expectedRecent = window * perDraw;

  if (signal === "frequency") {
    return `Long-run frequency: ${entry.number} has appeared ${times(entry.count)} in ${formatCount(total)} drawings. A typical ${kind} appears about ${aboutTimes(expectedCount)} over that span.`;
  }

  if (signal === "recent") {
    return `Recent window: in the last ${formatCount(window)} drawings, ${entry.number} has appeared ${times(entry.recent)}. A typical ${kind} appears about ${aboutTimes(expectedRecent)} in that window.`;
  }

  if (!entry.lastDate) {
    return `Gap since it last hit: ${entry.number} has not appeared in these ${formatCount(total)} drawings. A typical ${kind} shows up about ${aboutEvery(expectedGap)}.`;
  }

  if (entry.gap === 0) {
    return `Gap since it last hit: ${entry.number} appeared in the most recent drawing on ${formatLongDate(entry.lastDate)}. A typical ${kind} shows up about ${aboutEvery(expectedGap)}.`;
  }

  const drawingWord = entry.gap === 1 ? "drawing" : "drawings";
  return `Gap since it last hit: ${entry.number} last appeared on ${formatLongDate(entry.lastDate)}, ${formatCount(entry.gap)} ${drawingWord} ago. A typical ${kind} shows up about ${aboutEvery(expectedGap)}.`;
}

function normalize(draws: readonly Draw[]): Draw[] {
  const byDate = new Map<string, Draw>();
  for (const draw of draws) {
    byDate.set(draw.date, {
      date: draw.date,
      white: [...draw.white].sort((a, b) => a - b),
      powerball: draw.powerball,
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * One deterministic line for a target drawing.
 * White balls are filled in a fixed order: best long-run frequency, longest
 * gap since last hit, hottest count in the recent window, then the next
 * frequency and the next gap. The Powerball is the number whose strongest
 * of those three signals, relative to the usual rate, ranks highest.
 * Ties always keep the lower number. The target date labels the line and
 * does not reshuffle it.
 */
export function selectLine(draws: readonly Draw[], targetDrawDate: string): Line {
  const history = normalize(draws);
  if (history.length === 0) {
    throw new Error("Cannot build a line without drawing history.");
  }

  const whiteStats = statsFor(history, 1, 69, (draw) => draw.white);
  const used = new Set<number>();
  const steps: Array<{ signal: Signal; score: (entry: Stats) => number }> = [
    { signal: "frequency", score: (entry) => entry.count },
    { signal: "gap", score: (entry) => entry.gap },
    { signal: "recent", score: (entry) => entry.recent },
    { signal: "frequency", score: (entry) => entry.count },
    { signal: "gap", score: (entry) => entry.gap },
  ];

  const white = steps.map((step) => {
    const picked = takeBest(whiteStats, used, step.score);
    used.add(picked.number);
    return {
      number: picked.number,
      signal: step.signal,
      reason: describe(picked, step.signal, history.length, "white"),
    };
  });
  white.sort((a, b) => a.number - b.number);

  const powerballStats = statsFor(history, 1, 26, (draw) => [draw.powerball]);
  let powerballPick: Stats | null = null;
  let powerballSignal: Signal = "gap";
  let powerballScore = -Infinity;
  for (const entry of powerballStats) {
    const scores = signalScores(entry, history.length, "powerball");
    const signal = dominantSignal(scores);
    const score = scores[signal];
    if (
      !powerballPick ||
      score > powerballScore ||
      (score === powerballScore && entry.number < powerballPick.number)
    ) {
      powerballPick = entry;
      powerballSignal = signal;
      powerballScore = score;
    }
  }
  if (!powerballPick) throw new Error("Cannot choose a Powerball.");

  return {
    targetDrawDate,
    white,
    powerball: {
      number: powerballPick.number,
      signal: powerballSignal,
      reason: describe(powerballPick, powerballSignal, history.length, "powerball"),
    },
  };
}
