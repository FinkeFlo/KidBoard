import { z } from "zod";

import type { WeatherConfig } from "../config";
import { TemperatureUnitSchema } from "./schema";

/**
 * Weather setting of the parent editor (T-56, ADR-0016): stored in the D1 `kb_meta` row
 * {@link WEATHER_SETTING_KEY} and sent by `PUT /api/parent/weather`. Either `{ off: true }`
 * (weather off, even when `KIDBOARD_CONFIG` has a `weather` block) or a town (`place`,
 * optional ISO 3166-1 alpha-2 `country`, `unit`). Coordinates are config-only. The place
 * is personal data: it stays inside the worker and the parent API.
 */

/** Longest town name, as in the config's `weather.place`. */
export const WEATHER_PLACE_MAX = 80;

/** Constant `kb_meta` key of the stored setting. */
export const WEATHER_SETTING_KEY = "weather_setting";

/** Whether `text` holds a C0 or C1 control character (never part of a town name). */
function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

/** Town name: trimmed, 1–80 characters, no control characters. */
export const WeatherPlaceSchema = z
  .string()
  .trim()
  .min(1)
  .max(WEATHER_PLACE_MAX)
  .refine((place) => !hasControlCharacter(place), {
    message: "place must not contain control characters",
  });

/** ISO 3166-1 alpha-2 code in capitals, e.g. `DE`. */
export const WeatherCountrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "country must be an ISO 3166-1 alpha-2 code, e.g. DE");

export const WeatherSettingOffSchema = z.strictObject({ off: z.literal(true) });

export const WeatherSettingPlaceSchema = z.strictObject({
  place: WeatherPlaceSchema,
  country: WeatherCountrySchema.optional(),
  unit: TemperatureUnitSchema,
});

/** The stored row and the `PUT` body; strict on write and on read. */
export const WeatherSettingSchema = z.union([
  WeatherSettingOffSchema,
  WeatherSettingPlaceSchema,
]);
export type WeatherSetting = z.output<typeof WeatherSettingSchema>;

/**
 * Effective weather (ADR-0016): the editor setting if present, else the config's block;
 * `{ off: true }` wins over the config. `undefined` = weather off.
 */
export function effectiveWeather(
  setting: WeatherSetting | null,
  configWeather: WeatherConfig | undefined,
): WeatherConfig | undefined {
  if (setting === null) {
    return configWeather;
  }
  if ("off" in setting) {
    return undefined;
  }
  return {
    place: setting.place,
    ...(setting.country === undefined ? {} : { country: setting.country }),
    unit: setting.unit,
  };
}

/** Where the effective weather comes from. */
export const WeatherSourceSchema = z.enum(["config", "editor", "none"]);
export type WeatherSource = z.output<typeof WeatherSourceSchema>;

/** Outcome of resolving the effective weather right now. */
export const WeatherSettingStatusSchema = z.enum([
  "ok",
  "off",
  "place_unknown",
  "unavailable",
]);
export type WeatherSettingStatus = z.output<typeof WeatherSettingStatusSchema>;

/**
 * `GET`/`PUT /api/parent/weather` (behind the parent session). `weather` is what is set
 * (`null` while off); coordinates of the config are only reported as
 * `coordinates: true`, never their values. Not strict: a newer worker may add fields.
 */
export const ParentWeatherResponseSchema = z.object({
  source: WeatherSourceSchema,
  weather: z
    .object({
      place: z.string().min(1).max(WEATHER_PLACE_MAX).optional(),
      country: WeatherCountrySchema.optional(),
      unit: TemperatureUnitSchema,
      coordinates: z.literal(true).optional(),
    })
    .nullable(),
  status: WeatherSettingStatusSchema,
});
export type ParentWeatherResponse = z.output<
  typeof ParentWeatherResponseSchema
>;
