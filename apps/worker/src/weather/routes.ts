import type { Hono } from "hono";

import { loadConfig } from "../config/loadConfig";
import type { AppEnv } from "../env";
import { serverMisconfigured } from "../http/errors";
import type { WeatherSettings } from "./setting";
import type { WeatherService } from "./weather";

/** Path of the weather API. */
export const WEATHER_PATH = "/api/weather";

/**
 * `GET /api/weather` → `WeatherResponse` (ADR-0015). Weather off → `404 weather_off`;
 * place not found → `503 weather_place_unknown`; upstream failed without a last good
 * forecast → `503 weather_unavailable`. Bodies carry fixed texts only. The access token
 * middleware and `Cache-Control: no-store` apply as for every API route. The weather is
 * the effective one (ADR-0016): the editor setting over the config's block.
 */
export function registerWeatherRoute(
  app: Hono<AppEnv>,
  options: { weather: WeatherService; settings: WeatherSettings },
): void {
  const { weather, settings } = options;
  app.get(WEATHER_PATH, async (c) => {
    const loaded = loadConfig(c.env.KIDBOARD_CONFIG);
    if (!loaded.ok) {
      return serverMisconfigured(c);
    }
    const { config } = await settings.effective(c, loaded.config);
    const result = await weather.load(c, config);
    switch (result.kind) {
      case "ok":
        return c.json(result.body);
      case "off":
        return c.json(
          { error: "weather_off", message: "Weather is not configured" },
          404,
        );
      case "place-unknown":
        return c.json(
          {
            error: "weather_place_unknown",
            message: "The configured weather place was not found",
          },
          503,
        );
      case "unavailable":
        return c.json(
          {
            error: "weather_unavailable",
            message: "Weather is temporarily unavailable",
          },
          503,
        );
    }
  });
}
