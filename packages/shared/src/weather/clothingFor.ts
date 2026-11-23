import type { TemperatureUnit, WeatherDay } from "./schema";

export type ClothingKey =
  | "umbrella"
  | "boots"
  | "jacket"
  | "scarf"
  | "gloves"
  | "tshirt"
  | "shorts"
  | "cap"
  | "sunscreen";

export interface ClothingItem {
  key: ClothingKey;
  emoji: string;
}

/**
 * Thresholds in degrees Celsius (feels-like over 07:00-19:00); Fahrenheit input is
 * converted to Celsius before comparing. "Below" = strictly less, "from" = greater or equal.
 */
export const CLOTHING_THRESHOLDS = {
  /** 🧥 when `feelsMin` is below this. */
  jacketBelow: 12,
  /** 🧣 when `feelsMin` is below this. */
  scarfBelow: 5,
  /** 🧤 when `feelsMin` is below this (or snow). */
  glovesBelow: 0,
  /** 👕 when `feelsMax` is at least this. */
  tshirtFrom: 22,
  /** 🩳 when `feelsMax` is at least this. */
  shortsFrom: 24,
  /** 🧢 needs `feelsMax` at least this, sunny code and `capUvFrom`. */
  capFeelsFrom: 15,
  /** 🧢 needs a UV index at least this. */
  capUvFrom: 3,
  /** 🧴 when the UV index is at least this. */
  sunscreenUvFrom: 5,
  /** 🧢 only for WMO codes up to this (clear to partly cloudy). */
  sunnyMaxCode: 2,
} as const;

/** Most items shown. */
export const CLOTHING_MAX_ITEMS = 5;

/**
 * Fixed display order; protection first so that the cap at
 * {@link CLOTHING_MAX_ITEMS} drops comfort items (T-shirt, shorts, cap, sunscreen) first.
 */
const ORDER: readonly ClothingItem[] = [
  { key: "umbrella", emoji: "☔" },
  { key: "boots", emoji: "👢" },
  { key: "jacket", emoji: "🧥" },
  { key: "scarf", emoji: "🧣" },
  { key: "gloves", emoji: "🧤" },
  { key: "tshirt", emoji: "👕" },
  { key: "shorts", emoji: "🩳" },
  { key: "cap", emoji: "🧢" },
  { key: "sunscreen", emoji: "🧴" },
];

function toCelsius(value: number, unit: TemperatureUnit): number {
  return unit === "fahrenheit" ? ((value - 32) * 5) / 9 : value;
}

/** What to wear on `day` (temperatures in `unit`): at most 5 items, fixed order. */
export function clothingFor(
  day: Pick<
    WeatherDay,
    "code" | "feelsMin" | "feelsMax" | "rain" | "snow" | "uvMax"
  >,
  unit: TemperatureUnit = "celsius",
): ClothingItem[] {
  const t = CLOTHING_THRESHOLDS;
  const min = toCelsius(day.feelsMin, unit);
  const max = toCelsius(day.feelsMax, unit);
  const wanted = new Set<ClothingKey>();

  if (day.rain) {
    wanted.add("umbrella");
    wanted.add("boots");
  }
  if (day.snow) {
    wanted.add("gloves");
    wanted.add("boots");
  }
  if (min < t.jacketBelow) wanted.add("jacket");
  if (min < t.scarfBelow) wanted.add("scarf");
  if (min < t.glovesBelow) wanted.add("gloves");
  if (max >= t.tshirtFrom) wanted.add("tshirt");
  if (max >= t.shortsFrom) wanted.add("shorts");
  if (
    day.code <= t.sunnyMaxCode &&
    day.uvMax >= t.capUvFrom &&
    max >= t.capFeelsFrom
  ) {
    wanted.add("cap");
  }
  if (day.uvMax >= t.sunscreenUvFrom) wanted.add("sunscreen");

  return ORDER.filter((item) => wanted.has(item.key))
    .slice(0, CLOTHING_MAX_ITEMS)
    .map((item) => ({ ...item }));
}
