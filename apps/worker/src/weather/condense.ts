import {
  DateStringSchema,
  type TemperatureUnit,
  WEATHER_MAX_DAYS,
  type WeatherDay,
  weatherKind,
  type WeatherResponse,
  WeatherResponseSchema,
} from "@kidboard/shared";

import { type Forecast, WeatherResponseError } from "./openMeteo";

/**
 * Daytime of the clothing rules: 07:00-19:00 local time (config zone, which is the zone
 * the forecast was requested in). Open-Meteo's hourly `time` entries are local wall
 * times without offset, so a day is grouped by the date part of the string and the hour
 * part is compared directly; DST days with 23 or 25 entries need no special handling.
 *
 * Per the Open-Meteo forecast API docs (table "Hourly Parameter Definition",
 * https://open-meteo.com/en/docs), `apparent_temperature` is an instant value, while
 * `precipitation`, `precipitation_probability`, `snowfall` and `uv_index` describe the
 * preceding hour:
 *
 * - Instant values (`apparent_temperature`) count at 07:00 … 19:00 inclusive.
 * - Preceding-hour values (`precipitation`, `precipitation_probability`, `uv_index`) count
 *   at 08:00 … 19:00, i.e. exactly the hours that fall within 07:00-19:00.
 */
export const DAYTIME_START_HOUR = 7;
export const DAYTIME_END_HOUR = 19;

/**
 * Rain rule (PLAN T-48, used by `clothingFor` for ☔ + 👢): the day's WMO code is drizzle,
 * rain (incl. freezing rain and showers) or thunder, **or** the daytime precipitation
 * probability reaches {@link RAIN_PROBABILITY_FROM} % **and** the daytime precipitation
 * sum reaches {@link RAIN_SUM_FROM_MM} mm.
 */
export const RAIN_PROBABILITY_FROM = 50;
export const RAIN_SUM_FROM_MM = 0.5;

/**
 * Snow rule (🧤 + 👢): the daily snowfall sum is above 0 cm, or the day's WMO code is a
 * snow code (snow fall, snow grains, snow showers).
 */
export const SNOW_SUM_ABOVE_CM = 0;

const HOUR_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):\d{2}/;

/** Whole degrees; never `-0`. */
function whole(value: number): number {
  return Math.round(value) || 0;
}

function present(values: readonly (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null);
}

interface DaytimeValues {
  feels: (number | null)[];
  uv: (number | null)[];
  precipitation: (number | null)[];
  probability: (number | null)[];
}

/** Hourly values per local date, restricted to the daytime windows above. */
function daytimeByDate(hourly: Forecast["hourly"]): Map<string, DaytimeValues> {
  const byDate = new Map<string, DaytimeValues>();
  hourly.time.forEach((time, i) => {
    const match = HOUR_PATTERN.exec(time);
    if (match === null) {
      return;
    }
    const [, date = "", hourText = ""] = match;
    const hour = Number(hourText);
    if (hour < DAYTIME_START_HOUR || hour > DAYTIME_END_HOUR) {
      return;
    }
    let values = byDate.get(date);
    if (values === undefined) {
      values = { feels: [], uv: [], precipitation: [], probability: [] };
      byDate.set(date, values);
    }
    values.feels.push(hourly.apparent_temperature[i] ?? null);
    if (hour > DAYTIME_START_HOUR) {
      values.uv.push(hourly.uv_index[i] ?? null);
      values.precipitation.push(hourly.precipitation[i] ?? null);
      values.probability.push(hourly.precipitation_probability[i] ?? null);
    }
  });
  return byDate;
}

function isRainCode(code: number): boolean {
  const kind = weatherKind(code);
  return kind === "drizzle" || kind === "rain" || kind === "thunder";
}

/**
 * One day, or `null` when a core value is missing (code, high, low, or no daytime
 * feels-like value at all): such a day is skipped instead of failing the forecast.
 */
function condenseDay(
  daily: Forecast["daily"],
  i: number,
  daytime: Map<string, DaytimeValues>,
): WeatherDay | null {
  const date = daily.time[i];
  const code = daily.weather_code[i] ?? null;
  const tempMax = daily.temperature_2m_max[i] ?? null;
  const tempMin = daily.temperature_2m_min[i] ?? null;
  if (
    date === undefined ||
    !DateStringSchema.safeParse(date).success ||
    code === null ||
    !Number.isInteger(code) ||
    code < 0 ||
    tempMax === null ||
    tempMin === null
  ) {
    return null;
  }
  const hours = daytime.get(date);
  const feels = present(hours?.feels ?? []);
  if (feels.length === 0) {
    return null;
  }

  const probabilityMax = Math.max(0, ...present(hours?.probability ?? []));
  const precipitationSum = present(hours?.precipitation ?? []).reduce(
    (sum, v) => sum + v,
    0,
  );
  const rain =
    isRainCode(code) ||
    (probabilityMax >= RAIN_PROBABILITY_FROM &&
      precipitationSum >= RAIN_SUM_FROM_MM);
  const snow =
    weatherKind(code) === "snow" ||
    (daily.snowfall_sum[i] ?? 0) > SNOW_SUM_ABOVE_CM;

  // Daily UV maximum; without it the daytime hourly maximum; without both 0.
  const uvRaw =
    daily.uv_index_max[i] ?? Math.max(0, ...present(hours?.uv ?? []));
  const uvMax = Math.max(0, Math.round(uvRaw * 10) / 10);

  return {
    date,
    code,
    tempMax: whole(tempMax),
    tempMin: whole(tempMin),
    feelsMin: whole(Math.min(...feels)),
    feelsMax: whole(Math.max(...feels)),
    rain,
    snow,
    uvMax,
  };
}

/**
 * Condenses a validated Open-Meteo forecast to the `/api/weather` DTO (without the
 * place or coordinates). Throws {@link WeatherResponseError} when the current values are
 * missing or no day is usable.
 */
export function condenseForecast(
  forecast: Forecast,
  unit: TemperatureUnit,
  fetchedAtMs: number,
): WeatherResponse {
  const { temperature_2m: temperature, weather_code: code } = forecast.current;
  if (
    temperature === null ||
    code === null ||
    !Number.isInteger(code) ||
    code < 0
  ) {
    throw new WeatherResponseError("invalid-shape");
  }
  const daytime = daytimeByDate(forecast.hourly);
  const days: WeatherDay[] = [];
  for (
    let i = 0;
    i < forecast.daily.time.length && days.length < WEATHER_MAX_DAYS;
    i += 1
  ) {
    const day = condenseDay(forecast.daily, i, daytime);
    if (day !== null && !days.some((d) => d.date === day.date)) {
      days.push(day);
    }
  }
  if (days.length === 0) {
    throw new WeatherResponseError("invalid-shape");
  }
  const parsed = WeatherResponseSchema.safeParse({
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    unit,
    current: { temperature: whole(temperature), code },
    days,
    stale: false,
  });
  if (!parsed.success) {
    throw new WeatherResponseError("invalid-shape");
  }
  return parsed.data;
}
