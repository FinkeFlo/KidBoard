import { describe, expect, it } from "vitest";

import { parseConfig, type WeatherConfig } from "../config";
import {
  effectiveWeather,
  ParentWeatherResponseSchema,
  WEATHER_PLACE_MAX,
  WeatherSettingSchema,
} from "./setting";

const MARKER = "TESTONLY-Weatherplace";

function configWeather(weather: unknown): WeatherConfig | undefined {
  const parsed = parseConfig({ weather });
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.config.weather;
}

describe("WeatherSettingSchema", () => {
  it("accepts off and a place block, trimming the place", () => {
    expect(WeatherSettingSchema.parse({ off: true })).toEqual({ off: true });
    expect(
      WeatherSettingSchema.parse({
        place: `  ${MARKER} `,
        country: "DE",
        unit: "fahrenheit",
      }),
    ).toEqual({ place: MARKER, country: "DE", unit: "fahrenheit" });
    expect(
      WeatherSettingSchema.parse({ place: "Graz", unit: "celsius" }),
    ).toEqual({ place: "Graz", unit: "celsius" });
  });

  it("keeps umlauts and accepts the length limit exactly", () => {
    const long = "Ö".repeat(WEATHER_PLACE_MAX);
    expect(
      WeatherSettingSchema.parse({ place: long, unit: "celsius" }),
    ).toEqual({ place: long, unit: "celsius" });
    expect(
      WeatherSettingSchema.safeParse({
        place: `${long}x`,
        unit: "celsius",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["off false", { off: false }],
    ["off with a place", { off: true, place: "Graz", unit: "celsius" }],
    ["empty place", { place: "", unit: "celsius" }],
    ["blank place", { place: "   ", unit: "celsius" }],
    ["control character", { place: "Gr\u0000az", unit: "celsius" }],
    ["C1 control character", { place: "Gr\u0085az", unit: "celsius" }],
    ["newline", { place: "Gr\naz", unit: "celsius" }],
    ["place not a string", { place: 7, unit: "celsius" }],
    ["missing unit", { place: "Graz" }],
    ["unknown unit", { place: "Graz", unit: "kelvin" }],
    ["lower-case country", { place: "Graz", country: "at", unit: "celsius" }],
    [
      "three-letter country",
      { place: "Graz", country: "AUT", unit: "celsius" },
    ],
    ["coordinates", { latitude: 47.07, longitude: 15.44, unit: "celsius" }],
    ["unknown key", { place: "Graz", unit: "celsius", latitude: 47.07 }],
    ["null", null],
    ["array", [{ off: true }]],
    ["empty object", {}],
  ])("rejects %s", (_name, value) => {
    expect(WeatherSettingSchema.safeParse(value).success).toBe(false);
  });
});

describe("effectiveWeather", () => {
  const fromConfig = configWeather({ place: "Hamburg", country: "DE" });

  it("uses the config block without a setting", () => {
    expect(effectiveWeather(null, fromConfig)).toEqual(fromConfig);
    expect(effectiveWeather(null, undefined)).toBeUndefined();
  });

  it("lets the editor setting win over the config", () => {
    expect(
      effectiveWeather({ place: MARKER, unit: "fahrenheit" }, fromConfig),
    ).toEqual({ place: MARKER, unit: "fahrenheit" });
    expect(
      effectiveWeather(
        { place: MARKER, country: "AT", unit: "celsius" },
        undefined,
      ),
    ).toEqual({ place: MARKER, country: "AT", unit: "celsius" });
  });

  it("turns weather off even when the config has a block", () => {
    expect(effectiveWeather({ off: true }, fromConfig)).toBeUndefined();
    expect(
      effectiveWeather(
        { off: true },
        configWeather({ latitude: 53.55, longitude: 9.99 }),
      ),
    ).toBeUndefined();
  });

  it("never carries coordinates of the config into an editor place", () => {
    const result = effectiveWeather(
      { place: MARKER, unit: "celsius" },
      configWeather({ latitude: 53.55, longitude: 9.99 }),
    );
    expect(result).not.toHaveProperty("latitude");
    expect(result).not.toHaveProperty("longitude");
  });
});

describe("ParentWeatherResponseSchema", () => {
  it("parses every source and status", () => {
    expect(
      ParentWeatherResponseSchema.parse({
        source: "config",
        weather: { unit: "celsius", coordinates: true },
        status: "ok",
      }).weather?.coordinates,
    ).toBe(true);
    expect(
      ParentWeatherResponseSchema.parse({
        source: "editor",
        weather: null,
        status: "off",
      }).weather,
    ).toBeNull();
    expect(
      ParentWeatherResponseSchema.parse({
        source: "none",
        weather: null,
        status: "off",
        extra: 1,
      }),
    ).toEqual({ source: "none", weather: null, status: "off" });
  });

  it("rejects unknown sources, statuses and coordinate values", () => {
    expect(
      ParentWeatherResponseSchema.safeParse({
        source: "kv",
        weather: null,
        status: "off",
      }).success,
    ).toBe(false);
    expect(
      ParentWeatherResponseSchema.safeParse({
        source: "editor",
        weather: null,
        status: "broken",
      }).success,
    ).toBe(false);
    expect(
      ParentWeatherResponseSchema.safeParse({
        source: "config",
        weather: { unit: "celsius", coordinates: 53.55 },
        status: "ok",
      }).success,
    ).toBe(false);
  });
});
