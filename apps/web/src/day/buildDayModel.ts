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
 * Pure model of the day view: which events and meals belong to "today" (a date key in
 * the config zone) and where they are placed. No React, no timers; every instant is
 * interpreted in the configured zone, never the device zone.
 */

export interface DayEvent {
  event: CalendarEvent;
  /** `upcoming` for all-day events (they have no time to recede from). */
  status: EventStatus;
}

export type BandStatus = "past" | "current" | "upcoming";

export interface DayBandModel {
  id: DayBand;
  status: BandStatus;
  events: DayEvent[];
}

export interface DayModel {
  /** All-day events (also multi-day ones) covering today, in feed order. */
  allDay: DayEvent[];
  /** Always the three bands in order morning, midday, evening. */
  bands: DayBandModel[];
  /** Today's meals ordered breakfast, lunch, dinner, unspecified. */
  meals: Meal[];
  /** No event and no meal today. */
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
function coversAllDay(event: CalendarEvent, today: string): boolean {
  // `end` is exclusive; a zero-length all-day event still counts for its start day.
  return event.start <= today && (today < event.end || event.start === today);
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
 * - starts today: band of the start (`bandOf`, wall clock in the zone);
 * - `night` (before `morningStart`) goes to the morning band: the board has no night
 *   band, and an early event is the first thing of the day, not something to hide;
 * - started on an earlier day (multi-day or midnight-crossing): the morning band too,
 *   as it is already under way when the day begins.
 */
function placementBand(
  startMs: number,
  firstDay: string,
  today: string,
  config: DayModelConfig,
): DayBand {
  if (firstDay < today) return "morning";
  const band = bandOf(startMs, config.bands, config.timeZone);
  return band === "night" ? "morning" : band;
}

function currentBandIndex(
  today: string,
  config: DayModelConfig,
  now: number,
): number {
  if (dateKeyInZone(now, config.timeZone) !== today) return -1;
  const band = bandOf(now, config.bands, config.timeZone);
  return band === "night" ? -1 : DAY_BANDS.indexOf(band);
}

/**
 * Builds the day view model for `today` (`YYYY-MM-DD` in `config.timeZone`) at `now`
 * (epoch ms). Past/current status is only derived when `now` is on `today`; before
 * `morningStart` no band is current and nothing is past.
 */
export function buildDayModel(
  agenda: Pick<AgendaResponse, "events" | "meals">,
  config: DayModelConfig,
  today: string,
  now: number,
): DayModel {
  const allDay: DayEvent[] = [];
  const placed = new Map<
    DayBand,
    { startMs: number; title: string; item: DayEvent }[]
  >(DAY_BANDS.map((band) => [band, []]));
  const isToday = dateKeyInZone(now, config.timeZone) === today;

  for (const event of agenda.events) {
    if (event.allDay) {
      if (coversAllDay(event, today)) {
        allDay.push({ event, status: "upcoming" });
      }
      continue;
    }
    const days = timedDays(event, config.timeZone);
    if (days.first > today || days.last < today) continue;
    const band = placementBand(days.startMs, days.first, today, config);
    placed.get(band)?.push({
      startMs: days.startMs,
      title: event.title,
      item: {
        event,
        status: isToday
          ? timedStatus(days.startMs, days.endMs, now)
          : "upcoming",
      },
    });
  }

  const current = currentBandIndex(today, config, now);
  const bands = DAY_BANDS.map((id, index): DayBandModel => {
    const events = [...(placed.get(id) ?? [])]
      .sort((a, b) => a.startMs - b.startMs || a.title.localeCompare(b.title))
      .map((entry) => entry.item);
    const status: BandStatus =
      current === -1 || index > current
        ? "upcoming"
        : index === current
          ? "current"
          : "past";
    return { id, status, events };
  });

  const meals = agenda.meals
    .filter((meal) => meal.date === today)
    .sort((a, b) => MEAL_ORDER.indexOf(a.slot) - MEAL_ORDER.indexOf(b.slot));

  return {
    allDay,
    bands,
    meals,
    isEmpty:
      allDay.length === 0 &&
      meals.length === 0 &&
      bands.every((band) => band.events.length === 0),
  };
}
