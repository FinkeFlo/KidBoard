import {
  type AppConfig,
  DateTimeStringSchema,
  todayInZone,
  type WeatherResponse,
  WeatherResponseSchema,
} from "@kidboard/shared";
import { z } from "zod";

import { type BoardRequest, defer } from "../agenda/board";
import { FLIGHT_MARGIN_MS, withDeadline } from "../agenda/loadSource";
import { sha256Hex } from "../config/loadConfig";
import type { Env } from "../env";
import { FeedFetchError } from "../feeds/fetchFeed";
import {
  cacheBackend,
  kvBackend,
  type StoreBackend,
} from "../feeds/sourceStore";
import { logWarn } from "../log";
import {
  WEATHER_FRESH_SECONDS,
  WEATHER_GEOCODE_TTL_SECONDS,
  WEATHER_LAST_GOOD_SECONDS,
  WEATHER_PLACE_MISS_TTL_SECONDS,
  WEATHER_RETRY_AFTER_FAILURE_SECONDS,
} from "./budget";
import { condenseForecast } from "./condense";
import {
  type Coordinates,
  fetchForecast,
  geocode,
  type UpstreamLimits,
  WEATHER_MAX_BYTES,
  WEATHER_TIMEOUT_MS,
  WeatherResponseError,
} from "./openMeteo";

/** Outcome of {@link WeatherService.load}; the route maps it to a response. */
export type WeatherResult =
  | { kind: "off" }
  | { kind: "ok"; body: WeatherResponse }
  | { kind: "place-unknown" }
  | { kind: "unavailable" };

export interface WeatherService {
  load(c: BoardRequest, config: AppConfig): Promise<WeatherResult>;
}

export interface WeatherOptions {
  /** Clock (epoch ms). */
  now: () => number;
  /** Cache API cache used without a KV binding. */
  openCache: () => Promise<Cache>;
  /** Per-request upstream timeout (default 5 s). */
  timeoutMs?: number | undefined;
  /** Upstream size limit (default 1 MB). */
  maxBytes?: number | undefined;
}

/** Version of the stored entries; a different version is a miss. */
const ENTRY_VERSION = 1;

const ForecastEntrySchema = z.object({
  v: z.literal(ENTRY_VERSION),
  forecast: WeatherResponseSchema,
});
type ForecastEntry = z.infer<typeof ForecastEntrySchema>;

/**
 * Result of geocoding a place (stored server-side only, never returned or logged):
 * its coordinates (kept 30 days) or `null` when Open-Meteo knows no such place (a miss,
 * kept 1 hour so a wrong place does not hit the geocoder on every request).
 */
const PlaceEntrySchema = z.object({
  v: z.literal(ENTRY_VERSION),
  resolvedAt: DateTimeStringSchema,
  found: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable(),
});
type PlaceEntry = z.infer<typeof PlaceEntrySchema>;

function placeTtlSeconds(entry: PlaceEntry): number {
  return entry.found === null
    ? WEATHER_PLACE_MISS_TTL_SECONDS
    : WEATHER_GEOCODE_TTL_SECONDS;
}

/** Thrown inside a flight when the geocoding API has no match for the place. */
class PlaceUnknownError extends Error {
  override readonly name = "PlaceUnknownError";
  constructor() {
    super("Weather place not found");
  }
}

interface Flight {
  promise: Promise<WeatherResponse>;
  startedAtMs: number;
}

interface MemoryItem {
  json: unknown;
  expiresAtMs: number;
}

/** Memory entries per isolate (one forecast and one place per config, a few configs). */
const MEMORY_LIMIT = 8;

/** Geocoding language from the config locale (`auto` → English names). */
function geocodingLanguage(config: AppConfig): "de" | "en" {
  return config.locale === "de" ? "de" : "en";
}

function describeFailure(error: unknown): string {
  if (error instanceof FeedFetchError) {
    return error.status === undefined
      ? error.reason
      : `${error.reason} ${String(error.status)}`;
  }
  if (error instanceof WeatherResponseError) {
    return error.reason;
  }
  // Unexpected error: its type only (messages may quote upstream URLs).
  return `internal ${error instanceof Error ? error.name : typeof error}`;
}

function fetchedAtMs(entry: ForecastEntry): number {
  return Date.parse(entry.forecast.fetchedAt);
}

/**
 * `/api/weather` (PLAN T-48, ADR-0015): resolves the place (cached 30 days), fetches and
 * condenses the forecast (fresh 30 min) and serves the last good one for up to 24 h
 * when Open-Meteo fails. Cache layers as for the feeds (ADR-0006): a small memory map
 * per isolate in front of KV (`KIDBOARD_CACHE`) or the Cache API, and one upstream load
 * per isolate at a time (single flight). Keys are hashes: the place and the coordinates
 * never appear in a key, response, error or log line.
 */
export function createWeather(options: WeatherOptions): WeatherService {
  const limits: UpstreamLimits = {
    timeoutMs: options.timeoutMs ?? WEATHER_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? WEATHER_MAX_BYTES,
  };
  // Geocoding and forecast run one after the other inside a flight.
  const maxFlightMs = 2 * limits.timeoutMs + FLIGHT_MARGIN_MS;
  const fallbackBackend = cacheBackend(options.openCache);
  const backendFor = (env: Env): StoreBackend =>
    env.KIDBOARD_CACHE === undefined
      ? fallbackBackend
      : kvBackend(env.KIDBOARD_CACHE);
  const memory = new Map<string, MemoryItem>();
  const inflight = new Map<string, Flight>();
  /**
   * Per forecast key: no upstream attempt before this time (epoch ms) after a failure.
   * Memory only, per isolate; a success clears it.
   */
  const retryAfter = new Map<string, number>();

  function remember(key: string, json: unknown, expiresAtMs: number): void {
    memory.delete(key);
    if (memory.size >= MEMORY_LIMIT) {
      const oldest = memory.keys().next();
      if (oldest.done !== true) {
        memory.delete(oldest.value);
      }
    }
    memory.set(key, { json, expiresAtMs });
  }

  /** Validated entry under `key` (memory, then backend); `null` on miss or expiry. */
  async function read<T>(
    backend: StoreBackend,
    key: string,
    schema: z.ZodType<T>,
    expiresAt: (entry: T) => number,
    nowMs: number,
  ): Promise<T | null> {
    const item = memory.get(key);
    if (item !== undefined) {
      const parsed = schema.safeParse(item.json);
      if (item.expiresAtMs > nowMs && parsed.success) {
        return parsed.data;
      }
      memory.delete(key);
    }
    try {
      const text = await backend.read(key);
      if (text === null) {
        return null;
      }
      const parsed = schema.safeParse(JSON.parse(text));
      if (!parsed.success || expiresAt(parsed.data) <= nowMs) {
        return null;
      }
      remember(key, parsed.data, expiresAt(parsed.data));
      return parsed.data;
    } catch {
      // Unreadable entry or backend failure: a miss.
      return null;
    }
  }

  /** Remembers at once; the backend write runs past the response. One write per call. */
  function write(
    c: BoardRequest,
    backend: StoreBackend,
    key: string,
    entry: unknown,
    expiresAtMs: number,
    ttlSeconds: number,
  ): void {
    remember(key, entry, expiresAtMs);
    defer(
      c,
      backend.write(key, JSON.stringify(entry), ttlSeconds).catch(() => {
        logWarn(`weather: ${backend.kind} cache write failed`);
      }),
    );
  }

  async function coordinates(
    c: BoardRequest,
    config: AppConfig,
    backend: StoreBackend,
    nowMs: number,
  ): Promise<Coordinates> {
    const weather = config.weather;
    if (weather === undefined) {
      throw new PlaceUnknownError();
    }
    if (weather.latitude !== undefined && weather.longitude !== undefined) {
      return { latitude: weather.latitude, longitude: weather.longitude };
    }
    const place = weather.place ?? "";
    const language = geocodingLanguage(config);
    const key = `v1/weather/place/${(
      await sha256Hex(
        JSON.stringify(["place", place, weather.country ?? "", language]),
      )
    ).slice(0, 32)}`;
    const placeExpiry = (entry: PlaceEntry): number =>
      Date.parse(entry.resolvedAt) + placeTtlSeconds(entry) * 1000;
    const cached = await read(
      backend,
      key,
      PlaceEntrySchema,
      placeExpiry,
      nowMs,
    );
    const entry: PlaceEntry = cached ?? {
      v: ENTRY_VERSION,
      resolvedAt: new Date(nowMs).toISOString(),
      found: await geocode(place, weather.country, language, limits),
    };
    if (cached === null) {
      write(c, backend, key, entry, placeExpiry(entry), placeTtlSeconds(entry));
      if (entry.found === null) {
        // Logged once per lookup, not on every request served from the cached miss.
        logWarn("weather: the configured place was not found");
      }
    }
    if (entry.found === null) {
      throw new PlaceUnknownError();
    }
    return { ...entry.found };
  }

  function backOff(key: string, failedAtMs: number): void {
    retryAfter.delete(key);
    for (const [other, until] of retryAfter) {
      if (until <= failedAtMs || retryAfter.size >= MEMORY_LIMIT) {
        retryAfter.delete(other);
      }
    }
    retryAfter.set(
      key,
      failedAtMs + WEATHER_RETRY_AFTER_FAILURE_SECONDS * 1000,
    );
  }

  return {
    async load(c, config) {
      const weather = config.weather;
      if (weather === undefined) {
        return { kind: "off" };
      }
      const nowMs = options.now();
      const today = todayInZone(nowMs, config.timeZone);
      const backend = backendFor(c.env);
      // Everything the forecast depends on, hashed: a changed place, unit or zone starts
      // over, while edits elsewhere in the config keep the cached forecast.
      const key = `v1/weather/forecast/${(
        await sha256Hex(
          JSON.stringify([
            "forecast",
            weather,
            config.timeZone,
            geocodingLanguage(config),
          ]),
        )
      ).slice(0, 32)}`;
      const lastGoodExpiry = (entry: ForecastEntry): number =>
        fetchedAtMs(entry) + WEATHER_LAST_GOOD_SECONDS * 1000;
      const cached = await read(
        backend,
        key,
        ForecastEntrySchema,
        lastGoodExpiry,
        nowMs,
      );
      // Days before today (config zone) are dropped from whatever is served.
      const serve = (
        forecast: WeatherResponse,
        stale: boolean,
      ): WeatherResult => ({
        kind: "ok",
        body: {
          ...forecast,
          days: forecast.days.filter((d) => d.date >= today),
          stale,
        },
      });
      if (
        cached !== null &&
        nowMs - fetchedAtMs(cached) < WEATHER_FRESH_SECONDS * 1000
      ) {
        return serve(cached.forecast, false);
      }

      // Failure backoff: after a failed upstream load, no new attempt for 5 minutes.
      const blockedUntil = retryAfter.get(key);
      if (blockedUntil !== undefined) {
        if (nowMs < blockedUntil) {
          return cached === null
            ? { kind: "unavailable" }
            : serve(cached.forecast, true);
        }
        retryAfter.delete(key);
      }

      // Single flight per isolate; a flight older than its deadline is dead (e.g. its
      // request was cancelled before `waitUntil` took over) and is replaced.
      let flight = inflight.get(key);
      if (flight === undefined || nowMs - flight.startedAtMs > maxFlightMs) {
        const promise = (async (): Promise<WeatherResponse> => {
          const at = await coordinates(c, config, backend, nowMs);
          const raw = await fetchForecast(
            at,
            config.timeZone,
            weather.unit,
            limits,
          );
          const forecast = condenseForecast(
            raw,
            config.timeZone,
            weather.unit,
            nowMs,
          );
          const entry: ForecastEntry = { v: ENTRY_VERSION, forecast };
          write(
            c,
            backend,
            key,
            entry,
            lastGoodExpiry(entry),
            WEATHER_LAST_GOOD_SECONDS,
          );
          return forecast;
        })();
        const own: Flight = { promise, startedAtMs: nowMs };
        const cleanup = (): void => {
          if (inflight.get(key) === own) {
            inflight.delete(key);
          }
        };
        promise.then(cleanup, cleanup);
        inflight.set(key, own);
        defer(
          c,
          withDeadline(promise, maxFlightMs).catch(() => undefined),
        );
        flight = own;
      }

      try {
        const forecast = await withDeadline(flight.promise, maxFlightMs);
        retryAfter.delete(key);
        return serve(forecast, false);
      } catch (error) {
        if (error instanceof PlaceUnknownError) {
          return { kind: "place-unknown" };
        }
        backOff(key, options.now());
        logWarn(
          `weather: upstream failed (${describeFailure(error)}), ${cached === null ? "no last-good forecast" : "serving last-good forecast"}`,
        );
        return cached === null
          ? { kind: "unavailable" }
          : serve(cached.forecast, true);
      }
    },
  };
}
