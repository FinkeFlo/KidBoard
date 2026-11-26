import {
  type CalendarDate,
  formatCalendarDate,
  naiveUtcMs,
  parseCalendarDate,
  shiftCalendarDate,
  wallTimeAt,
} from "./wallTime";

/**
 * Calendar-date helpers on date keys, shared by worker and web: thin string adapters of
 * `./wallTime.ts` (runtime-agnostic, no DOM, no Worker globals, no Node built-ins).
 *
 * A *date key* is a calendar date `YYYY-MM-DD` in the configured IANA zone. The device
 * zone is never involved: offsets come from the runtime's tz database (`wallTimeAt`).
 */

const DAY_MS = 86_400_000;

function parseDateKey(date: string): CalendarDate {
  const parsed = parseCalendarDate(date);
  if (parsed === null) {
    throw new RangeError("date must be YYYY-MM-DD");
  }
  return parsed;
}

/**
 * Date key (`YYYY-MM-DD`) of the instant `epochMs` in `timeZone`.
 * Throws a `RangeError` for an unknown zone or an invalid instant.
 */
export function dateKeyInZone(epochMs: number, timeZone: string): string {
  return formatCalendarDate(wallTimeAt(epochMs, timeZone));
}

/**
 * Today's date key (`YYYY-MM-DD`) in `timeZone` at `nowMs` ({@link dateKeyInZone}). The
 * worker's agenda window and the client's `range.from` both derive from this, so they
 * always agree.
 */
export function todayInZone(nowMs: number, timeZone: string): string {
  return dateKeyInZone(nowMs, timeZone);
}

/** True if `value` is a strict `YYYY-MM-DD` key of an existing date. */
export function isDateKey(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

/**
 * `date` (`YYYY-MM-DD`) shifted by `days` calendar days (pure calendar arithmetic, no
 * zone, so DST cannot affect it). Throws a `RangeError` for a malformed date.
 */
export function addCalendarDays(date: string, days: number): string {
  return formatCalendarDate(shiftCalendarDate(parseDateKey(date), days));
}

function utcDayNumber(date: string): number {
  const at = naiveUtcMs({
    ...parseDateKey(date),
    hour: 0,
    minute: 0,
    second: 0,
  });
  return Math.round(at / DAY_MS);
}

/**
 * Calendar days from `from` to `to` (both `YYYY-MM-DD`): positive if `to` is later,
 * 0 for the same date. Pure calendar arithmetic (UTC day numbers), so a DST change in
 * between never makes a day 23 or 25 hours long. Throws a `RangeError` for a malformed
 * date.
 */
export function calendarDaysBetween(from: string, to: string): number {
  return utcDayNumber(to) - utcDayNumber(from);
}
