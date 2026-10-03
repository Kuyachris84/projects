import { describe, expect, it } from "vitest";
import { mergeDraws, parseSodaRows } from "../src/lib/history";

describe("official history parsing", () => {
  it("keeps current-matrix drawings and drops older or invalid rows", () => {
    const draws = parseSodaRows([
      { draw_date: "2015-10-03T00:00:00.000", winning_numbers: "06 26 33 44 46 04" },
      { draw_date: "2015-10-07T00:00:00.000", winning_numbers: "18 30 40 48 52 09" },
      { draw_date: "2015-10-10T00:00:00.000", winning_numbers: "12 27 29 43 68 35" },
      { draw_date: "2015-10-14T00:00:00.000", winning_numbers: "01 01 02 03 04 05" },
      { draw_date: "2015-10-17T00:00:00.000", winning_numbers: "02 07 09 17 58 20" },
    ]);

    expect(draws).toEqual([
      { date: "2015-10-07", white: [18, 30, 40, 48, 52], powerball: 9 },
      { date: "2015-10-17", white: [2, 7, 9, 17, 58], powerball: 20 },
    ]);
  });

  it("lets a later row for the same date replace the earlier one", () => {
    expect(
      mergeDraws(
        [{ date: "2026-09-30", white: [1, 2, 3, 4, 5], powerball: 6 }],
        [{ date: "2026-09-30", white: [4, 6, 23, 33, 44], powerball: 13 }],
      ),
    ).toEqual([{ date: "2026-09-30", white: [4, 6, 23, 33, 44], powerball: 13 }]);
  });
});
