import {
  type AppConfig,
  effectiveWeather,
  WEATHER_SETTING_KEY,
  type WeatherSetting,
  WeatherSettingSchema,
  type WeatherSource,
} from "@kidboard/shared";

import type { BoardRequest } from "../agenda/board";
import type { SchemaGate } from "../entries/schema";
import type { Env } from "../env";
import { withDeadline } from "../feeds/flight";
import { errorName } from "../http/errors";
import { logWarn } from "../log";
import { editorEnabled } from "../parent/pin";

/** The config with its effective weather (ADR-0016) and where that came from. */
export interface EffectiveWeather {
  /** A copy of the config whose `weather` is the effective one (`undefined` = off). */
  config: AppConfig;
  source: WeatherSource;
}

/**
 * The editor's weather setting (T-56, ADR-0016): one `kb_meta` row
 * {@link WEATHER_SETTING_KEY} holding `{"off":true}` or a place block as JSON. The row
 * is read only while the editor is on (like the app entries, ADR-0014): with the editor
 * off the config's block applies. The place never appears in a log line.
 */
export interface WeatherSettings {
  /**
   * Effective weather of a request for `/api/config` and `/api/weather`: without the
   * editor, on a D1 error or after the deadline the config's block applies (logged by
   * error type only). Never rejects.
   */
  effective(c: BoardRequest, config: AppConfig): Promise<EffectiveWeather>;
  /** The stored setting; `null` without one or for a corrupt row. D1 errors reject. */
  read(db: D1Database): Promise<WeatherSetting | null>;
  /** Stores (replaces) the setting. D1 errors reject. */
  write(db: D1Database, setting: WeatherSetting): Promise<void>;
  /** Removes the setting (back to the config). D1 errors reject. */
  remove(db: D1Database): Promise<void>;
}

export interface WeatherSettingsOptions {
  /** D1 schema gate of the isolate (`kb_meta` is created by the entry schema). */
  gate: SchemaGate;
  /** Deadline of the read on `/api/config` and `/api/weather`. */
  d1TimeoutMs: number;
}

/** Applies a setting to a copy of `config` (the memoized config is never mutated). */
export function withSetting(
  config: AppConfig,
  setting: WeatherSetting | null,
): EffectiveWeather {
  const weather = effectiveWeather(setting, config.weather);
  const copy: AppConfig = { ...config };
  if (weather === undefined) {
    delete copy.weather;
  } else {
    copy.weather = weather;
  }
  return {
    config: copy,
    source:
      setting !== null
        ? "editor"
        : config.weather === undefined
          ? "none"
          : "config",
  };
}

export function createWeatherSettings(
  options: WeatherSettingsOptions,
): WeatherSettings {
  const { gate } = options;
  // The last corrupt value that was logged: a corrupt row is logged once, not per request.
  let loggedCorrupt: string | undefined;

  const parseRow = (value: unknown): WeatherSetting | null => {
    if (value === null || value === undefined) {
      loggedCorrupt = undefined;
      return null;
    }
    const raw = typeof value === "string" ? value : `(${typeof value})`;
    let json: unknown;
    try {
      json = typeof value === "string" ? JSON.parse(value) : undefined;
    } catch {
      json = undefined;
    }
    const parsed = WeatherSettingSchema.safeParse(json);
    if (parsed.success) {
      loggedCorrupt = undefined;
      return parsed.data;
    }
    if (loggedCorrupt !== raw) {
      loggedCorrupt = raw;
      // Fixed text: the row may hold a place.
      logWarn(
        "weather: the stored weather setting is invalid and ignored; using the configuration",
      );
    }
    return null;
  };

  const read = (db: D1Database): Promise<WeatherSetting | null> =>
    gate.run(db, async () =>
      parseRow(
        await db
          .prepare("SELECT value FROM kb_meta WHERE key = ?1")
          .bind(WEATHER_SETTING_KEY)
          .first("value"),
      ),
    );

  const settingsDb = (env: Env): D1Database | undefined =>
    editorEnabled(env) ? env.KIDBOARD_DATA : undefined;

  return {
    async effective(c, config) {
      const db = settingsDb(c.env);
      if (db === undefined) {
        return withSetting(config, null);
      }
      try {
        return withSetting(
          config,
          await withDeadline(read(db), options.d1TimeoutMs),
        );
      } catch (error) {
        // Type only: D1 messages may quote statements or stored text.
        logWarn(
          `weather: D1 unavailable (${errorName(error)}), using the configuration`,
        );
        return withSetting(config, null);
      }
    },
    read,
    async write(db, setting) {
      // Validated again: only a well-formed setting is ever stored.
      const value = JSON.stringify(WeatherSettingSchema.parse(setting));
      await gate.run(db, () =>
        db
          .prepare(
            "INSERT INTO kb_meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?2",
          )
          .bind(WEATHER_SETTING_KEY, value)
          .run(),
      );
    },
    async remove(db) {
      await gate.run(db, () =>
        db
          .prepare("DELETE FROM kb_meta WHERE key = ?1")
          .bind(WEATHER_SETTING_KEY)
          .run(),
      );
    },
  };
}
