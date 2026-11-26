import {
  type AgendaResponse,
  type CalendarEvent,
  dateKeyInZone,
  type Meal,
  type MealSlot,
  type PublicConfig,
} from "@kidboard/shared";

import type { EventStatus } from "../components/EventTile";
import { bandOf, DAY_BANDS, type DayBand } from "../time";

/**
 * Pure model of the day view: which events and meals belong to `date` (a date key in
 * the config zone) and where they are placed. No React, no timers; every instant is
 * interpreted in the configured zone, never the device zone.
 */

export interface DayEvent {
  event: CalendarEvent;
  /** `upcoming` for all-day events (they have no time to recede from). */
  status: EventStatus;
  /**
   * A timed event that started on an earlier day and is still under way on this one:
   * the tile shows a "continues" hint instead of the (misleading) original start time.
   */
  continues: boolean;
  /**
   * Time of day for the tile's icon: the band the event is placed in (`night` counts as
   * morning, events carried over from an earlier day as morning). `null` for all-day
   * events, which get their own treatment.
   */
  timeOfDay: DayBand | null;
}

export interface DayModel {
  /** All-day events (also multi-day ones) covering the date, in feed order. */
  allDay: DayEvent[];
  /**
   * Timed events covering the date, grouped by placement band (morning, midday,
   * evening; see `timeOfDay`) and by start time within a band, ties by title.
   */
  events: DayEvent[];
  /** Today's meals ordered breakfast, lunch, dinner, unspecified. */
  meals: Meal[];
  /** No event and no meal on the date. */
  isEmpty: boolean;
}

export type DayModelConfig = Pick<PublicConfig, "timeZone" | "bands">;

const MEAL_ORDER: readonly MealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "unspecified",
];

/** Date keys compare correctly as strings (`YYYY-MM-DD`). */
function coversAllDay(event: CalendarEvent, date: string): boolean {
  // `end` is exclusive; a zero-length all-day event still counts for its start day.
  return event.start <= date && (date < event.end || event.start === date);
}

/** First and last day (zone date keys) a timed event touches. `end` is exclusive. */
function timedDays(
  event: CalendarEvent,
  timeZone: string,
): { first: string; last: string; startMs: number; endMs: number } {
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  return {
    first: dateKeyInZone(startMs, timeZone),
    // The last instant of the event, so an event ending exactly at midnight does not
    // spill into the next day; a zero-length event stays on its start day.
    last: dateKeyInZone(Math.max(endMs - 1, startMs), timeZone),
    startMs,
    endMs,
  };
}

function timedStatus(startMs: number, endMs: number, now: number): EventStatus {
  const over = endMs > startMs ? now >= endMs : now > startMs;
  if (over) return "past";
  return now >= startMs ? "current" : "upcoming";
}

/**
 * Band an event is placed in, by its start time:
 * - starts on the date: band of the start (`bandOf`, wall clock in the zone);
 * - `night` (before `morningStart`) goes to the morning band: the board has no night
 *   band, and an early event is the first thing of the day, not something to hide;
 * - started on an earlier day (multi-day or midnight-crossing): the morning band too,
 *   as it is already under way when the day begins.
 */
function placementBand(
  startMs: number,
  firstDay: string,
  date: string,
  config: DayModelConfig,
): DayBand {
  if (firstDay < date) return "morning";
  const band = bandOf(startMs, config.bands, config.timeZone);
  return band === "night" ? "morning" : band;
}

/**
 * Builds the day view model for `date` (`YYYY-MM-DD` in `config.timeZone`) at `now`
 * (epoch ms). Past/current event status is only derived when `now` is on `date`.
 */
export function buildDayModel(
  agenda: Pick<AgendaResponse, "events" | "meals">,
  config: DayModelConfig,
  date: string,
  now: number,
): DayModel {
  const allDay: DayEvent[] = [];
  const placed: {
    bandIndex: number;
    startMs: number;
    title: string;
    item: DayEvent;
  }[] = [];
  const isToday = dateKeyInZone(now, config.timeZone) === date;

  for (const event of agenda.events) {
    if (event.allDay) {
      if (coversAllDay(event, date)) {
        allDay.push({
          event,
          status: "upcoming",
          continues: false,
          timeOfDay: null,
        });
      }
      continue;
    }
    const days = timedDays(event, config.timeZone);
    if (days.first > date || days.last < date) continue;
    const band = placementBand(days.startMs, days.first, date, config);
    placed.push({
      bandIndex: DAY_BANDS.indexOf(band),
      startMs: days.startMs,
      title: event.title,
      item: {
        event,
        status: isToday
          ? timedStatus(days.startMs, days.endMs, now)
          : "upcoming",
        continues: days.first < date,
        timeOfDay: band,
      },
    });
  }

  const events = placed
    .sort(
      (a, b) =>
        a.bandIndex - b.bandIndex ||
        a.startMs - b.startMs ||
        a.title.localeCompare(b.title),
    )
    .map((entry) => entry.item);

  const meals = agenda.meals
    .filter((meal) => meal.date === date)
    .sort((a, b) => MEAL_ORDER.indexOf(a.slot) - MEAL_ORDER.indexOf(b.slot));

  return {
    allDay,
    events,
    meals,
    isEmpty: allDay.length === 0 && meals.length === 0 && events.length === 0,
  };
}
