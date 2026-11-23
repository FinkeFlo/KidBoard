import { describe, expect, it } from "vitest";

import {
  configFixture,
  weatherDayFixture,
  weatherFixture,
} from "../data/testing.test-utils";
import {
  buildBoardWeather,
  CURRENT_MAX_AGE_MS,
  WEATHER_MAX_AGE_MS,
} from "./buildBoardWeather";

const CONFIG = configFixture();
const at = (iso: string): number => Date.parse(iso);
/** 2026-11-22 09:00 Berlin: an hour after the fixture's `fetchedAt`. */
const MORNING = at("2026-11-22T09:00:00+01:00");

describe("buildBoardWeather", () => {
  it("shows nothing without a forecast", () => {
    expect(buildBoardWeather(undefined, CONFIG, MORNING)).toBeUndefined();
  });

  it("gives every day from today a chip: icon, kind and daily high", () => {
    const weather = buildBoardWeather(weatherFixture(), CONFIG, MORNING);
    expect([...(weather?.days.keys() ?? [])]).toEqual([
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
    ]);
    expect(weather?.days.get("2026-11-23")).toEqual({
      date: "2026-11-23",
      icon: "🌧️",
      kind: "rain",
      high: 7,
    });
    expect(weather?.unit).toBe("celsius");
  });

  it("puts the current temperature on today's chip while it is fresh", () => {
    const fetched = at("2026-11-22T08:00:00+01:00");
    const today = (now: number): unknown =>
      buildBoardWeather(weatherFixture(), CONFIG, now)?.days.get("2026-11-22");
    expect(today(fetched + CURRENT_MAX_AGE_MS)).toEqual({
      date: "2026-11-22",
      icon: "🌤️",
      kind: "mostlyClear",
      high: 12,
      current: 8,
    });
    // One minute later the "now" value is too old: the chip falls back to the high.
    expect(today(fetched + CURRENT_MAX_AGE_MS + 60_000)).toEqual({
      date: "2026-11-22",
      icon: "🌤️",
      kind: "mostlyClear",
      high: 12,
    });
    // Other days never carry a current temperature.
    expect(
      buildBoardWeather(weatherFixture(), CONFIG, fetched)?.days.get(
        "2026-11-23",
      )?.current,
    ).toBeUndefined();
  });

  it("drops a forecast fetched more than 24 h away from now (either way)", () => {
    const fetched = at("2026-11-22T08:00:00+01:00");
    expect(
      buildBoardWeather(weatherFixture(), CONFIG, fetched + WEATHER_MAX_AGE_MS),
    ).toBeDefined();
    expect(
      buildBoardWeather(
        weatherFixture(),
        CONFIG,
        fetched + WEATHER_MAX_AGE_MS + 1,
      ),
    ).toBeUndefined();
    expect(
      buildBoardWeather(
        weatherFixture(),
        CONFIG,
        fetched - WEATHER_MAX_AGE_MS - 1,
      ),
    ).toBeUndefined();
  });

  it("drops days before today (config zone) from a forecast of yesterday", () => {
    // Fetched yesterday 20:00, read today 07:00 (within 24 h).
    const forecast = weatherFixture({
      fetchedAt: "2026-11-21T20:00:00+01:00",
      days: [
        weatherDayFixture("2026-11-21", { tempMax: 3 }),
        weatherDayFixture("2026-11-22", { tempMax: 5 }),
      ],
    });
    const weather = buildBoardWeather(
      forecast,
      CONFIG,
      at("2026-11-22T07:00:00+01:00"),
    );
    expect([...(weather?.days.keys() ?? [])]).toEqual(["2026-11-22"]);
    // Eleven hours old: no "now" value.
    expect(weather?.days.get("2026-11-22")?.current).toBeUndefined();
  });

  it("reads today in the config zone, never the device zone", () => {
    // 2026-11-22 23:30 Berlin is still the 22nd there (and the 22nd in UTC), but in
    // Tokyo it is already the 23rd: the config zone decides which day is today.
    const now = at("2026-11-22T23:30:00+01:00");
    const forecast = weatherFixture({ fetchedAt: "2026-11-22T23:00:00+01:00" });
    const berlin = buildBoardWeather(forecast, CONFIG, now);
    const tokyo = buildBoardWeather(
      forecast,
      configFixture({ timeZone: "Asia/Tokyo" }),
      now,
    );
    expect(berlin?.days.has("2026-11-22")).toBe(true);
    expect(tokyo?.days.has("2026-11-22")).toBe(false);
    expect(tokyo?.days.get("2026-11-23")?.current).toBe(8);
  });

  it("shows today's clothes until eveningStart, then tomorrow's", () => {
    const forecast = weatherFixture();
    const morning = buildBoardWeather(
      forecast,
      CONFIG,
      at("2026-11-22T16:59:00+01:00"),
    );
    expect(morning?.clothing).toEqual({
      when: "today",
      date: "2026-11-22",
      items: [{ key: "jacket", emoji: "🧥" }],
    });
    // Exactly at eveningStart (default 17:00): tomorrow, cold and rainy.
    const evening = buildBoardWeather(
      forecast,
      CONFIG,
      at("2026-11-22T17:00:00+01:00"),
    );
    expect(evening?.clothing?.when).toBe("tomorrow");
    expect(evening?.clothing?.date).toBe("2026-11-23");
    expect(evening?.clothing?.items.map((item) => item.emoji)).toEqual([
      "☔",
      "👢",
      "🧥",
      "🧣",
    ]);
    // Until midnight; after it the new day's clothes are "today" again.
    const late = buildBoardWeather(
      forecast,
      CONFIG,
      at("2026-11-22T23:59:00+01:00"),
    );
    expect(late?.clothing?.date).toBe("2026-11-23");
    const nextMorning = buildBoardWeather(
      forecast,
      CONFIG,
      at("2026-11-23T00:00:00+01:00"),
    );
    expect(nextMorning?.clothing).toMatchObject({
      when: "today",
      date: "2026-11-23",
    });
  });

  it("follows a configured eveningStart", () => {
    const config = configFixture({
      bands: {
        morningStart: "06:00",
        middayStart: "11:00",
        eveningStart: "19:30",
      },
    });
    const weather = buildBoardWeather(
      weatherFixture(),
      config,
      at("2026-11-22T19:00:00+01:00"),
    );
    expect(weather?.clothing?.when).toBe("today");
  });

  it("has no clothing row when the day needs nothing or is not in the forecast", () => {
    const warm = weatherFixture({
      days: [
        weatherDayFixture("2026-11-22", {
          feelsMin: 15,
          feelsMax: 18,
          uvMax: 1,
        }),
      ],
    });
    const weather = buildBoardWeather(warm, CONFIG, MORNING);
    expect(weather?.days.size).toBe(1);
    expect(weather?.clothing).toBeUndefined();
    // Evening, but tomorrow is missing from the forecast.
    expect(
      buildBoardWeather(warm, CONFIG, at("2026-11-22T18:00:00+01:00"))
        ?.clothing,
    ).toBeUndefined();
  });

  it("converts Fahrenheit forecasts for the clothing thresholds", () => {
    // 50 °F feels-like is 10 °C: below the 12 °C jacket threshold; 44 °F (6.7 °C) is
    // above the 5 °C scarf threshold.
    const forecast = weatherFixture({
      unit: "fahrenheit",
      days: [
        weatherDayFixture("2026-11-22", {
          tempMax: 54,
          feelsMin: 44,
          feelsMax: 50,
        }),
      ],
    });
    const weather = buildBoardWeather(forecast, CONFIG, MORNING);
    expect(weather?.unit).toBe("fahrenheit");
    expect(weather?.clothing?.items.map((item) => item.key)).toEqual([
      "jacket",
    ]);
    expect(weather?.days.get("2026-11-22")?.high).toBe(54);
  });
});
