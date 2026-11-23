import { clothingFor, WeatherResponseSchema } from "@kidboard/shared";
import { describe, expect, it } from "vitest";

import { condenseForecast } from "./condense";
import { type FixtureForecast, forecastFixture } from "./forecastFixture";
import { ForecastSchema, WeatherResponseError } from "./openMeteo";

const FETCHED = Date.parse("2026-11-23T08:00:00Z");

function condense(
  fx: FixtureForecast,
  unit: "celsius" | "fahrenheit" = "celsius",
): ReturnType<typeof condenseForecast> {
  return condenseForecast(ForecastSchema.parse(fx), unit, FETCHED);
}

function nth<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) {
    throw new Error(`no item ${String(i)}`);
  }
  return item;
}

function hourIndex(fx: FixtureForecast, time: string): number {
  const i = fx.hourly.time.indexOf(time);
  if (i < 0) {
    throw new Error(`no hour ${time}`);
  }
  return i;
}

describe("condenseForecast – fixture", () => {
  it("condenses all 7 days with rounded temperatures and daytime feels-like", () => {
    const result = condense(forecastFixture());
    expect(WeatherResponseSchema.parse(result)).toEqual(result);
    expect(result.fetchedAt).toBe("2026-11-23T08:00:00.000Z");
    expect(result.unit).toBe("celsius");
    expect(result.stale).toBe(false);
    expect(result.current).toEqual({ temperature: 5, code: 3 });
    expect(result.days).toEqual([
      {
        date: "2026-11-23",
        code: 3,
        tempMax: 10,
        tempMin: 3,
        feelsMin: 2,
        feelsMax: 8,
        rain: false,
        snow: false,
        uvMax: 1.2,
      },
      {
        date: "2026-11-24",
        code: 61,
        tempMax: 7,
        tempMin: 4,
        feelsMin: 1,
        feelsMax: 7,
        rain: true,
        snow: false,
        uvMax: 0.8,
      },
      {
        date: "2026-11-25",
        code: 0,
        tempMax: 15,
        tempMin: 3,
        feelsMin: 6,
        feelsMax: 12,
        rain: false,
        snow: false,
        uvMax: 3.3,
      },
      {
        date: "2026-11-26",
        code: 71,
        tempMax: 0,
        tempMin: -5,
        feelsMin: -6,
        feelsMax: 0,
        // A high precipitation probability alone (no daytime sum) is not rain.
        rain: false,
        snow: true,
        uvMax: 0.5,
      },
      {
        date: "2026-11-27",
        code: 2,
        tempMax: 25,
        tempMin: 16,
        feelsMin: 19,
        feelsMax: 25,
        rain: false,
        snow: false,
        uvMax: 6.1,
      },
      {
        date: "2026-11-28",
        code: 45,
        tempMax: 11,
        tempMin: 6,
        feelsMin: 5,
        feelsMax: 11,
        rain: false,
        snow: false,
        uvMax: 1.5,
      },
      {
        date: "2026-11-29",
        code: 1,
        tempMax: 19,
        tempMin: 8,
        feelsMin: 10,
        feelsMax: 16,
        rain: false,
        snow: false,
        uvMax: 4,
      },
    ]);
  });

  it("never emits -0", () => {
    const day = condense(forecastFixture()).days[3];
    expect(Object.is(day?.feelsMax, 0)).toBe(true);
    expect(JSON.stringify(day)).not.toContain("-0");
  });

  it("feeds clothingFor consistently (snow day and hot day)", () => {
    const { days } = condense(forecastFixture());
    expect(clothingFor(nth(days, 1)).map((i) => i.key)).toEqual([
      "umbrella",
      "boots",
      "jacket",
      "scarf",
    ]);
    expect(clothingFor(nth(days, 3)).map((i) => i.key)).toEqual([
      "boots",
      "jacket",
      "scarf",
      "gloves",
    ]);
    expect(clothingFor(nth(days, 4)).map((i) => i.key)).toEqual([
      "tshirt",
      "shorts",
      "cap",
      "sunscreen",
    ]);
  });

  it("ignores extra keys and passes the unit through", () => {
    const fx = forecastFixture() as FixtureForecast & Record<string, unknown>;
    fx.future_block = { anything: [1, 2, 3] };
    expect(condense(fx, "fahrenheit").unit).toBe("fahrenheit");
  });
});

describe("condenseForecast – daytime window 07:00–19:00", () => {
  it("uses only hours 07:00 … 19:00 for feels-like", () => {
    const fx = forecastFixture();
    fx.hourly.apparent_temperature[hourIndex(fx, "2026-11-23T06:00")] = -30;
    fx.hourly.apparent_temperature[hourIndex(fx, "2026-11-23T20:00")] = 40;
    let day = condense(fx).days[0];
    expect([day?.feelsMin, day?.feelsMax]).toEqual([2, 8]);

    fx.hourly.apparent_temperature[hourIndex(fx, "2026-11-23T07:00")] = -10.4;
    fx.hourly.apparent_temperature[hourIndex(fx, "2026-11-23T19:00")] = 30.6;
    day = condense(fx).days[0];
    expect([day?.feelsMin, day?.feelsMax]).toEqual([-10, 31]);
  });

  it("rain from probability >= 50 and daytime sum >= 0.5 mm (preceding-hour values 08:00 … 19:00)", () => {
    const rainy = (
      edit: (fx: FixtureForecast, at: (t: string) => number) => void,
    ): boolean | undefined => {
      const fx = forecastFixture();
      edit(fx, (t) => hourIndex(fx, t));
      return condense(fx).days[5]?.rain; // 2026-11-28, fog code 45
    };
    const set =
      (prob: number, mm: number, time: string) =>
      (fx: FixtureForecast, at: (t: string) => number): void => {
        fx.hourly.precipitation_probability[at(time)] = prob;
        fx.hourly.precipitation[at(time)] = mm;
      };
    expect(rainy(() => undefined)).toBe(false);
    expect(rainy(set(50, 0.5, "2026-11-28T12:00"))).toBe(true);
    expect(rainy(set(49, 0.5, "2026-11-28T12:00"))).toBe(false);
    expect(rainy(set(50, 0.4, "2026-11-28T12:00"))).toBe(false);
    // 19:00 holds 18:00-19:00 (inside); 07:00 holds 06:00-07:00 and 20:00 19:00-20:00 (outside).
    expect(rainy(set(80, 3, "2026-11-28T19:00"))).toBe(true);
    expect(rainy(set(80, 3, "2026-11-28T07:00"))).toBe(false);
    expect(rainy(set(80, 3, "2026-11-28T20:00"))).toBe(false);
    // The sum adds up over the daytime hours.
    expect(
      rainy((fx, at) => {
        set(60, 0.3, "2026-11-28T09:00")(fx, at);
        set(10, 0.3, "2026-11-28T15:00")(fx, at);
      }),
    ).toBe(true);
  });

  it.each([
    [51, true],
    [57, true],
    [66, true],
    [80, true],
    [95, true],
    [3, false],
    [45, false],
    [71, false],
  ])("rain by daily code %i -> %s", (code, rain) => {
    const fx = forecastFixture();
    fx.daily.weather_code[0] = code;
    expect(condense(fx).days[0]?.rain).toBe(rain);
  });

  it.each([
    [71, 0, true],
    [77, 0, true],
    [85, 0, true],
    [86, 0, true],
    [3, 0.1, true],
    [3, 0, false],
    [61, 0, false],
  ])("snow by code %i / snowfall_sum %s cm -> %s", (code, sum, snow) => {
    const fx = forecastFixture();
    fx.daily.weather_code[0] = code;
    fx.daily.snowfall_sum[0] = sum;
    expect(condense(fx).days[0]?.snow).toBe(snow);
  });
});

/** One day of local hour strings as Open-Meteo would list them. */
function dayTimes(date: string, hours: readonly number[]): string[] {
  return hours.map((h) => `${date}T${String(h).padStart(2, "0")}:00`);
}

const ALL_HOURS = Array.from({ length: 24 }, (_, h) => h);

function dstForecast(
  days: { date: string; hours: number[] }[],
): FixtureForecast {
  const fx = forecastFixture();
  const time = days.flatMap((d) => dayTimes(d.date, d.hours));
  // Value = 100 × day index + hour: a misaligned day would pick up another day's values.
  const apparent = days.flatMap((d, i) => d.hours.map((h) => i * 100 + h));
  fx.hourly = {
    time,
    apparent_temperature: apparent,
    precipitation_probability: time.map(() => 0),
    precipitation: time.map(() => 0),
    snowfall: time.map(() => 0),
    uv_index: time.map(() => 0),
  };
  const n = days.length;
  fx.daily = {
    time: days.map((d) => d.date),
    weather_code: Array.from({ length: n }, () => 3),
    temperature_2m_max: Array.from({ length: n }, () => 10),
    temperature_2m_min: Array.from({ length: n }, () => 0),
    uv_index_max: Array.from({ length: n }, () => 1),
    precipitation_probability_max: Array.from({ length: n }, () => 0),
    precipitation_sum: Array.from({ length: n }, () => 0),
    snowfall_sum: Array.from({ length: n }, () => 0),
  };
  return fx;
}

describe("condenseForecast – DST days (Europe/Berlin)", () => {
  it("spring forward (23 hours, no 02:00) keeps every following day aligned", () => {
    const fx = dstForecast([
      { date: "2026-03-28", hours: ALL_HOURS },
      { date: "2026-03-29", hours: ALL_HOURS.filter((h) => h !== 2) },
      { date: "2026-03-30", hours: ALL_HOURS },
    ]);
    expect(fx.hourly.time).toHaveLength(71);
    const days = condense(fx).days;
    expect(days.map((d) => [d.date, d.feelsMin, d.feelsMax])).toEqual([
      ["2026-03-28", 7, 19],
      ["2026-03-29", 107, 119],
      ["2026-03-30", 207, 219],
    ]);
  });

  it("fall back (25 hours, 02:00 twice) keeps every following day aligned", () => {
    const fx = dstForecast([
      { date: "2026-10-24", hours: ALL_HOURS },
      { date: "2026-10-25", hours: [0, 1, 2, ...ALL_HOURS.slice(2)] },
      { date: "2026-10-26", hours: ALL_HOURS },
    ]);
    expect(fx.hourly.time).toHaveLength(73);
    const days = condense(fx).days;
    expect(days.map((d) => [d.date, d.feelsMin, d.feelsMax])).toEqual([
      ["2026-10-24", 7, 19],
      ["2026-10-25", 107, 119],
      ["2026-10-26", 207, 219],
    ]);
  });
});

describe("condenseForecast – missing data", () => {
  it("skips days with a missing code, high, low or without daytime feels-like", () => {
    const fx = forecastFixture();
    fx.daily.weather_code[1] = null;
    fx.daily.temperature_2m_max[2] = null;
    fx.daily.temperature_2m_min[3] = null;
    for (let h = 7; h <= 19; h += 1) {
      fx.hourly.apparent_temperature[
        hourIndex(fx, `2026-11-27T${String(h).padStart(2, "0")}:00`)
      ] = null;
    }
    // Shorter arrays count as missing values for the last day.
    fx.daily.temperature_2m_min = fx.daily.temperature_2m_min.slice(0, 6);
    expect(condense(fx).days.map((d) => d.date)).toEqual([
      "2026-11-23",
      "2026-11-28",
    ]);
  });

  it("tolerates missing optional values (UV, precipitation, snowfall)", () => {
    const fx = forecastFixture();
    fx.daily.uv_index_max[0] = null;
    fx.daily.snowfall_sum[0] = null;
    fx.hourly.precipitation[hourIndex(fx, "2026-11-23T12:00")] = null;
    const day = condense(fx).days[0];
    // UV falls back to the daytime hourly maximum (1 from 10:00 to 15:00).
    expect(day?.uvMax).toBe(1);

    // uv_index is a preceding-hour value: 07:00 (06-07) is outside, 19:00 (18-19) inside.
    const edge = forecastFixture();
    edge.daily.uv_index_max[0] = null;
    edge.hourly.uv_index[hourIndex(edge, "2026-11-23T07:00")] = 9;
    expect(condense(edge).days[0]?.uvMax).toBe(1);
    edge.hourly.uv_index[hourIndex(edge, "2026-11-23T19:00")] = 2.5;
    expect(condense(edge).days[0]?.uvMax).toBe(2.5);
    expect(day?.snow).toBe(false);
    expect(day?.rain).toBe(false);

    const bare = ForecastSchema.parse({
      current: { temperature_2m: 1, weather_code: 0 },
      hourly: {
        time: ["2026-11-23T12:00"],
        apparent_temperature: [0.4],
      },
      daily: {
        time: ["2026-11-23"],
        weather_code: [0],
        temperature_2m_max: [2],
        temperature_2m_min: [-1],
      },
    });
    expect(condenseForecast(bare, "celsius", FETCHED).days).toEqual([
      {
        date: "2026-11-23",
        code: 0,
        tempMax: 2,
        tempMin: -1,
        feelsMin: 0,
        feelsMax: 0,
        rain: false,
        snow: false,
        uvMax: 0,
      },
    ]);
  });

  it("skips malformed dates and duplicate days, and keeps at most 7 days", () => {
    const fx = forecastFixture();
    fx.daily.time[1] = "24.11.2026";
    fx.daily.time[2] = "2026-11-23";
    expect(condense(fx).days.map((d) => d.date)).toEqual([
      "2026-11-23",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);

    const long = forecastFixture();
    long.daily.time.push("2026-11-30");
    for (const key of Object.keys(FIXTURE_DAILY_KEYS) as DailyKey[]) {
      long.daily[key].push(long.daily[key][0] ?? null);
    }
    long.hourly.time.push("2026-11-30T12:00");
    long.hourly.apparent_temperature.push(1);
    expect(condense(long).days).toHaveLength(7);
  });

  it("rejects a forecast without current values or without any usable day", () => {
    const noCurrent = forecastFixture();
    noCurrent.current.temperature_2m = null;
    expect(() => condense(noCurrent)).toThrow(WeatherResponseError);

    const badCode = forecastFixture();
    badCode.current.weather_code = 2.5;
    expect(() => condense(badCode)).toThrow(WeatherResponseError);

    const noDays = forecastFixture();
    noDays.daily.weather_code = noDays.daily.weather_code.map(() => null);
    expect(() => condense(noDays)).toThrow(WeatherResponseError);
  });
});

const FIXTURE_DAILY_KEYS = {
  weather_code: true,
  temperature_2m_max: true,
  temperature_2m_min: true,
  uv_index_max: true,
  precipitation_probability_max: true,
  precipitation_sum: true,
  snowfall_sum: true,
} as const;
type DailyKey = keyof typeof FIXTURE_DAILY_KEYS;
