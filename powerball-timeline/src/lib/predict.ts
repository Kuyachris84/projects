import type { Draw } from "../types";
import { formatLongDate } from "./schedule";

export const RECENT_WINDOW = 30;

export type Signal = "frequency" | "gap" | "recent" | "pairing";

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
  frequency: number;
  gapScore: number;
  recentScore: number;
  individual: number;
}

interface RankedLine {
  white: number[];
  powerball: number;
  score: number;
}

interface Analysis {
  total: number;
  white: Stats[];
  powerball: Stats[];
  pair: Uint16Array[];
  whitePb: Uint16Array[];
  maxPair: number;
  maxWhitePb: number;
  ranked: RankedLine[];
}

const POOL_SEEDS = 12;
const POOL_LIMIT = 16;

let cachedSignature = "";
let cachedAnalysis: Analysis | null = null;

function times(count: number): string {
  return `${count} time${count === 1 ? "" : "s"}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function unit(value: number, max: number): number {
  return max === 0 ? 0 : value / max;
}

function historySignature(history: readonly Draw[]): string {
  let hash = 2166136261;
  for (const draw of history) {
    for (let index = 0; index < draw.date.length; index += 1) {
      hash ^= draw.date.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    for (const number of draw.white) {
      hash ^= number;
      hash = Math.imul(hash, 16777619);
    }
    hash ^= draw.powerball;
    hash = Math.imul(hash, 16777619);
  }
  return `${history.length}:${hash >>> 0}`;
}

function statsFor(draws: readonly Draw[], min: number, max: number, read: (draw: Draw) => number[]): Stats[] {
  const total = draws.length;
  const windowStart = Math.max(0, total - RECENT_WINDOW);
  const stats: Stats[] = [];
  for (let number = min; number <= max; number += 1) {
    stats[number] = { number, count: 0, gap: total, recent: 0, lastDate: null, frequency: 0, gapScore: 0, recentScore: 0, individual: 0 };
  }

  draws.forEach((draw, index) => {
    for (const number of read(draw)) {
      const entry = stats[number];
      if (!entry) continue;
      entry.count += 1;
      entry.lastDate = draw.date;
      entry.gap = total - 1 - index;
      if (index >= windowStart) entry.recent += 1;
    }
  });

  let maxCount = 0;
  let maxGap = 0;
  let maxRecent = 0;
  for (let number = min; number <= max; number += 1) {
    const entry = stats[number]!;
    if (entry.count > maxCount) maxCount = entry.count;
    if (entry.gap > maxGap) maxGap = entry.gap;
    if (entry.recent > maxRecent) maxRecent = entry.recent;
  }

  for (let number = min; number <= max; number += 1) {
    const entry = stats[number]!;
    entry.frequency = unit(entry.count, maxCount);
    entry.gapScore = unit(entry.gap, maxGap);
    entry.recentScore = unit(entry.recent, maxRecent);
    entry.individual = (entry.frequency + entry.gapScore + entry.recentScore) / 3;
  }

  return stats;
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

function combinations(items: readonly number[], size: number): number[][] {
  const lines: number[][] = [];
  const current: number[] = [];

  function walk(start: number): void {
    if (current.length === size) {
      lines.push([...current]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]!);
      walk(index + 1);
      current.pop();
    }
  }

  walk(0);
  return lines;
}

function buildPool(white: readonly Stats[], pair: readonly Uint16Array[]): number[] {
  const ranked = white
    .filter((entry): entry is Stats => Boolean(entry))
    .sort((a, b) => b.individual - a.individual || a.number - b.number);
  const pool = new Set<number>();
  for (const entry of ranked) {
    if (pool.size >= POOL_SEEDS) break;
    pool.add(entry.number);
  }

  for (const seed of [...pool]) {
    if (pool.size >= POOL_LIMIT) break;
    let partner = 0;
    let partnerCount = -1;
    for (let number = 1; number <= 69; number += 1) {
      if (number === seed || pool.has(number)) continue;
      const count = pair[seed]![number] ?? 0;
      if (count > partnerCount || (count === partnerCount && (partner === 0 || number < partner))) {
        partner = number;
        partnerCount = count;
      }
    }
    if (partner > 0 && partnerCount > 0) pool.add(partner);
  }

  for (const entry of ranked) {
    if (pool.size >= POOL_LIMIT) break;
    pool.add(entry.number);
  }

  return [...pool].sort((a, b) => a - b);
}

function analyze(history: readonly Draw[]): Analysis {
  const signature = historySignature(history);
  if (cachedAnalysis && cachedSignature === signature) return cachedAnalysis;

  const total = history.length;
  const white = statsFor(history, 1, 69, (draw) => draw.white);
  const powerball = statsFor(history, 1, 26, (draw) => [draw.powerball]);
  const pair = Array.from({ length: 70 }, () => new Uint16Array(70));
  const whitePb = Array.from({ length: 70 }, () => new Uint16Array(27));
  let maxPair = 0;
  let maxWhitePb = 0;

  for (const draw of history) {
    for (let left = 0; left < draw.white.length; left += 1) {
      const a = draw.white[left]!;
      const withPowerball = whitePb[a]![draw.powerball]! + 1;
      whitePb[a]![draw.powerball] = withPowerball;
      if (withPowerball > maxWhitePb) maxWhitePb = withPowerball;
      for (let right = left + 1; right < draw.white.length; right += 1) {
        const b = draw.white[right]!;
        const together = pair[a]![b]! + 1;
        pair[a]![b] = together;
        pair[b]![a] = together;
        if (together > maxPair) maxPair = together;
      }
    }
  }

  const pool = buildPool(white, pair);
  const ranked: RankedLine[] = [];
  for (const numbers of combinations(pool, 5)) {
    let individual = 0;
    let pairTotal = 0;
    let pairSamples = 0;
    for (let left = 0; left < numbers.length; left += 1) {
      individual += white[numbers[left]!]!.individual;
      for (let right = left + 1; right < numbers.length; right += 1) {
        pairTotal += unit(pair[numbers[left]!]![numbers[right]!] ?? 0, maxPair);
        pairSamples += 1;
      }
    }
    const whiteScore = individual / numbers.length + (pairSamples === 0 ? 0 : pairTotal / pairSamples);

    for (let ball = 1; ball <= 26; ball += 1) {
      const entry = powerball[ball]!;
      let paired = 0;
      for (const number of numbers) paired += unit(whitePb[number]![ball] ?? 0, maxWhitePb);
      const powerballScore = entry.individual + paired / numbers.length;
      ranked.push({ white: numbers, powerball: ball, score: whiteScore + powerballScore });
    }
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    for (let index = 0; index < a.white.length; index += 1) {
      const diff = a.white[index]! - b.white[index]!;
      if (diff !== 0) return diff;
    }
    return a.powerball - b.powerball;
  });

  cachedSignature = signature;
  cachedAnalysis = { total, white, powerball, pair, whitePb, maxPair, maxWhitePb, ranked };
  return cachedAnalysis;
}

function strongestWhitePartner(numbers: readonly number[], subject: number, pair: readonly Uint16Array[]): { partner: number; count: number } {
  let partner = 0;
  let count = -1;
  for (const number of numbers) {
    if (number === subject) continue;
    const together = pair[subject]![number] ?? 0;
    if (together > count || (together === count && (partner === 0 || number < partner))) {
      partner = number;
      count = together;
    }
  }
  return { partner, count: Math.max(0, count) };
}

function strongestPowerballPartner(whites: readonly number[], powerball: number, whitePb: readonly Uint16Array[]): { partner: number; count: number } {
  let partner = 0;
  let count = -1;
  for (const number of whites) {
    const together = whitePb[number]![powerball] ?? 0;
    if (together > count || (together === count && (partner === 0 || number < partner))) {
      partner = number;
      count = together;
    }
  }
  return { partner, count: Math.max(0, count) };
}

function describe(
  entry: Stats,
  signal: Signal,
  total: number,
  partner: number,
  partnerCount: number,
  pool: "white" | "powerball",
): string {
  if (signal === "pairing") {
    const other = pool === "powerball" ? `white ball ${partner}` : String(partner);
    const drawingWord = partnerCount === 1 ? "drawing" : "drawings";
    return `Drawn together: ${entry.number} has appeared with ${other} in ${formatCount(partnerCount)} ${drawingWord}.`;
  }

  if (signal === "frequency") {
    return `Long-run frequency: ${entry.number} has appeared ${times(entry.count)} in ${formatCount(total)} drawings.`;
  }

  if (signal === "recent") {
    const window = Math.min(RECENT_WINDOW, total);
    return `Recent window: in the last ${formatCount(window)} drawings, ${entry.number} has appeared ${times(entry.recent)}.`;
  }

  if (!entry.lastDate) {
    return `Gap since it last appeared: ${entry.number} has not appeared in these ${formatCount(total)} drawings.`;
  }

  if (entry.gap === 0) {
    return `Gap since it last appeared: ${entry.number} appeared in the most recent drawing on ${formatLongDate(entry.lastDate)}.`;
  }

  const drawingWord = entry.gap === 1 ? "drawing" : "drawings";
  return `Gap since it last appeared: ${entry.number} last appeared on ${formatLongDate(entry.lastDate)}, ${formatCount(entry.gap)} ${drawingWord} ago.`;
}

function patternFor(entry: Stats, partnerCount: number, maxPair: number): Signal {
  const options: Array<{ signal: Signal; score: number }> = [
    { signal: "pairing", score: partnerCount > 0 ? unit(partnerCount, maxPair) : -1 },
    { signal: "frequency", score: entry.frequency },
    { signal: "gap", score: entry.gapScore },
    { signal: "recent", score: entry.recentScore },
  ];
  let best: Signal = "frequency";
  let bestScore = -1;
  for (const option of options) {
    if (option.score > bestScore) {
      best = option.signal;
      bestScore = option.score;
    }
  }
  return best;
}

function pickNumber(
  entry: Stats,
  analysis: Analysis,
  companions: readonly number[],
  pool: "white" | "powerball",
): PickedNumber {
  const match =
    pool === "white"
      ? strongestWhitePartner(companions, entry.number, analysis.pair)
      : strongestPowerballPartner(companions, entry.number, analysis.whitePb);
  const maxPair = pool === "white" ? analysis.maxPair : analysis.maxWhitePb;
  const signal = patternFor(entry, match.count, maxPair);
  return {
    number: entry.number,
    signal,
    reason: describe(entry, signal, analysis.total, match.partner, match.count, pool),
  };
}

/**
 * Pattern lines for one target drawing, best score first.
 * Each white number and Powerball is scored from long-run frequency, the gap
 * since it last appeared, and its count in the recent window. A line also
 * scores the pairings among its white balls and between those balls and the
 * Powerball. Index 0 is the highest-scoring line. A larger index is the next
 * distinct line in that same order. Ties break toward the lower numbers.
 * The target date labels the line and does not change the score.
 */
export function selectLine(draws: readonly Draw[], targetDrawDate: string, index = 0): Line {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Line index must be a non-negative integer.");
  }

  const history = normalize(draws);
  if (history.length === 0) {
    throw new Error("Cannot build a line without drawing history.");
  }

  const analysis = analyze(history);
  const chosen = analysis.ranked[index];
  if (!chosen) {
    throw new Error("No further distinct pattern line is available.");
  }

  const white = chosen.white.map((number) =>
    pickNumber(analysis.white[number]!, analysis, chosen.white, "white"),
  );
  const powerball = pickNumber(
    analysis.powerball[chosen.powerball]!,
    analysis,
    chosen.white,
    "powerball",
  );

  return { targetDrawDate, white, powerball };
}
