import {
  addCalendarDays,
  clothingFor,
  type ClothingItem,
  dateKeyInZone,
  type PublicConfig,
  type TemperatureUnit,
  type WeatherDay,
  weatherIcon,
  type WeatherKind,
  weatherKind,
  type WeatherResponse,
} from "@kidboard/shared";

import { minuteOfDay, timeOfDayMinutes } from "../time";

/*
 * What the board shows of the weather (T-49, ADR-0015). Pure: every instant is read in
 * `config.timeZone`, never in the device zone.
 */

const HOUR_MS = 60 * 60_000;

/** A forecast fetched longer ago than this is not shown at all. */
export const WEATHER_MAX_AGE_MS = 24 * HOUR_MS;

/**
 * Today's chip says "now 8°" only while the current temperature is at most this old;
 * an older one (the board was offline) shows the day's high like the other days. The
 * board refetches every 30 minutes, so a working board always shows "now".
 */
export const CURRENT_MAX_AGE_MS = 2 * HOUR_MS;

/** One day's chip. */
export interface DayWeather {
  /** `YYYY-MM-DD` in the config zone. */
  date: string;
  icon: string;
  kind: WeatherKind;
  /** Daily high, whole degrees of the forecast's unit. */
  high: number;
  /** Today only, while fresh ({@link CURRENT_MAX_AGE_MS}): the current temperature. */
  current?: number;
}

/**
 * What to wear: until `bands.eveningStart` for today, from then until midnight for
 * tomorrow (as the 🎒 area, so it can be laid out the evening before).
 */
export interface ClothingRowModel {
  when: "today" | "tomorrow";
  /** The day the clothes are for (`YYYY-MM-DD`, config zone). */
  date: string;
  /** One to five items in the fixed order of `clothingFor`. */
  items: ClothingItem[];
}

export interface BoardWeather {
  unit: TemperatureUnit;
  /** Chips by date, from today on (days before today are dropped). */
  days: ReadonlyMap<string, DayWeather>;
  /** Today's clothing row; `undefined` when there is nothing to wear or no forecast. */
  clothing: ClothingRowModel | undefined;
}

export type BoardWeatherConfig = Pick<PublicConfig, "timeZone" | "bands">;

function chip(day: WeatherDay): DayWeather {
  return {
    date: day.date,
    icon: weatherIcon(day.code),
    kind: weatherKind(day.code),
    high: day.tempMax,
  };
}

/**
 * The board's weather at `now` (epoch ms), or `undefined` when there is nothing to show:
 * no forecast, or one fetched more than {@link WEATHER_MAX_AGE_MS} away from `now`
 * (either way, so a wrong clock never shows an old forecast as today's). Days before
 * today (config zone) are dropped. Today's chip carries the current temperature while it
 * is fresh; the icon is always the day's (the current code may be a night code).
 */
export function buildBoardWeather(
  response: WeatherResponse | undefined,
  config: BoardWeatherConfig,
  now: number,
): BoardWeather | undefined {
  if (response === undefined) return undefined;
  const age = now - Date.parse(response.fetchedAt);
  if (!Number.isFinite(age) || Math.abs(age) > WEATHER_MAX_AGE_MS) {
    return undefined;
  }
  const today = dateKeyInZone(now, config.timeZone);
  const days = new Map<string, DayWeather>();
  for (const day of response.days) {
    if (day.date < today || days.has(day.date)) continue;
    days.set(day.date, chip(day));
  }
  const todayChip = days.get(today);
  if (todayChip !== undefined && Math.abs(age) <= CURRENT_MAX_AGE_MS) {
    days.set(today, { ...todayChip, current: response.current.temperature });
  }

  const evening =
    minuteOfDay(now, config.timeZone) >=
    timeOfDayMinutes(config.bands.eveningStart);
  const date = evening ? addCalendarDays(today, 1) : today;
  const forecast = response.days.find((day) => day.date === date);
  const items =
    forecast === undefined ? [] : clothingFor(forecast, response.unit);
  return {
    unit: response.unit,
    days,
    clothing:
      items.length === 0
        ? undefined
        : { when: evening ? "tomorrow" : "today", date, items },
  };
}
