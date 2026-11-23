import { tzOffset } from "@date-fns/tz";

import { addCalendarDays, dateKeyInZone, isDateKey } from "../dates";

/**
 * Wall-clock time <-> instant conversion for the editor, always in an explicitly given
 * IANA zone (the configured `timeZone`, never the device zone). Offsets come from
 * `@date-fns/tz` `tzOffset` (the runtime's tz database). DST gaps and overlaps follow
 * RFC 5545 section 3.3.5, like the worker's feed expansion:
 *
 * - Non-existent local time (spring-forward gap): the offset in effect *before* the gap,
 *   e.g. 02:30 on the Europe/Berlin spring-forward day is 01:30Z (= 03:30+02:00).
 * - Ambiguous local time (fall-back overlap): the *first* occurrence, e.g. 02:30 on the
 *   Europe/Berlin fall-back day is 00:30Z (= 02:30+02:00).
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function offsetMinutes(timeZone: string, epochMs: number): number {
  const offset = tzOffset(timeZone, new Date(epochMs));
  if (Number.isNaN(offset)) {
    throw new RangeError("Unknown time zone or invalid instant");
  }
  return Math.round(offset);
}

function pad(value: number, length = 2): string {
  return String(Math.abs(value)).padStart(length, "0");
}

/** Minutes since midnight of an `HH:mm` string. Throws a `RangeError` if malformed. */
export function minutesOfTime(time: string): number {
  const match = TIME_RE.exec(time);
  if (match === null) {
    throw new RangeError("time must be HH:mm");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** `HH:mm` of minutes since midnight (0-1439). */
export function timeOfMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** The wall fields as if they were UTC. */
function naiveUtcMs(date: string, minutes: number, seconds = 0): number {
  if (!isDateKey(date)) {
    throw new RangeError("date must be YYYY-MM-DD");
  }
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  at.setUTCHours(0, minutes, seconds, 0);
  return at.getTime();
}

/**
 * Epoch ms of the wall-clock `date` + `time` (`HH:mm`, optional extra `seconds`) in
 * `timeZone`, DST resolved as documented above. Assumes at most one offset transition
 * within ±24 h (true for all current IANA zones).
 */
export function zonedWallTimeToEpochMs(
  date: string,
  time: string,
  timeZone: string,
  seconds = 0,
): number {
  const naive = naiveUtcMs(date, minutesOfTime(time), seconds);
  const before = offsetMinutes(timeZone, naive - DAY_MS);
  const after = offsetMinutes(timeZone, naive + DAY_MS);
  const candidates = [before, after]
    .map((offset) => naive - offset * MINUTE_MS)
    .filter(
      (epochMs, i) =>
        offsetMinutes(timeZone, epochMs) === (i === 0 ? before : after),
    );
  return candidates.length > 0
    ? Math.min(...candidates)
    : naive - before * MINUTE_MS;
}

/** Epoch ms of local midnight starting `date` in `timeZone`. */
export function startOfZonedDayMs(date: string, timeZone: string): number {
  return zonedWallTimeToEpochMs(date, "00:00", timeZone);
}

export interface ZonedWallTime {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:mm` */
  time: string;
  /** Seconds within the minute (0-59); the editor works in whole minutes. */
  seconds: number;
}

/** Wall-clock date and time of the instant `epochMs` in `timeZone`. */
export function wallTimeInZone(
  epochMs: number,
  timeZone: string,
): ZonedWallTime {
  const shifted = new Date(
    epochMs + offsetMinutes(timeZone, epochMs) * MINUTE_MS,
  );
  return {
    date: dateKeyInZone(epochMs, timeZone),
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
    seconds: shifted.getUTCSeconds(),
  };
}

/** ISO 8601 with the offset of `timeZone`, e.g. `2026-03-30T08:00:00+02:00`. */
export function formatZonedDateTime(epochMs: number, timeZone: string): string {
  const offset = offsetMinutes(timeZone, epochMs);
  const wall = wallTimeInZone(epochMs, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const zone = `${sign}${pad(Math.trunc(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  return `${wall.date}T${wall.time}:${pad(wall.seconds)}${zone}`;
}

/** `date` + `time` shifted by `minutes` of wall-clock time (may roll over to other days). */
export function addWallMinutes(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } {
  const total = minutesOfTime(time) + minutes;
  const days = Math.floor(total / 1440);
  return {
    date: addCalendarDays(date, days),
    time: timeOfMinutes(total - days * 1440),
  };
}

/** ISO weekday of a `YYYY-MM-DD` date: 1 = Monday … 7 = Sunday (pure calendar arithmetic). */
export function isoWeekday(date: string): number {
  const day = new Date(naiveUtcMs(date, 0)).getUTCDay();
  return day === 0 ? 7 : day;
}
