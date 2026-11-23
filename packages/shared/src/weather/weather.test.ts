import { describe, expect, it } from "vitest";

import { CLOTHING_MAX_ITEMS, clothingFor } from "./clothingFor";
import { type WeatherDay, WeatherResponseSchema } from "./schema";
import { weatherIcon, weatherKind } from "./weatherIcon";

const mild: WeatherDay = {
  date: "2026-05-04",
  code: 3,
  tempMax: 16,
  tempMin: 10,
  feelsMin: 14,
  feelsMax: 16,
  rain: false,
  snow: false,
  uvMax: 1,
};

function keys(
  day: Partial<WeatherDay>,
  unit: "celsius" | "fahrenheit" = "celsius",
): string[] {
  return clothingFor({ ...mild, ...day }, unit).map((i) => i.key);
}

describe("weatherIcon / weatherKind", () => {
  it.each([
    [0, "☀️", "clear"],
    [1, "🌤️", "mostlyClear"],
    [2, "⛅", "partlyCloudy"],
    [3, "☁️", "cloudy"],
    [45, "🌫️", "fog"],
    [48, "🌫️", "fog"],
    [51, "🌦️", "drizzle"],
    [53, "🌦️", "drizzle"],
    [55, "🌦️", "drizzle"],
    [56, "🌦️", "drizzle"],
    [57, "🌦️", "drizzle"],
    [61, "🌧️", "rain"],
    [63, "🌧️", "rain"],
    [65, "🌧️", "rain"],
    [66, "🌧️", "rain"],
    [67, "🌧️", "rain"],
    [71, "🌨️", "snow"],
    [73, "🌨️", "snow"],
    [75, "🌨️", "snow"],
    [77, "🌨️", "snow"],
    [80, "🌧️", "rain"],
    [81, "🌧️", "rain"],
    [82, "🌧️", "rain"],
    [85, "🌨️", "snow"],
    [86, "🌨️", "snow"],
    [95, "⛈️", "thunder"],
    [96, "⛈️", "thunder"],
    [99, "⛈️", "thunder"],
  ])("code %i -> %s (%s)", (code, icon, kind) => {
    expect(weatherIcon(code)).toBe(icon);
    expect(weatherKind(code)).toBe(kind);
  });

  it("maps unknown codes to a cloud and never to a moon", () => {
    for (const code of [-1, 4, 44, 58, 100, 1.5, Number.NaN]) {
      expect(weatherIcon(code)).toBe("☁️");
      expect(weatherKind(code)).toBe("cloudy");
    }
    for (let code = 0; code <= 99; code += 1) {
      expect(weatherIcon(code)).not.toBe("🌙");
    }
  });
});

describe("clothingFor thresholds (celsius)", () => {
  it("jacket below 12, not at 12", () => {
    expect(keys({ feelsMin: 11.9 })).toContain("jacket");
    expect(keys({ feelsMin: 12 })).not.toContain("jacket");
  });
  it("scarf below 5, not at 5", () => {
    expect(keys({ feelsMin: 4 })).toContain("scarf");
    expect(keys({ feelsMin: 5 })).not.toContain("scarf");
  });
  it("gloves below 0, not at 0", () => {
    expect(keys({ feelsMin: -1 })).toContain("gloves");
    expect(keys({ feelsMin: 0 })).not.toContain("gloves");
  });
  it("T-shirt from 22, shorts from 24", () => {
    expect(keys({ feelsMax: 21 })).not.toContain("tshirt");
    expect(keys({ feelsMax: 22 })).toContain("tshirt");
    expect(keys({ feelsMax: 22 })).not.toContain("shorts");
    expect(keys({ feelsMax: 23 })).not.toContain("shorts");
    expect(keys({ feelsMax: 24 })).toContain("shorts");
  });
  it("rain gives umbrella and boots; snow gives gloves and boots", () => {
    expect(keys({ rain: true })).toEqual(["umbrella", "boots"]);
    expect(keys({ snow: true })).toEqual(["boots", "gloves"]);
    expect(keys({ rain: true, snow: true, feelsMin: 3 })).toEqual([
      "umbrella",
      "boots",
      "jacket",
      "scarf",
      "gloves",
    ]);
  });
  it("cap needs sunny code, UV >= 3 and feelsMax >= 15", () => {
    const sunny = { code: 1, uvMax: 3, feelsMax: 15 };
    expect(keys(sunny)).toContain("cap");
    expect(keys({ ...sunny, uvMax: 2.9 })).not.toContain("cap");
    expect(keys({ ...sunny, feelsMax: 14 })).not.toContain("cap");
    expect(keys({ ...sunny, code: 3 })).not.toContain("cap");
    expect(keys({ ...sunny, code: 2 })).toContain("cap");
  });
  it("sunscreen from UV 5", () => {
    expect(keys({ uvMax: 4.9 })).not.toContain("sunscreen");
    expect(keys({ uvMax: 5 })).toContain("sunscreen");
  });
  it("a mild dry day needs nothing", () => {
    expect(clothingFor(mild, "celsius")).toEqual([]);
  });
});

describe("clothingFor misc", () => {
  it("cool morning + hot afternoon gives jacket and T-shirt", () => {
    expect(keys({ feelsMin: 8, feelsMax: 23 })).toEqual(["jacket", "tshirt"]);
  });

  it("converts Fahrenheit thresholds (53.6F = 12C)", () => {
    expect(keys({ feelsMin: 53 }, "fahrenheit")).toContain("jacket");
    expect(keys({ feelsMin: 54 }, "fahrenheit")).not.toContain("jacket");
    expect(keys({ feelsMin: 40 }, "fahrenheit")).toContain("scarf");
    expect(keys({ feelsMin: 41 }, "fahrenheit")).not.toContain("scarf");
    expect(keys({ feelsMin: 31 }, "fahrenheit")).toContain("gloves");
    expect(keys({ feelsMin: 32 }, "fahrenheit")).not.toContain("gloves");
    expect(keys({ feelsMax: 71 }, "fahrenheit")).not.toContain("tshirt");
    expect(keys({ feelsMax: 72 }, "fahrenheit")).toContain("tshirt");
    expect(keys({ feelsMax: 75 }, "fahrenheit")).not.toContain("shorts");
    expect(keys({ feelsMax: 76 }, "fahrenheit")).toContain("shorts");
    // 20 is cold in Celsius but warm in Fahrenheit input.
    expect(keys({ feelsMin: 20, feelsMax: 20 }, "fahrenheit")).toContain(
      "gloves",
    );
    expect(keys({ feelsMin: 20, feelsMax: 20 }, "celsius")).not.toContain(
      "gloves",
    );
  });

  it("caps at 5 items and keeps protection before comfort", () => {
    const all = clothingFor(
      {
        code: 0,
        feelsMin: -3,
        feelsMax: 25,
        rain: true,
        snow: true,
        uvMax: 8,
      },
      "celsius",
    );
    expect(all).toHaveLength(CLOTHING_MAX_ITEMS);
    expect(all.map((i) => i.key)).toEqual([
      "umbrella",
      "boots",
      "jacket",
      "scarf",
      "gloves",
    ]);
  });

  it("has no duplicates and a fixed order", () => {
    const items = clothingFor({
      ...mild,
      feelsMin: -5,
      snow: true,
      rain: true,
    });
    expect(new Set(items.map((i) => i.emoji)).size).toBe(items.length);
    expect(items.map((i) => i.emoji)).toEqual(["☔", "👢", "🧥", "🧣", "🧤"]);
  });

  it("returns fresh objects", () => {
    const [first] = clothingFor({ ...mild, rain: true });
    if (first === undefined) {
      throw new Error("expected an item");
    }
    first.emoji = "x";
    expect(clothingFor({ ...mild, rain: true })[0]?.emoji).toBe("☔");
  });
});

describe("WeatherResponseSchema", () => {
  const valid = {
    fetchedAt: "2026-05-04T08:00:00Z",
    unit: "celsius",
    current: { temperature: 12, code: 3 },
    days: [mild],
  };

  it("parses, defaults stale to false and ignores unknown keys", () => {
    const parsed = WeatherResponseSchema.parse({ ...valid, future: 1 });
    expect(parsed.stale).toBe(false);
    expect(parsed).not.toHaveProperty("future");
    expect(WeatherResponseSchema.parse({ ...valid, stale: true }).stale).toBe(
      true,
    );
  });

  it("rejects fractional temperatures, bad dates, bad unit and > 7 days", () => {
    const bad = (patch: Record<string, unknown>): boolean =>
      WeatherResponseSchema.safeParse({ ...valid, ...patch }).success;
    expect(bad({ current: { temperature: 12.5, code: 3 } })).toBe(false);
    expect(bad({ days: [{ ...mild, feelsMin: 1.5 }] })).toBe(false);
    expect(bad({ days: [{ ...mild, date: "04.05.2026" }] })).toBe(false);
    expect(bad({ unit: "kelvin" })).toBe(false);
    expect(bad({ days: Array.from({ length: 7 }, () => mild) })).toBe(true);
    expect(bad({ days: Array.from({ length: 8 }, () => mild) })).toBe(false);
    expect(bad({ fetchedAt: "yesterday" })).toBe(false);
  });
});
