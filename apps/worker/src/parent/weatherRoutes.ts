import {
  type AppConfig,
  type ParentWeatherResponse,
  type WeatherSetting,
  WeatherSettingSchema,
  type WeatherSettingStatus,
} from "@kidboard/shared";
import type { Context, Hono, MiddlewareHandler } from "hono";

import { loadConfig } from "../config/loadConfig";
import type { AppEnv } from "../env";
import {
  errorName,
  notFound,
  serverMisconfigured,
  storageUnavailable,
} from "../http/errors";
import { parseJsonBody } from "../http/jsonBody";
import { logWarn } from "../log";
import { type WeatherSettings, withSetting } from "../weather/setting";
import type { WeatherResult, WeatherService } from "../weather/weather";
import type { ParentEnv } from "./session";

/** Path of the weather setting below `/api/parent`. */
export const WEATHER_SETTING_ROUTE = "/weather";

export interface WeatherRoutesOptions {
  weather: WeatherService;
  settings: WeatherSettings;
  requireSession: MiddlewareHandler<ParentEnv>;
}

function statusOf(result: WeatherResult): WeatherSettingStatus {
  switch (result.kind) {
    case "ok":
      return "ok";
    case "off":
      return "off";
    case "place-unknown":
      return "place_unknown";
    case "unavailable":
      return "unavailable";
  }
}

/** What is set, for the parent: never the coordinates themselves. */
function describe(config: AppConfig): ParentWeatherResponse["weather"] {
  const weather = config.weather;
  if (weather === undefined) {
    return null;
  }
  if (weather.place === undefined) {
    return { unit: weather.unit, coordinates: true };
  }
  return {
    place: weather.place,
    ...(weather.country === undefined ? {} : { country: weather.country }),
    unit: weather.unit,
  };
}

function logStorageError(error: unknown): void {
  // Type only: D1 messages may quote statements or the stored place.
  logWarn(`weather setting: D1 unavailable (${errorName(error)})`);
}

/**
 * Weather setting of the parent editor (T-56, ADR-0016) on the parent sub-app, behind
 * the parent session (403 `parent_locked`), the editor-off 404 and the 16 KB body limit:
 *
 * * `GET /weather` → {@link ParentWeatherResponse}: where the effective weather comes
 *   from (`editor`, `config`, `none`), what is set (config coordinates only as
 *   `coordinates: true`) and whether it resolves right now;
 * * `PUT /weather` with `{ place, country?, unit }` or `{ off: true }` → stores it, then
 *   resolves the place at once and answers the same shape (an unknown town is stored
 *   and reported as `place_unknown`); invalid bodies → 400 `bad_request` naming the
 *   field only;
 * * `DELETE /weather` → removes the setting (back to the config), same shape.
 *
 * D1 errors → 503 `storage_unavailable`. The place appears in no log line or error body.
 */
export function registerWeatherRoutes(
  app: Hono<AppEnv>,
  options: WeatherRoutesOptions,
): void {
  const { weather, settings, requireSession } = options;

  const answer = async (
    c: Context<ParentEnv>,
    config: AppConfig,
    setting: WeatherSetting | null,
  ): Promise<Response> => {
    const effective = withSetting(config, setting);
    const status: WeatherSettingStatus =
      effective.config.weather === undefined
        ? "off"
        : statusOf(await weather.load(c, effective.config));
    const body: ParentWeatherResponse = {
      source: effective.source,
      weather: describe(effective.config),
      status,
    };
    return c.json(body);
  };

  /** Config and database of a request, or the error response. */
  const prepare = (
    c: Context<ParentEnv>,
  ):
    | { ok: true; config: AppConfig; db: D1Database }
    | { ok: false; response: Response } => {
    const loaded = loadConfig(c.env.KIDBOARD_CONFIG);
    if (!loaded.ok) {
      return { ok: false, response: serverMisconfigured(c) };
    }
    const db = c.env.KIDBOARD_DATA;
    if (db === undefined) {
      // Unreachable behind the editor gate; keeps the types honest.
      return { ok: false, response: notFound(c) };
    }
    return { ok: true, config: loaded.config, db };
  };

  app.get(WEATHER_SETTING_ROUTE, requireSession, async (c) => {
    const p = prepare(c);
    if (!p.ok) {
      return p.response;
    }
    let setting: WeatherSetting | null;
    try {
      setting = await settings.read(p.db);
    } catch (error) {
      logStorageError(error);
      return storageUnavailable(c);
    }
    return answer(c, p.config, setting);
  });

  app.put(WEATHER_SETTING_ROUTE, requireSession, async (c) => {
    const body = await parseJsonBody(c, WeatherSettingSchema);
    if (!body.ok) {
      return body.response;
    }
    const p = prepare(c);
    if (!p.ok) {
      return p.response;
    }
    try {
      await settings.write(p.db, body.value);
    } catch (error) {
      logStorageError(error);
      return storageUnavailable(c);
    }
    return answer(c, p.config, body.value);
  });

  app.delete(WEATHER_SETTING_ROUTE, requireSession, async (c) => {
    const p = prepare(c);
    if (!p.ok) {
      return p.response;
    }
    try {
      await settings.remove(p.db);
    } catch (error) {
      logStorageError(error);
      return storageUnavailable(c);
    }
    return answer(c, p.config, null);
  });
}
