import {
  formatCalendarDate,
  parseCalendarDate,
  wallTimeAt,
} from "../ical/zonedTime";

/** Today's date (`YYYY-MM-DD`) in `timeZone` at `nowMs`. */
export function todayIn(nowMs: number, timeZone: string): string {
  return formatCalendarDate(wallTimeAt(nowMs, timeZone));
}

/** `date` (`YYYY-MM-DD`) shifted by `days` calendar days. */
export function addDays(date: string, days: number): string {
  const parsed = parseCalendarDate(date);
  if (parsed === null) {
    throw new RangeError("date must be YYYY-MM-DD");
  }
  const shifted = new Date(0);
  shifted.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day + days);
  return formatCalendarDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}
