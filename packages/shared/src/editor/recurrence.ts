import {
  addCalendarDays,
  calendarDaysBetween,
  dateKeyInZone,
  isDateKey,
} from "../dates";
import { isValidTimeZone } from "../primitives";
import type { EditorRepeat } from "./entry";
import {
  isoWeekday,
  minutesOfTime,
  startOfZonedDayMs,
  wallTimeInZone,
  zonedWallTimeToEpochMs,
} from "./zonedTime";

/**
 * Weekly recurrence for the editor (ADR-0012): exactly one
 * `RRULE:FREQ=WEEKLY;BYDAY=…[;INTERVAL=2][;UNTIL=…]` line. The series is anchored to
 * `start.timeZone` = configured zone by the caller, so DST keeps the wall-clock time.
 */

/** RFC 5545 weekday codes indexed by ISO weekday - 1 (Monday first). */
const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

/** Start of the series: `date` (`YYYY-MM-DD`), `startTime` (`HH:mm`) for timed series. */
export interface RecurrenceStart {
  date: string;
  startTime?: string | undefined;
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function compactUtc(epochMs: number): string {
  const at = new Date(epochMs);
  return (
    `${String(at.getUTCFullYear()).padStart(4, "0")}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  );
}

/**
 * The `RRULE` *value* for `repeat` (`FREQ=WEEKLY;BYDAY=…[;INTERVAL=2][;UNTIL=…]`,
 * without the `RRULE:` property name), or `null` for `none`. This is the form for
 * iCalendar libraries that take the value, e.g. ical.js `ICAL.Recur.fromString(value)`
 * when the worker renders app entries (ADR-0014); {@link buildRecurrence} wraps it as a
 * Google `recurrence` line.
 *
 * `UNTIL` follows RFC 5545 section 3.3.10: for all-day series (`DTSTART` is a DATE) it
 * is the DATE `YYYYMMDD` of the last day; for timed series (`DTSTART` with a zone) it
 * must be UTC, and it is the last second of the last local day in `timeZone`
 * (`until` + 1 day at local midnight - 1 s, computed with that day's offset, so a DST
 * change in between does not cut off or add a day). Throws a `RangeError` if `until` is
 * before `start.date` or a date is malformed.
 */
export function buildRecurrenceRule(
  repeat: EditorRepeat,
  start: RecurrenceStart,
  timeZone: string,
): string | null {
  if (repeat === "none") {
    return null;
  }
  const { weekdays, interval, until } = repeat.weekly;
  const days = [...new Set(weekdays)]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_CODES[day - 1]);
  if (days.length === 0 || days.some((code) => code === undefined)) {
    throw new RangeError("weekdays must be 1-7");
  }
  let rule = `FREQ=WEEKLY;BYDAY=${days.join(",")}`;
  if (interval === 2) {
    rule += ";INTERVAL=2";
  }
  if (until !== undefined) {
    if (calendarDaysBetween(start.date, until) < 0) {
      throw new RangeError("until must not be before the start date");
    }
    rule +=
      start.startTime === undefined
        ? `;UNTIL=${compactDate(until)}`
        : `;UNTIL=${compactUtc(startOfZonedDayMs(addCalendarDays(until, 1), timeZone) - 1000)}`;
  }
  return rule;
}

/**
 * The recurrence lines for `repeat` (`[]` for `none`): one `RRULE:` line with the value
 * of {@link buildRecurrenceRule} (Google `recurrence` array form).
 */
export function buildRecurrence(
  repeat: EditorRepeat,
  start: RecurrenceStart,
  timeZone: string,
): string[] {
  const rule = buildRecurrenceRule(repeat, start, timeZone);
  return rule === null ? [] : [`RRULE:${rule}`];
}

const DATE_VALUE = /^\d{8}$/;
const DATE_TIME_VALUE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

interface IcalValue {
  date: string;
  /** `HH:mm` and seconds; absent for DATE values. */
  time?: { hhmm: string; seconds: number };
  utc: boolean;
}

function parseIcalValue(value: string): IcalValue | null {
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (DATE_VALUE.test(value)) {
    return isDateKey(date) ? { date, utc: false } : null;
  }
  const dateTime = DATE_TIME_VALUE.exec(value);
  if (dateTime === null) {
    return null;
  }
  const [hours, minutes, seconds] = [dateTime[4], dateTime[5], dateTime[6]].map(
    Number,
  ) as [number, number, number];
  if (!isDateKey(date) || hours > 23 || minutes > 59 || seconds > 60) {
    return null;
  }
  return {
    date,
    time: {
      hhmm: `${pad(hours)}:${pad(minutes)}`,
      seconds: Math.min(seconds, 59),
    },
    utc: dateTime[7] === "Z",
  };
}

/** Instant of a DATE-TIME value: UTC, in `tzid`, or floating (read in `timeZone`). */
function valueEpochMs(
  value: IcalValue & { time: NonNullable<IcalValue["time"]> },
  tzid: string | undefined,
  timeZone: string,
): number {
  if (value.utc) {
    return Date.parse(
      `${value.date}T${value.time.hhmm}:${pad(value.time.seconds)}Z`,
    );
  }
  const zone = tzid !== undefined && isValidTimeZone(tzid) ? tzid : timeZone;
  return zonedWallTimeToEpochMs(
    value.date,
    value.time.hhmm,
    zone,
    value.time.seconds,
  );
}

/**
 * Last local date covered by an `UNTIL` value: the last date `d` whose occurrence
 * (at `startTime`, local midnight for all-day series) is not after `UNTIL`.
 */
function untilDate(
  value: IcalValue,
  start: RecurrenceStart,
  timeZone: string,
): string {
  if (value.time === undefined) {
    return value.date;
  }
  const epochMs = valueEpochMs(
    { ...value, time: value.time },
    undefined,
    timeZone,
  );
  const wall = wallTimeInZone(epochMs, timeZone);
  const startMinutes =
    start.startTime === undefined ? 0 : minutesOfTime(start.startTime);
  return minutesOfTime(wall.time) < startMinutes
    ? addCalendarDays(wall.date, -1)
    : wall.date;
}

function lineName(line: string): string {
  const end = line.search(/[;:]/u);
  return (end === -1 ? line : line.slice(0, end)).toUpperCase();
}

function parseRule(
  line: string,
  start: RecurrenceStart,
  timeZone: string,
): EditorRepeat | null {
  const colon = line.indexOf(":");
  if (colon === -1 || line.slice(0, colon).toUpperCase() !== "RRULE") {
    return null;
  }
  const parts = new Map<string, string>();
  for (const part of line.slice(colon + 1).split(";")) {
    const eq = part.indexOf("=");
    const key = part.slice(0, eq).toUpperCase();
    if (eq <= 0 || parts.has(key)) {
      return null;
    }
    parts.set(key, part.slice(eq + 1).toUpperCase());
  }
  for (const key of parts.keys()) {
    if (!["FREQ", "BYDAY", "INTERVAL", "UNTIL", "WKST"].includes(key)) {
      return null; // COUNT, BYMONTHDAY, BYSETPOS, BYHOUR, …
    }
  }
  if (parts.get("FREQ") !== "WEEKLY") {
    return null;
  }

  const startDay = isoWeekday(start.date);
  const byDay = parts.get("BYDAY");
  const weekdays: number[] = [];
  for (const code of byDay === undefined
    ? [WEEKDAY_CODES[startDay - 1]]
    : byDay.split(",")) {
    const day =
      WEEKDAY_CODES.indexOf(code as (typeof WEEKDAY_CODES)[number]) + 1;
    if (day === 0) {
      return null; // ordinal days such as `1MO` or garbage
    }
    if (!weekdays.includes(day)) {
      weekdays.push(day);
    }
  }
  weekdays.sort((a, b) => a - b);
  if (!weekdays.includes(startDay)) {
    return null; // the first occurrence would not be on a rule day
  }

  const intervalText = parts.get("INTERVAL") ?? "1";
  if (intervalText !== "1" && intervalText !== "2") {
    return null;
  }
  const interval = intervalText === "2" ? 2 : 1;

  // WKST only changes which weeks an INTERVAL=2 rule picks when Sunday is grouped
  // with other days; the editor writes the default (MO).
  const wkst = parts.get("WKST") ?? "MO";
  if (
    wkst !== "MO" &&
    (!WEEKDAY_CODES.includes(wkst as (typeof WEEKDAY_CODES)[number]) ||
      (interval === 2 && weekdays.length > 1))
  ) {
    return null;
  }

  const weekly: { weekdays: number[]; interval: 1 | 2; until?: string } = {
    weekdays,
    interval,
  };
  const untilText = parts.get("UNTIL");
  if (untilText !== undefined) {
    const value = parseIcalValue(untilText);
    if (value === null) {
      return null;
    }
    const until = untilDate(value, start, timeZone);
    if (calendarDaysBetween(start.date, until) < 0) {
      return null;
    }
    weekly.until = until;
  }
  return { weekly };
}

/**
 * The editor form of a Google `recurrence` array, or `null` if the editor cannot
 * express it (`repeatEditable: false`): accepted are no rule at all (`none`) or exactly
 * one `RRULE` with `FREQ=WEEKLY`, plain `BYDAY` days that include the start's weekday
 * (missing = the start's weekday), `INTERVAL` 1 or 2, optional `UNTIL` (DATE, UTC or
 * floating; mapped to the last local date it covers) and `WKST` where it does not
 * change the result. `EXDATE` lines are allowed (and kept on master edits, see
 * {@link rebaseExdates}); `COUNT`, other `BY…` parts, other frequencies, `RDATE`,
 * `EXRULE`, several `RRULE`s or unknown lines -> `null`.
 */
export function parseRecurrence(
  lines: readonly string[] | undefined,
  start: RecurrenceStart,
  timeZone: string,
): EditorRepeat | null {
  if (!isDateKey(start.date)) {
    return null;
  }
  const rules: string[] = [];
  for (const line of lines ?? []) {
    const name = lineName(line);
    if (name === "RRULE") {
      rules.push(line);
    } else if (name !== "EXDATE") {
      return null;
    }
  }
  if (rules.length === 0) {
    return "none";
  }
  const [rule] = rules;
  return rules.length === 1 && rule !== undefined
    ? parseRule(rule, start, timeZone)
    : null;
}

/** The `EXDATE` lines of a recurrence array, unchanged. */
export function exdateLines(lines: readonly string[] | undefined): string[] {
  return (lines ?? []).filter((line) => lineName(line) === "EXDATE");
}

function exdateParams(line: string): { tzid?: string; values: string[] } {
  const colon = line.indexOf(":");
  if (colon === -1) {
    return { values: [] };
  }
  const params = line.slice(0, colon).split(";").slice(1);
  const tzidParam = params.find((param) =>
    param.toUpperCase().startsWith("TZID="),
  );
  const values = line
    .slice(colon + 1)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  return tzidParam === undefined
    ? { values }
    : { tzid: tzidParam.slice("TZID=".length).replace(/^"|"$/gu, ""), values };
}

/**
 * `EXDATE` lines for a series whose start changed: each excluded occurrence is mapped
 * to its local date in `timeZone` and re-emitted for the new start, as
 * `EXDATE;VALUE=DATE:…` (all-day) or `EXDATE;TZID=<timeZone>:…T<startTime>00` (timed),
 * so cancelled days stay cancelled when the series moves to another time. Values that
 * cannot be read are dropped. Returns `[]` when there are none.
 */
export function rebaseExdates(
  lines: readonly string[] | undefined,
  start: RecurrenceStart,
  timeZone: string,
): string[] {
  const dates = new Set<string>();
  for (const line of exdateLines(lines)) {
    const { tzid, values } = exdateParams(line);
    for (const raw of values) {
      const value = parseIcalValue(raw.toUpperCase());
      if (value === null) {
        continue;
      }
      dates.add(
        value.time === undefined
          ? value.date
          : dateKeyInZone(
              valueEpochMs({ ...value, time: value.time }, tzid, timeZone),
              timeZone,
            ),
      );
    }
  }
  if (dates.size === 0) {
    return [];
  }
  const sorted = [...dates].sort();
  if (start.startTime === undefined) {
    return [`EXDATE;VALUE=DATE:${sorted.map(compactDate).join(",")}`];
  }
  const time = `T${start.startTime.replace(":", "")}00`;
  return [
    `EXDATE;TZID=${timeZone}:${sorted.map((date) => `${compactDate(date)}${time}`).join(",")}`,
  ];
}
