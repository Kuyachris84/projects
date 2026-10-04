import { describe, expect, it } from "vitest";
import {
  countdownParts,
  formatInstant,
  formatTimestamp,
  nextDraw,
  resolveTarget,
} from "../src/lib/schedule";

describe("next Powerball draw", () => {
  it("keeps a Wednesday draw that has not started", () => {
    const upcoming = nextDraw(new Date("2026-01-07T15:00:00.000Z"));
    expect(upcoming.easternDate).toBe("2026-01-07");
    expect(upcoming.instant.toISOString()).toBe("2026-01-08T03:59:00.000Z");
    expect(formatInstant(upcoming.instant, "America/New_York").when).toContain("10:59:00 PM");
    expect(formatInstant(upcoming.instant, "America/New_York").timeZoneName).toBe("Eastern Standard Time");
  });

  it("uses daylight time in July and converts to Pacific", () => {
    const upcoming = nextDraw(new Date("2026-07-01T12:00:00.000Z"));
    expect(upcoming.easternDate).toBe("2026-07-01");
    expect(upcoming.instant.toISOString()).toBe("2026-07-02T02:59:00.000Z");
    const pacific = formatInstant(upcoming.instant, "America/Los_Angeles");
    expect(pacific.when).toContain("July 1, 2026");
    expect(pacific.when).toContain("7:59:00 PM");
    expect(pacific.timeZoneName).toBe("Pacific Daylight Time");
    expect(pacific.timeZoneId).toBe("America/Los_Angeles");
  });

  it("rolls forward once the draw instant is reached", () => {
    const before = nextDraw(new Date("2026-10-04T02:58:59.000Z"));
    expect(before.easternDate).toBe("2026-10-03");

    const atDraw = nextDraw(new Date("2026-10-04T02:59:00.000Z"));
    expect(atDraw.easternDate).toBe("2026-10-05");
    expect(atDraw.instant.toISOString()).toBe("2026-10-06T02:59:00.000Z");
  });

  it("schedules Saturday from earlier the same day, then Monday after it", () => {
    const saturday = nextDraw(new Date("2026-10-03T17:33:00.000Z"));
    expect(saturday.easternDate).toBe("2026-10-03");
    expect(saturday.instant.toISOString()).toBe("2026-10-04T02:59:00.000Z");

    const sunday = nextDraw(new Date("2026-10-04T15:00:00.000Z"));
    expect(sunday.easternDate).toBe("2026-10-05");
  });

  it("stays on the correct UTC offset across the 2026 daylight-saving changes", () => {
    const spring = nextDraw(new Date("2026-03-11T16:00:00.000Z"));
    expect(spring.easternDate).toBe("2026-03-11");
    expect(spring.instant.toISOString()).toBe("2026-03-12T02:59:00.000Z");

    const fall = nextDraw(new Date("2026-11-02T16:00:00.000Z"));
    expect(fall.easternDate).toBe("2026-11-02");
    expect(fall.instant.toISOString()).toBe("2026-11-03T03:59:00.000Z");
  });

  it("skips a drawing date that already has a published result", () => {
    const target = resolveTarget(new Date("2026-10-03T17:33:00.000Z"), ["2026-10-03"]);
    expect(target.easternDate).toBe("2026-10-05");
  });

  it("counts down in days, hours, minutes, and seconds", () => {
    expect(
      countdownParts(new Date("2026-10-04T02:59:00.000Z"), new Date("2026-10-03T17:33:00.000Z")),
    ).toMatchObject({ days: 0, hours: 9, minutes: 26, seconds: 0 });

    expect(
      countdownParts(new Date("2026-10-03T00:00:00.000Z"), new Date("2026-10-03T00:00:01.000Z")),
    ).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("labels a timestamp in the requested timezone", () => {
    const labeled = formatTimestamp("2026-10-03T17:43:00.000Z", "UTC");
    expect(labeled).toContain("October 3, 2026");
    expect(labeled).toContain("UTC");
  });
});
