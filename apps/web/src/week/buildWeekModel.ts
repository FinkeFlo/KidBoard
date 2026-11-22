import {
  addCalendarDays,
  type AgendaResponse,
  type CalendarEvent,
  type Meal,
} from "@kidboard/shared";

import {
  buildDayModel,
  type DayEvent,
  type DayModelConfig,
} from "../day/buildDayModel";

/**
 * Pure model of the week view: `WEEK_DAYS` consecutive calendar days from `from` (today,
 * in the config zone), each built with {@link buildDayModel} so that day and week agree on
 * which events and meals belong to a day.
 */

export const WEEK_DAYS = 7;
/** Icons shown per column; the rest is summarised as "+N". */
export const MAX_ICONS_PER_DAY = 3;

export interface WeekDay {
  /** `YYYY-MM-DD` in the config zone. */
  date: string;
  isToday: boolean;
  /** Saturday or Sunday. */
  isWeekend: boolean;
  /** The most important events of the day (at most {@link MAX_ICONS_PER_DAY}). */
  icons: CalendarEvent[];
  /** Events of the day that did not make it into `icons` (the "+N"). */
  more: number;
  /** Meals ordered breakfast, lunch, dinner, unspecified. */
  meals: Meal[];
}

/** Day of the week of a calendar date (0 = Sunday); pure calendar math, no time zone. */
export function isWeekendDate(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Ranks a day's events by importance for the icon budget of a week column:
 * 1. countdown events (the child is waiting for them),
 * 2. all-day events (they shape the whole day),
 * 3. timed events by start time (the earliest first; a continuing multi-day event counts
 *    as starting at the beginning of the day, i.e. first),
 * ties by title, then feed order. The input is not modified.
 */
export function rankByImportance(events: readonly DayEvent[]): DayEvent[] {
  const tier = ({ event }: DayEvent): number =>
    event.countdown ? 0 : event.allDay ? 1 : 2;
  const startMs = ({ event, continues }: DayEvent): number =>
    event.allDay || continues ? 0 : Date.parse(event.start);
  return [...events].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      startMs(a) - startMs(b) ||
      a.event.title.localeCompare(b.event.title),
  );
}

export function buildWeekModel(
  agenda: Pick<AgendaResponse, "events" | "meals">,
  config: DayModelConfig,
  from: string,
  now: number,
): WeekDay[] {
  return Array.from({ length: WEEK_DAYS }, (_, offset): WeekDay => {
    const date = addCalendarDays(from, offset);
    const day = buildDayModel(agenda, config, date, now);
    const ranked = rankByImportance([
      ...day.allDay,
      ...day.bands.flatMap((band) => band.events),
    ]);
    return {
      date,
      isToday: offset === 0,
      isWeekend: isWeekendDate(date),
      icons: ranked.slice(0, MAX_ICONS_PER_DAY).map(({ event }) => event),
      more: Math.max(0, ranked.length - MAX_ICONS_PER_DAY),
      meals: day.meals,
    };
  });
}
