/**
 * Synthetic Open-Meteo forecast responses for tests (never real data), modelled on the
 * documented response of `GET /v1/forecast` with `timezone`, `current`, `hourly` and
 * `daily`: local wall times without offset, `*_units` blocks and extra keys the worker
 * must ignore. The coordinates are synthetic markers that tests assert never leak.
 */

/** Marker coordinates of the synthetic geocoding hit. */
export const FIXTURE_LATITUDE = 12.3456;
export const FIXTURE_LONGITUDE = 65.4321;

export const FIXTURE_DATES = [
  "2026-11-23",
  "2026-11-24",
  "2026-11-25",
  "2026-11-26",
  "2026-11-27",
  "2026-11-28",
  "2026-11-29",
] as const;

/** Daily values per fixture date (index = day). */
export const FIXTURE_DAILY = {
  weather_code: [3, 61, 0, 71, 2, 45, 1],
  temperature_2m_max: [9.6, 7.2, 14.5, 0.4, 24.6, 11, 18.5],
  temperature_2m_min: [3.4, 4.1, 2.5, -4.6, 15.5, 6.2, 8],
  uv_index_max: [1.2, 0.8, 3.25, 0.5, 6.1, 1.5, 4],
  precipitation_probability_max: [10, 90, 0, 80, 5, 20, 0],
  precipitation_sum: [0, 8.4, 0, 1.2, 0, 0.1, 0],
  snowfall_sum: [0, 0, 0, 3.5, 0, 0, 0],
};

/**
 * Feels-like base per day; hourly `apparent_temperature` = base − 4 + hour / 2, so the
 * daytime window 07:00–19:00 spans base − 0.5 … base + 5.5 and the night hours lie outside
 * it on both ends (00:00 = base − 4, 23:00 = base + 7.5).
 */
export const FIXTURE_FEELS_BASE = [2, 1, 6, -6, 19, 5, 10];

export interface FixtureForecast {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units: Record<string, string>;
  current: {
    time: string;
    interval: number;
    temperature_2m: number | null;
    weather_code: number | null;
  };
  hourly_units: Record<string, string>;
  hourly: {
    time: string[];
    apparent_temperature: (number | null)[];
    precipitation_probability: (number | null)[];
    precipitation: (number | null)[];
    snowfall: (number | null)[];
    uv_index: (number | null)[];
  };
  daily_units: Record<string, string>;
  daily: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    uv_index_max: (number | null)[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum: (number | null)[];
    snowfall_sum: (number | null)[];
  };
}

function hours(): string[] {
  return Array.from(
    { length: 24 },
    (_, h) => `${String(h).padStart(2, "0")}:00`,
  );
}

/** A fresh, mutable 7-day forecast in Europe/Berlin (celsius). */
export function forecastFixture(): FixtureForecast {
  const time: string[] = [];
  const apparent: number[] = [];
  const probability: number[] = [];
  const precipitation: number[] = [];
  const snowfall: number[] = [];
  const uv: number[] = [];
  FIXTURE_DATES.forEach((date, d) => {
    const base = FIXTURE_FEELS_BASE[d] ?? 0;
    hours().forEach((hh, h) => {
      time.push(`${date}T${hh}`);
      apparent.push(base - 4 + h / 2);
      probability.push(FIXTURE_DAILY.precipitation_probability_max[d] ?? 0);
      // Day 2 (rain code): 0.7 mm per hour from 10:00 to 21:00.
      precipitation.push(d === 1 && h >= 10 && h <= 21 ? 0.7 : 0);
      snowfall.push(d === 3 && h >= 8 && h <= 14 ? 0.5 : 0);
      uv.push(h >= 10 && h <= 15 ? 1 : 0);
    });
  });
  return {
    latitude: FIXTURE_LATITUDE,
    longitude: FIXTURE_LONGITUDE,
    generationtime_ms: 0.123,
    utc_offset_seconds: 3600,
    timezone: "Europe/Berlin",
    timezone_abbreviation: "GMT+1",
    elevation: 42,
    current_units: {
      time: "iso8601",
      interval: "seconds",
      temperature_2m: "°C",
      weather_code: "wmo code",
    },
    current: {
      time: "2026-11-23T09:00",
      interval: 900,
      temperature_2m: 4.6,
      weather_code: 3,
    },
    hourly_units: {
      time: "iso8601",
      apparent_temperature: "°C",
      precipitation_probability: "%",
      precipitation: "mm",
      snowfall: "cm",
      uv_index: "",
    },
    hourly: {
      time,
      apparent_temperature: apparent,
      precipitation_probability: probability,
      precipitation,
      snowfall,
      uv_index: uv,
    },
    daily_units: {
      time: "iso8601",
      weather_code: "wmo code",
      temperature_2m_max: "°C",
      temperature_2m_min: "°C",
      uv_index_max: "",
      precipitation_probability_max: "%",
      precipitation_sum: "mm",
      snowfall_sum: "cm",
    },
    daily: {
      time: [...FIXTURE_DATES],
      weather_code: [...FIXTURE_DAILY.weather_code],
      temperature_2m_max: [...FIXTURE_DAILY.temperature_2m_max],
      temperature_2m_min: [...FIXTURE_DAILY.temperature_2m_min],
      uv_index_max: [...FIXTURE_DAILY.uv_index_max],
      precipitation_probability_max: [
        ...FIXTURE_DAILY.precipitation_probability_max,
      ],
      precipitation_sum: [...FIXTURE_DAILY.precipitation_sum],
      snowfall_sum: [...FIXTURE_DAILY.snowfall_sum],
    },
  };
}
