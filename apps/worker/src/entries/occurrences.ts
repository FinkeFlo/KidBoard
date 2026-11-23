import {
  addCalendarDays,
  calendarDaysBetween,
  type EditorEntryInput,
  isoWeekday,
} from "@kidboard/shared";

/** Monday of the ISO week of `date`. */
function mondayOf(date: string): string {
  return addCalendarDays(date, 1 - isoWeekday(date));
}

/**
 * Whether a series starts an occurrence on `date` (`YYYY-MM-DD`, config zone): on or
 * after the first date, not after `until`, on one of the weekdays and, for every other
 * week, in a week with an even distance from the first week (RFC 5545 `INTERVAL=2`
 * with the default `WKST=MO`, as written by `buildRecurrence`). A single entry has one
 * occurrence, on its own date.
 */
export function isOccurrenceDate(
  entry: EditorEntryInput,
  date: string,
): boolean {
  if (entry.repeat === "none") {
    return date === entry.date;
  }
  const { weekdays, interval, until } = entry.repeat.weekly;
  if (date < entry.date || (until !== undefined && date > until)) {
    return false;
  }
  if (!weekdays.includes(isoWeekday(date))) {
    return false;
  }
  const weeks = calendarDaysBetween(mondayOf(entry.date), mondayOf(date)) / 7;
  return weeks % interval === 0;
}

/**
 * Calendar days from the start date of one occurrence to the last day it may touch.
 * Deliberately generous for timed entries (+1: a default one-hour end after 23:00 or an
 * end at midnight reaches into the next day); only used to pre-filter by date range.
 */
function spanDays(entry: EditorEntryInput): number {
  if (entry.allDay) {
    return entry.endDate === undefined
      ? 0
      : calendarDaysBetween(entry.date, entry.endDate) - 1;
  }
  const days =
    entry.endDate === undefined
      ? 0
      : calendarDaysBetween(entry.date, entry.endDate);
  return days + 1;
}

export interface DateRange {
  /** First day any occurrence (including moved overrides) may touch. */
  first: string;
  /** Last day any occurrence may touch; `null` for an open-ended series. */
  last: string | null;
}

/** Date range of an entry with its overrides, stored for `list(from, to)`. */
export function entryDateRange(
  entry: EditorEntryInput,
  overrides: Readonly<Record<string, EditorEntryInput>>,
): DateRange {
  let first = entry.date;
  let last: string | null =
    entry.repeat === "none"
      ? addCalendarDays(entry.date, spanDays(entry))
      : entry.repeat.weekly.until === undefined
        ? null
        : addCalendarDays(entry.repeat.weekly.until, spanDays(entry));
  for (const override of Object.values(overrides)) {
    if (override.date < first) {
      first = override.date;
    }
    const overrideLast = addCalendarDays(override.date, spanDays(override));
    if (last !== null && overrideLast > last) {
      last = overrideLast;
    }
  }
  return { first, last };
}
