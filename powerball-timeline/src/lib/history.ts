import type { Draw } from "../types";

/** First drawing of the current 5/69 + 1/26 matrix. */
export const MATRIX_START = "2015-10-07";

export function mergeDraws(base: readonly Draw[], incoming: readonly Draw[]): Draw[] {
  const byDate = new Map<string, Draw>();
  for (const draw of [...base, ...incoming]) {
    const white = [...draw.white].sort((a, b) => a - b);
    byDate.set(draw.date, {
      date: draw.date,
      white,
      powerball: draw.powerball,
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function parseSodaRows(rows: unknown): Draw[] {
  if (!Array.isArray(rows)) {
    throw new Error("Results source did not return a list.");
  }

  const draws: Draw[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const dateRaw = record.draw_date;
    const numbersRaw = record.winning_numbers;
    if (typeof dateRaw !== "string" || typeof numbersRaw !== "string") continue;

    const date = dateRaw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < MATRIX_START) continue;

    const parts = numbersRaw.trim().split(/\s+/).map(Number);
    if (parts.length !== 6 || parts.some((n) => !Number.isInteger(n))) continue;

    const white = parts.slice(0, 5);
    const powerball = parts[5]!;
    if (new Set(white).size !== 5) continue;
    if (white.some((n) => n < 1 || n > 69)) continue;
    if (powerball < 1 || powerball > 26) continue;

    white.sort((a, b) => a - b);
    draws.push({ date, white, powerball });
  }

  return mergeDraws([], draws);
}
