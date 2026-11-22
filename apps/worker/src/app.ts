import {
  addCalendarDays,
  APP_NAME,
  DateStringSchema,
  todayInZone,
  toPublicConfig,
} from "@kidboard/shared";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { validator } from "hono/validator";
import { z } from "zod";

import { buildAgenda } from "./agenda/buildAgenda";
import { type Flight, loadSource } from "./agenda/loadSource";
import { loadConfig } from "./config/loadConfig";
import type { AppEnv } from "./env";
import { cacheBackend, kvBackend, SourceStore } from "./feeds/sourceStore";
import { accessToken } from "./http/auth";
import { parseCalendarDate } from "./ical/zonedTime";
import { logError, logWarn } from "./log";

/** Default `days` of `/api/agenda`. */
export const DEFAULT_DAYS = 8;
/** Maximum `days` of `/api/agenda`. */
export const MAX_DAYS = 14;
/**
 * Cached window per source, relative to today in the config zone: `[today - 1,
 * today + 32)`. Expansion runs once per window and TTL; requests are served by
 * filtering it, so `[from, from + days)` must lie inside it (else 400).
 */
export const WINDOW_DAYS_BEFORE = 1;
/** 32 days ahead: T-19 looks for countdown events up to 30 days ahead. */
export const WINDOW_DAYS_AFTER = 32;

export const DEFAULT_CACHE_TTL_SECONDS = 3600;
const MIN_CACHE_TTL_SECONDS = 60;
const MAX_CACHE_TTL_SECONDS = 86_400;
/**
 * Share of the Workers Free KV quota (1 000 writes/day) the source cache may use:
 * every refresh writes one key per source, so the TTL is raised to at least
 * `ceil(sources × 86 400 / 500)` seconds when KV is bound (leaves room for day
 * rollovers, concurrent refreshes in other data centers and other uses).
 */
export const KV_WRITES_PER_DAY_BUDGET = 500;

export interface AppOptions {
  /** Clock (epoch ms); defaults to `Date.now`. */
  now?: () => number;
  /** Cache API cache used without a KV binding; defaults to `caches.default`. */
  openCache?: () => Promise<Cache>;
  /** Upstream timeout override (default 10 s). */
  fetchTimeoutMs?: number;
  /** Upstream size limit override (default 5 MB). */
  fetchMaxBytes?: number;
}

const QUERY_MESSAGES: Record<string, string> = {
  from: "from must be a valid date YYYY-MM-DD",
  days: `days must be an integer from 1 to ${String(MAX_DAYS)}`,
};

const AgendaQuerySchema = z.object({
  from: z
    .string()
    .pipe(DateStringSchema)
    .refine((d) => parseCalendarDate(d) !== null)
    .optional(),
  days: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_DAYS))
    .optional(),
});

function badRequest(c: Context, message: string): Response {
  return c.json({ error: "bad_request", message }, 400);
}

let ttlMemo: { raw: string | undefined; seconds: number } | undefined;

/** `KIDBOARD_CACHE_TTL` in seconds; invalid or out of range (60-86400) → default. */
export function cacheTtlSeconds(raw: string | undefined): number {
  if (ttlMemo === undefined || ttlMemo.raw !== raw) {
    let seconds = DEFAULT_CACHE_TTL_SECONDS;
    if (raw !== undefined && raw.trim() !== "") {
      const value = Number(raw.trim());
      if (
        Number.isInteger(value) &&
        value >= MIN_CACHE_TTL_SECONDS &&
        value <= MAX_CACHE_TTL_SECONDS
      ) {
        seconds = value;
      } else {
        logWarn(
          `KIDBOARD_CACHE_TTL must be an integer from ${String(MIN_CACHE_TTL_SECONDS)} to ${String(MAX_CACHE_TTL_SECONDS)}; using ${String(DEFAULT_CACHE_TTL_SECONDS)}`,
        );
      }
    }
    ttlMemo = { raw, seconds };
  }
  return ttlMemo.seconds;
}

let clampMemo: string | undefined;

/**
 * Fresh TTL actually used: with KV, at least the minimum that keeps the daily writes
 * within {@link KV_WRITES_PER_DAY_BUDGET} (logged once per value).
 */
export function effectiveTtlSeconds(
  configured: number,
  sourceCount: number,
  usesKv: boolean,
): number {
  if (!usesKv) {
    return configured;
  }
  const minimum = Math.ceil((sourceCount * 86_400) / KV_WRITES_PER_DAY_BUDGET);
  if (configured >= minimum) {
    return configured;
  }
  const memoKey = `${String(configured)}/${String(sourceCount)}`;
  if (clampMemo !== memoKey) {
    clampMemo = memoKey;
    logWarn(
      `KIDBOARD_CACHE_TTL ${String(configured)} s would exceed the KV write budget for ${String(sourceCount)} calendars; using ${String(minimum)} s`,
    );
  }
  return minimum;
}

function allowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
}

/** Builds the Hono app. Options exist for tests (clock, cache, limits). */
export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const now = options.now ?? Date.now;
  const store = new SourceStore();
  const fallbackBackend = cacheBackend(
    options.openCache ?? (() => Promise.resolve(caches.default)),
  );
  const inflight = new Map<string, Flight>();
  const app = new Hono<AppEnv>();

  // ADR-0006: the client (TanStack Query) owns API caching; never cache in browsers
  // or intermediaries.
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      // Same-origin requests need no CORS; cross-origin only for listed origins.
      origin: (origin, c: Context<AppEnv>) =>
        allowedOrigins(c.env.KIDBOARD_ALLOWED_ORIGINS).includes(origin)
          ? origin
          : null,
      allowMethods: ["GET", "HEAD", "OPTIONS"],
      allowHeaders: ["Authorization"],
      maxAge: 600,
    }),
  );
  app.use("*", accessToken());

  app.get("/api/health", (c) => {
    c.header("X-App-Name", APP_NAME);
    return c.json({ ok: true });
  });

  app.get("/api/config", (c) => {
    const loaded = loadConfig(c.env.KIDBOARD_CONFIG);
    if (!loaded.ok) {
      return c.json(
        {
          error: "server_misconfigured",
          message: "Server configuration is invalid",
        },
        500,
      );
    }
    return c.json(toPublicConfig(loaded.config));
  });

  app.get(
    "/api/agenda",
    validator("query", (value, c) => {
      const parsed = AgendaQuerySchema.safeParse(value);
      if (!parsed.success) {
        const field = String(parsed.error.issues[0]?.path[0] ?? "");
        return badRequest(
          c,
          QUERY_MESSAGES[field] ?? "Invalid query parameters",
        );
      }
      return parsed.data;
    }),
    async (c) => {
      const loaded = loadConfig(c.env.KIDBOARD_CONFIG);
      if (!loaded.ok) {
        return c.json(
          {
            error: "server_misconfigured",
            message: "Server configuration is invalid",
          },
          500,
        );
      }
      const { config } = loaded;
      const query = c.req.valid("query");
      const nowMs = now();
      const today = todayInZone(nowMs, config.timeZone);
      const window = {
        from: addCalendarDays(today, -WINDOW_DAYS_BEFORE),
        to: addCalendarDays(today, WINDOW_DAYS_AFTER),
      };
      const days = query.days ?? DEFAULT_DAYS;
      const from = query.from ?? today;
      const to = addCalendarDays(from, days);
      if (from < window.from || to > window.to) {
        return badRequest(
          c,
          `from + days must lie between ${window.from} and ${window.to}`,
        );
      }

      const configHash = await loaded.hash;
      // ADR-0006: KV when bound (works everywhere, global), else the Cache API.
      const kv = c.env.KIDBOARD_CACHE;
      const backend = kv === undefined ? fallbackBackend : kvBackend(kv);
      const freshTtlSeconds = effectiveTtlSeconds(
        cacheTtlSeconds(c.env.KIDBOARD_CACHE_TTL),
        config.calendars.length,
        backend.kind === "kv",
      );
      const results = await Promise.all(
        config.calendars.map((source) =>
          loadSource(source, {
            env: c.env,
            config,
            configHash,
            window,
            nowMs,
            freshTtlSeconds,
            store,
            backend,
            inflight,
            defer: (work) => {
              defer(c, work);
            },
            ...(options.fetchTimeoutMs === undefined
              ? {}
              : { fetchTimeoutMs: options.fetchTimeoutMs }),
            ...(options.fetchMaxBytes === undefined
              ? {}
              : { fetchMaxBytes: options.fetchMaxBytes }),
          }),
        ),
      );
      const { body, status } = buildAgenda(
        results,
        { from, to },
        config.timeZone,
        nowMs,
      );
      return c.json(body, status);
    },
  );

  app.notFound((c) =>
    c.json({ error: "not_found", message: "Not found" }, 404),
  );

  app.onError((error, c) => {
    // Log the error type only: messages of runtime errors may quote URLs or feed text.
    logError(`unhandled ${error.name} on ${c.req.method} ${c.req.path}`);
    return c.json(
      { error: "internal_error", message: "Internal server error" },
      500,
    );
  });

  return app;
}

/** Runs `work` past the response via `waitUntil`; without an ExecutionContext it just runs. */
function defer(c: Context<AppEnv>, work: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // No ExecutionContext (e.g. `app.request()`): the promise keeps running on its own.
    void work;
  }
}
