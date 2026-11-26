import {
  type AppConfigInput,
  ParentWeatherResponseSchema,
  PublicConfigSchema,
  WEATHER_SETTING_KEY,
  WeatherResponseSchema,
} from "@kidboard/shared";
import {
  createExecutionContext,
  reset,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env as testEnv } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AppOptions, createApp } from "../app";
import type { Env } from "../env";
import {
  FIXTURE_LATITUDE,
  FIXTURE_LONGITUDE,
  forecastFixture,
} from "../weather/forecastFixture";
import { FORECAST_ENDPOINT, GEOCODING_ENDPOINT } from "../weather/openMeteo";
import { MAX_PARENT_BODY_BYTES } from "./routes";

/** Marker place (PLAN T-56): never in a log line, error body or public response. */
const PLACE = "TESTONLY-Weatherplace";
const CONFIG_PLACE = "TESTONLY-Configplace";
const PIN = "246813";
const ACCESS = "TESTONLY-access-token-not-a-secret-0123456789";
// Synthetic secret feed URL (reserved `.invalid` TLD).
const KINDER_URL =
  "https://feeds.kidboard.invalid/calendar/ical/private-TESTONLY-weather-c5d6/basic.ics";
const db = testEnv.KIDBOARD_DATA;

/** Monday 2026-11-23, 09:00 in Berlin (the forecast fixture's first day). */
const NOW = Date.parse("2026-11-23T08:00:00Z");

const BASE_CONFIG: AppConfigInput = {
  locale: "de",
  timeZone: "Europe/Berlin",
  calendars: [{ id: "kinder", kind: "events" }],
};

const KINDER_ICS = [
  "BEGIN:VCALENDAR",
  "PRODID:-//KidBoard//Synthetic Fixture weather-setting//EN",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:weather-kita@fixtures.kidboard.invalid",
  "DTSTAMP:20260101T000000Z",
  "DTSTART;TZID=Europe/Berlin:20261123T080000",
  "DTEND;TZID=Europe/Berlin:20261123T120000",
  "SUMMARY:🏫 Kita",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

interface Reply {
  path: string;
  method: string;
  status: number;
  text: string;
  json: unknown;
}

let consoleOutput: string[];
let replies: Reply[];
let cacheCounter = 0;
/** Places the geocoder knows; any other answers "no result". */
let knownPlaces: Set<string>;
let forecastFails: boolean;
let fetched: string[];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Harness {
  call: (
    path: string,
    init?: RequestInit & { session?: string | null; access?: boolean },
  ) => Promise<Reply>;
  token: () => Promise<string>;
  /** Parent call with a session. */
  parent: (path: string, init?: RequestInit) => Promise<Reply>;
  /** Replaces the environment overrides of later calls (same isolate). */
  use: (overrides: Partial<Env>, config?: Partial<AppConfigInput>) => void;
}

function harness(options: Omit<AppOptions, "now" | "openCache"> = {}): Harness {
  const cacheName = `kidboard-weather-setting-${String(cacheCounter++)}`;
  const app = createApp({
    ...options,
    now: () => NOW,
    openCache: () => caches.open(cacheName),
  });
  let overrides: Partial<Env> = {};
  let config: Partial<AppConfigInput> = {};
  let session: string | undefined;
  const call: Harness["call"] = async (path, init = {}) => {
    const { session: parentToken, access = true, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (access) headers.set("Authorization", `Bearer ${ACCESS}`);
    if (parentToken !== undefined && parentToken !== null) {
      headers.set("X-KidBoard-Parent", parentToken);
    }
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request(`https://board.example.test${path}`, { ...rest, headers }),
      {
        KIDBOARD_CONFIG: JSON.stringify({ ...BASE_CONFIG, ...config }),
        CAL_KINDER_URL: KINDER_URL,
        KIDBOARD_DATA: db,
        KIDBOARD_PARENT_PIN: PIN,
        KIDBOARD_ACCESS_TOKEN: ACCESS,
        ...overrides,
      },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
    const reply = {
      path,
      method: rest.method ?? "GET",
      status: response.status,
      text,
      json: body,
    };
    replies.push(reply);
    return reply;
  };
  const token = async (): Promise<string> => {
    if (session === undefined) {
      const reply = await call("/api/parent/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: PIN }),
      });
      expect(reply.status).toBe(200);
      session = (reply.json as { token: string }).token;
    }
    return session;
  };
  return {
    call,
    token,
    parent: async (path, init = {}) =>
      call(path, { ...init, session: await token() }),
    use: (next, nextConfig = {}) => {
      overrides = next;
      config = nextConfig;
    },
  };
}

function put(body: unknown): RequestInit {
  return {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

async function setting(
  h: Harness,
  init?: RequestInit,
): Promise<ReturnType<typeof ParentWeatherResponseSchema.parse>> {
  const reply = await h.parent("/api/parent/weather", init);
  expect(reply.status, reply.text).toBe(200);
  return ParentWeatherResponseSchema.parse(reply.json);
}

async function weatherFlag(h: Harness): Promise<boolean> {
  const reply = await h.call("/api/config");
  expect(reply.status, reply.text).toBe(200);
  // The flag is all the board learns: never a place or coordinates.
  expect(reply.text).not.toMatch(/place|latitude|longitude|country/);
  return PublicConfigSchema.parse(reply.json).weather;
}

async function storedRow(): Promise<unknown> {
  return db
    .prepare("SELECT value FROM kb_meta WHERE key = ?1")
    .bind(WEATHER_SETTING_KEY)
    .first("value");
}

/** A D1 binding whose reads and writes of the weather setting row fail (or hang). */
function brokenSettingRow(mode: "throw" | "hang"): D1Database {
  const real = db;
  const failing = (): never => {
    // The message carries the marker: it must never reach a log line.
    throw new Error(`D1_ERROR: ${PLACE}`);
  };
  return {
    prepare: (sql: string) => {
      const statement = real.prepare(sql);
      return new Proxy(statement, {
        get(target, property, receiver): unknown {
          if (property === "bind") {
            return (...args: unknown[]) => {
              if (!args.includes(WEATHER_SETTING_KEY)) {
                return target.bind(...args);
              }
              if (mode === "throw") failing();
              return {
                first: () => new Promise<never>(() => undefined),
                run: () => new Promise<never>(() => undefined),
              };
            };
          }
          const value: unknown = Reflect.get(target, property, receiver);
          return typeof value === "function"
            ? (value as (...a: unknown[]) => unknown).bind(target)
            : value;
        },
      });
    },
    batch: (statements: D1PreparedStatement[]) => real.batch(statements),
    exec: (sql: string) => real.exec(sql),
  } as unknown as D1Database;
}

beforeEach(() => {
  consoleOutput = [];
  replies = [];
  knownPlaces = new Set([PLACE, CONFIG_PLACE]);
  forecastFails = false;
  fetched = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    });
  }
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const endpoint = `${url.origin}${url.pathname}`;
    fetched.push(endpoint);
    if (request.url === KINDER_URL) {
      return Promise.resolve(
        new Response(KINDER_ICS, {
          headers: { "Content-Type": "text/calendar" },
        }),
      );
    }
    if (endpoint === GEOCODING_ENDPOINT) {
      const name = url.searchParams.get("name") ?? "";
      return Promise.resolve(
        json(
          knownPlaces.has(name)
            ? {
                results: [
                  {
                    id: 1,
                    name,
                    latitude: FIXTURE_LATITUDE,
                    longitude: FIXTURE_LONGITUDE,
                  },
                ],
              }
            : { generationtime_ms: 0.5 },
        ),
      );
    }
    if (endpoint === FORECAST_ENDPOINT) {
      return Promise.resolve(
        forecastFails
          ? new Response("down", { status: 503 })
          : json(forecastFixture()),
      );
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
});

afterEach(async () => {
  // The place may only appear in successful answers of the parent weather API (behind
  // the session); never in a log line, an error body or any other response.
  for (const line of consoleOutput) {
    for (const secret of [
      PLACE,
      CONFIG_PLACE,
      PIN,
      ACCESS,
      "private-TESTONLY",
    ]) {
      expect(line).not.toContain(secret);
    }
    expect(line).not.toContain(String(FIXTURE_LATITUDE));
  }
  for (const reply of replies) {
    const parentAnswer =
      reply.path === "/api/parent/weather" && reply.status === 200;
    if (!parentAnswer) {
      expect(reply.text, `${reply.method} ${reply.path}`).not.toContain(PLACE);
      expect(reply.text, `${reply.method} ${reply.path}`).not.toContain(
        CONFIG_PLACE,
      );
    }
    expect(reply.text).not.toContain(String(FIXTURE_LATITUDE));
    expect(reply.text).not.toContain(String(FIXTURE_LONGITUDE));
  }
  vi.restoreAllMocks();
  await reset();
});

describe("weather setting: precedence (ADR-0016)", () => {
  it("is off without a setting and without a config block", async () => {
    const h = harness();
    expect(await setting(h)).toEqual({
      source: "none",
      weather: null,
      status: "off",
    });
    expect(await weatherFlag(h)).toBe(false);
    expect((await h.call("/api/weather")).status).toBe(404);
    expect(fetched).not.toContain(GEOCODING_ENDPOINT);
  });

  it("turns the weather on with a town: stored, resolved, public flag and forecast", async () => {
    const h = harness();
    expect(
      await setting(
        h,
        put({ place: ` ${PLACE} `, country: "DE", unit: "celsius" }),
      ),
    ).toEqual({
      source: "editor",
      weather: { place: PLACE, country: "DE", unit: "celsius" },
      status: "ok",
    });
    expect(JSON.parse(String(await storedRow()))).toEqual({
      place: PLACE,
      country: "DE",
      unit: "celsius",
    });
    expect(await weatherFlag(h)).toBe(true);
    const weather = await h.call("/api/weather");
    expect(weather.status).toBe(200);
    expect(WeatherResponseSchema.parse(weather.json).unit).toBe("celsius");
    // The PUT resolved it; the board's request is served from the cache.
    expect(fetched.filter((e) => e === GEOCODING_ENDPOINT)).toHaveLength(1);
    expect(fetched.filter((e) => e === FORECAST_ENDPOINT)).toHaveLength(1);
    expect(await setting(h)).toEqual({
      source: "editor",
      weather: { place: PLACE, country: "DE", unit: "celsius" },
      status: "ok",
    });
  });

  it("lets the editor town win over the config's block, and the unit change applies", async () => {
    const h = harness();
    h.use({}, { weather: { place: CONFIG_PLACE } });
    expect(await setting(h)).toEqual({
      source: "config",
      weather: { place: CONFIG_PLACE, unit: "celsius" },
      status: "ok",
    });
    await setting(h, put({ place: PLACE, unit: "fahrenheit" }));
    const weather = await h.call("/api/weather");
    expect(WeatherResponseSchema.parse(weather.json).unit).toBe("fahrenheit");
    const urls = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(
        ([input]) =>
          new URL(input instanceof Request ? input.url : String(input)),
      );
    const of = (endpoint: string): URL[] =>
      urls.filter((url) => `${url.origin}${url.pathname}` === endpoint);
    expect(
      of(GEOCODING_ENDPOINT).map((url) => url.searchParams.get("name")),
    ).toEqual([CONFIG_PLACE, PLACE]);
    expect(
      of(FORECAST_ENDPOINT).map((url) =>
        url.searchParams.get("temperature_unit"),
      ),
    ).toEqual(["celsius", "fahrenheit"]);
  });

  it("turns the weather off even when the config has a block", async () => {
    const h = harness();
    h.use({}, { weather: { place: CONFIG_PLACE } });
    expect(await weatherFlag(h)).toBe(true);
    expect(await setting(h, put({ off: true }))).toEqual({
      source: "editor",
      weather: null,
      status: "off",
    });
    expect(JSON.parse(String(await storedRow()))).toEqual({ off: true });
    expect(await weatherFlag(h)).toBe(false);
    const weather = await h.call("/api/weather");
    expect(weather.status).toBe(404);
    expect((weather.json as { error: string }).error).toBe("weather_off");
  });

  it("goes back to the config with DELETE", async () => {
    const h = harness();
    h.use({}, { weather: { place: CONFIG_PLACE, country: "AT" } });
    await setting(h, put({ off: true }));
    expect(await setting(h, { method: "DELETE" })).toEqual({
      source: "config",
      weather: { place: CONFIG_PLACE, country: "AT", unit: "celsius" },
      status: "ok",
    });
    expect(await storedRow()).toBeNull();
    expect(await weatherFlag(h)).toBe(true);
    // Deleting again is fine (nothing stored).
    expect((await setting(h, { method: "DELETE" })).source).toBe("config");
  });

  it("reports config coordinates only as `coordinates: true`", async () => {
    const h = harness();
    h.use(
      {},
      { weather: { latitude: 53.5511, longitude: 9.9937, unit: "fahrenheit" } },
    );
    const reply = await h.parent("/api/parent/weather");
    expect(reply.text).not.toContain("53.5511");
    expect(reply.text).not.toContain("9.9937");
    expect(ParentWeatherResponseSchema.parse(reply.json)).toEqual({
      source: "config",
      weather: { unit: "fahrenheit", coordinates: true },
      status: "ok",
    });
  });

  it("stores an unknown town and reports place_unknown", async () => {
    const h = harness();
    knownPlaces = new Set();
    expect(await setting(h, put({ place: PLACE, unit: "celsius" }))).toEqual({
      source: "editor",
      weather: { place: PLACE, unit: "celsius" },
      status: "place_unknown",
    });
    expect(await storedRow()).not.toBeNull();
    // The board learns that weather is on; its request fails quietly with 503.
    expect(await weatherFlag(h)).toBe(true);
    const weather = await h.call("/api/weather");
    expect(weather.status).toBe(503);
    expect((weather.json as { error: string }).error).toBe(
      "weather_place_unknown",
    );
    expect(consoleOutput.join("\n")).toContain(
      "weather: the configured place was not found",
    );
  });

  it("reports unavailable when the forecast service fails", async () => {
    const h = harness();
    forecastFails = true;
    expect(
      (await setting(h, put({ place: PLACE, unit: "celsius" }))).status,
    ).toBe("unavailable");
  });

  it("ignores a stored setting while the editor is off (the config applies)", async () => {
    const h = harness();
    await setting(h, put({ off: true }));
    h.use({ KIDBOARD_PARENT_PIN: "" }, { weather: { place: CONFIG_PLACE } });
    expect(await weatherFlag(h)).toBe(true);
    expect((await h.call("/api/weather")).status).toBe(200);
  });

  it("never invalidates the feed caches: the agenda is served without a refetch", async () => {
    const h = harness();
    expect((await h.call("/api/agenda?days=1")).status).toBe(200);
    await setting(h, put({ place: PLACE, unit: "celsius" }));
    await setting(h, put({ off: true }));
    await setting(h, { method: "DELETE" });
    expect((await h.call("/api/agenda?days=1")).status).toBe(200);
    expect(fetched.filter((e) => e.startsWith("https://feeds."))).toHaveLength(
      1,
    );
  });
});

describe("weather setting: D1 problems", () => {
  it("falls back to the config's block when D1 fails (never a 500)", async () => {
    const h = harness();
    await setting(h, put({ off: true }));
    h.use(
      { KIDBOARD_DATA: brokenSettingRow("throw") },
      { weather: { place: CONFIG_PLACE } },
    );
    expect(await weatherFlag(h)).toBe(true);
    expect((await h.call("/api/weather")).status).toBe(200);
    expect(consoleOutput.join("\n")).toContain(
      "weather: D1 unavailable (Error), using the configuration",
    );
  });

  it("falls back to the config's block when D1 is slower than the deadline", async () => {
    const h = harness({ d1TimeoutMs: 20 });
    await h.token();
    h.use(
      { KIDBOARD_DATA: brokenSettingRow("hang") },
      { weather: { place: CONFIG_PLACE } },
    );
    expect(await weatherFlag(h)).toBe(true);
    expect(consoleOutput.join("\n")).toContain(
      "weather: D1 unavailable (DeadlineError), using the configuration",
    );
  });

  it("answers 503 storage_unavailable on the parent routes when D1 fails", async () => {
    const h = harness();
    await h.token();
    h.use({ KIDBOARD_DATA: brokenSettingRow("throw") });
    for (const init of [
      undefined,
      put({ place: PLACE, unit: "celsius" }),
      { method: "DELETE" },
    ]) {
      const reply = await h.parent("/api/parent/weather", init);
      expect(reply.status).toBe(503);
      expect((reply.json as { error: string }).error).toBe(
        "storage_unavailable",
      );
    }
    expect(consoleOutput.join("\n")).toContain(
      "weather setting: D1 unavailable (Error)",
    );
  });

  it("ignores a corrupt row and logs it once with a fixed text", async () => {
    const h = harness();
    await h.token();
    await db
      .prepare("INSERT INTO kb_meta (key, value) VALUES (?1, ?2)")
      .bind(
        WEATHER_SETTING_KEY,
        JSON.stringify({ place: PLACE, unit: "kelvin" }),
      )
      .run();
    h.use({}, { weather: { place: CONFIG_PLACE } });
    expect(await weatherFlag(h)).toBe(true);
    expect(await weatherFlag(h)).toBe(true);
    expect((await setting(h)).source).toBe("config");
    const warnings = consoleOutput.filter((line) =>
      line.includes("stored weather setting is invalid"),
    );
    expect(warnings).toHaveLength(1);
    // Not JSON at all: logged again (a different value), still a fixed text.
    await db
      .prepare("UPDATE kb_meta SET value = ?2 WHERE key = ?1")
      .bind(WEATHER_SETTING_KEY, `{${PLACE}`)
      .run();
    expect(await weatherFlag(h)).toBe(true);
    expect(
      consoleOutput.filter((line) =>
        line.includes("stored weather setting is invalid"),
      ),
    ).toHaveLength(2);
    // A save replaces the corrupt row.
    await setting(h, put({ off: true }));
    expect(await weatherFlag(h)).toBe(false);
  });
});

describe("weather setting: auth and validation", () => {
  it("needs the parent session (403) and the access token (401)", async () => {
    const h = harness();
    for (const init of [
      undefined,
      put({ place: PLACE, unit: "celsius" }),
      { method: "DELETE" },
    ]) {
      const locked = await h.call("/api/parent/weather", init);
      expect(locked.status).toBe(403);
      expect((locked.json as { error: string }).error).toBe("parent_locked");
      const forged = await h.call("/api/parent/weather", {
        ...init,
        session: "v1.9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      });
      expect(forged.status).toBe(403);
      const noAccess = await h.call("/api/parent/weather", {
        ...init,
        access: false,
        session: await h.token(),
      });
      expect(noAccess.status).toBe(401);
    }
    expect(await storedRow()).toBeNull();
  });

  it("is 404 while the editor is off", async () => {
    const h = harness();
    const session = await h.token();
    h.use({ KIDBOARD_PARENT_PIN: "" });
    const reply = await h.call("/api/parent/weather", {
      ...put({ place: PLACE, unit: "celsius" }),
      session,
    });
    expect(reply.status).toBe(404);
    expect(await storedRow()).toBeNull();
  });

  it.each([
    ["not JSON", `{"place":"${PLACE}"`, "Body must be JSON"],
    ["no unit", { place: PLACE }, "Invalid request body"],
    ["unknown unit", { place: PLACE, unit: "kelvin" }, "Invalid request body"],
    [
      "too long",
      { place: `${PLACE}${"x".repeat(80)}`, unit: "celsius" },
      "Invalid field: place",
    ],
    ["blank place", { place: "   ", unit: "celsius" }, "Invalid field: place"],
    [
      "lower-case country",
      { place: PLACE, country: "de", unit: "celsius" },
      "Invalid field: country",
    ],
    [
      "coordinates",
      { latitude: 1, longitude: 2, unit: "celsius" },
      "Invalid request body",
    ],
    ["off false", { off: false }, "Invalid request body"],
    ["extra key", { off: true, place: PLACE }, "Invalid request body"],
    ["array", [{ off: true }], "Invalid request body"],
  ])(
    "rejects a body that is %s with a fixed 400",
    async (_name, body, message) => {
      const h = harness();
      const reply = await h.parent("/api/parent/weather", put(body));
      expect(reply.status).toBe(400);
      expect(reply.json).toEqual({ error: "bad_request", message });
      expect(await storedRow()).toBeNull();
    },
  );

  it("refuses bodies over the parent body limit", async () => {
    const h = harness();
    const reply = await h.parent(
      "/api/parent/weather",
      put({ place: PLACE.repeat(1000), unit: "celsius" }),
    );
    expect(reply.status).toBe(413);
    expect(MAX_PARENT_BODY_BYTES).toBeLessThan(PLACE.length * 1000);
  });

  it("lets a listed origin send PUT (CORS preflight)", async () => {
    const h = harness();
    h.use({ KIDBOARD_ALLOWED_ORIGINS: "https://parent.example.test" });
    const reply = await h.call("/api/parent/weather", {
      method: "OPTIONS",
      headers: {
        Origin: "https://parent.example.test",
        "Access-Control-Request-Method": "PUT",
      },
    });
    expect(reply.status).toBe(204);
  });
});

describe("weather setting: backup", () => {
  it("is not part of the export and survives an import that replaces everything", async () => {
    const h = harness();
    await setting(h, put({ place: PLACE, unit: "celsius" }));
    const exported = await h.parent("/api/parent/export");
    expect(exported.status).toBe(200);
    expect(exported.text).not.toContain(PLACE);
    expect(exported.text).not.toContain(WEATHER_SETTING_KEY);
    const imported = await h.parent("/api/parent/import?mode=replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: exported.text,
    });
    expect(imported.status, imported.text).toBe(200);
    expect(await setting(h)).toEqual({
      source: "editor",
      weather: { place: PLACE, unit: "celsius" },
      status: "ok",
    });
  });
});
