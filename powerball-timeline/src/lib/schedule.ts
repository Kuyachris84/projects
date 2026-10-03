/**
 * Official Powerball drawings are held Monday, Wednesday, and Saturday
 * at 10:59 p.m. Eastern Time. Confirmed on powerball.com (2026):
 * https://www.powerball.com/
 */

export const DRAW_TIME_ZONE = "America/New_York";
export const DRAW_WEEKDAYS = new Set([1, 3, 6]);
const DRAW_HOUR = 22;
const DRAW_MINUTE = 59;

export interface NextDraw {
  instant: Date;
  easternDate: string;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export interface FormattedInstant {
  when: string;
  timeZoneName: string;
  timeZoneId: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeSpaces(value: string): string {
  return value.replace(/[\u202f\u00a0]/g, " ");
}

function weekdayIndex(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function addDays(year: number, month: number, day: number, days: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function easternCalendar(instant: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DRAW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const firstOffset = timeZoneOffsetMs(guess, timeZone);
  const adjusted = new Date(guess.getTime() - firstOffset);
  const secondOffset = timeZoneOffsetMs(adjusted, timeZone);
  if (secondOffset !== firstOffset) {
    return new Date(guess.getTime() - secondOffset);
  }
  return adjusted;
}

export function nextDraw(now: Date): NextDraw {
  const start = easternCalendar(now);
  for (let offset = 0; offset < 8; offset += 1) {
    const day = addDays(start.year, start.month, start.day, offset);
    if (!DRAW_WEEKDAYS.has(weekdayIndex(day.year, day.month, day.day))) continue;
    const instant = zonedTimeToUtc(day.year, day.month, day.day, DRAW_HOUR, DRAW_MINUTE, DRAW_TIME_ZONE);
    if (instant.getTime() > now.getTime()) {
      return {
        instant,
        easternDate: `${day.year}-${pad(day.month)}-${pad(day.day)}`,
      };
    }
  }
  throw new Error("No upcoming Powerball drawing was found.");
}

/** Next drawing that does not already have an official result. */
export function resolveTarget(now: Date, drawnDates: readonly string[]): NextDraw {
  const published = new Set(drawnDates);
  let cursor = now;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const upcoming = nextDraw(cursor);
    if (!published.has(upcoming.easternDate)) return upcoming;
    cursor = new Date(upcoming.instant.getTime() + 1000);
  }
  return nextDraw(cursor);
}

export function countdownParts(target: Date, now: Date): CountdownParts {
  const totalMs = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatCalendarDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const noon = new Date(Date.UTC(year!, month! - 1, day!, 12));
  return normalizeSpaces(
    new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(noon),
  );
}

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const noon = new Date(Date.UTC(year!, month! - 1, day!, 12));
  return normalizeSpaces(
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(noon),
  );
}

export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const noon = new Date(Date.UTC(year!, month! - 1, day!, 12));
  return normalizeSpaces(
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(noon),
  );
}

export function formatInstant(instant: Date, timeZone: string): FormattedInstant {
  const date = normalizeSpaces(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(instant),
  );
  const time = normalizeSpaces(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(instant),
  );
  const timeZoneName =
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "long",
    })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone;

  return {
    when: `${date} at ${time}`,
    timeZoneName: normalizeSpaces(timeZoneName),
    timeZoneId: timeZone,
  };
}

export function formatTimestamp(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(instant);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
  return normalizeSpaces(`${date} at ${time}`);
}
