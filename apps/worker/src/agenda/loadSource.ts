import {
  type AppConfig,
  calendarSecretName,
  type CalendarSource,
} from "@kidboard/shared";

import { sha256Hex } from "../config/loadConfig";
import type { Env } from "../env";
import { FEED_TIMEOUT_MS, FeedFetchError, fetchFeed } from "../feeds/fetchFeed";
import {
  type SourceEntry,
  sourceKey,
  type SourceStore,
  type StoreBackend,
} from "../feeds/sourceStore";
import { FeedParseError } from "../ical/errors";
import { expandCalendar, type ExpandWarning } from "../ical/expandCalendar";
import { logError, logWarn } from "../log";
import { normalize } from "../normalize/normalize";

export type SourceResult =
  | { id: string; status: "ok" | "stale"; entry: SourceEntry }
  | { id: string; status: "error" };

/** An upstream load shared by concurrent requests of one isolate. */
export interface Flight {
  promise: Promise<SourceEntry>;
  /** Clock time (`LoadSourceContext.nowMs`) the load started. */
  startedAtMs: number;
}

/** Slack on top of the fetch timeout for expansion and normalization of a flight. */
export const FLIGHT_MARGIN_MS = 1000;

/** `promise`, or a `timeout` FeedFetchError after `ms` (the timer is cleared). */
async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new FeedFetchError("timeout"));
    }, ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export interface LoadSourceContext {
  env: Env;
  config: AppConfig;
  configHash: string;
  /** Cached window `[from, to)`, `YYYY-MM-DD` in the config zone. */
  window: { from: string; to: string };
  nowMs: number;
  freshTtlSeconds: number;
  store: SourceStore;
  backend: StoreBackend;
  /** Upstream loads in progress in this isolate, by source key and window. */
  inflight: Map<string, Flight>;
  /** Keeps background work (cache writes) alive after the response. */
  defer: (work: Promise<unknown>) => void;
  fetchTimeoutMs?: number;
  fetchMaxBytes?: number;
}

/**
 * Resolves the secret URL. `webcal://` (as offered by some calendar apps) is mapped to
 * `https://`. Returns null for anything that is not an http(s) URL.
 */
function resolveFeedUrl(raw: string): string | null {
  const value = raw.trim().replace(/^webcal:\/\//i, "https://");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Fresh = expanded for the current window and younger than the TTL. */
function isFresh(entry: SourceEntry, ctx: LoadSourceContext): boolean {
  return (
    entry.window.from === ctx.window.from &&
    entry.window.to === ctx.window.to &&
    ctx.nowMs - Date.parse(entry.fetchedAt) < ctx.freshTtlSeconds * 1000
  );
}

function describeFailure(error: unknown): string {
  if (error instanceof FeedFetchError) {
    return error.status === undefined
      ? error.reason
      : `${error.reason} ${String(error.status)}`;
  }
  if (error instanceof FeedParseError) {
    return `parse-${error.reason}`;
  }
  // Unexpected error: log its type only (messages may quote feed content).
  return `internal ${error instanceof Error ? error.name : typeof error}`;
}

function summarizeWarnings(warnings: readonly ExpandWarning[]): string {
  const counts = new Map<string, number>();
  for (const w of warnings) {
    counts.set(w.code, (counts.get(w.code) ?? 0) + 1);
  }
  return [...counts].map(([code, n]) => `${code} x${String(n)}`).join(", ");
}

async function fetchAndNormalize(
  source: CalendarSource,
  url: string,
  ctx: LoadSourceContext,
): Promise<SourceEntry> {
  const ics = await fetchFeed(url, {
    ...(ctx.fetchTimeoutMs === undefined
      ? {}
      : { timeoutMs: ctx.fetchTimeoutMs }),
    ...(ctx.fetchMaxBytes === undefined ? {} : { maxBytes: ctx.fetchMaxBytes }),
  });
  const expanded = expandCalendar(ics, {
    from: ctx.window.from,
    to: ctx.window.to,
    timeZone: ctx.config.timeZone,
  });
  if (expanded.warnings.length > 0) {
    logWarn(
      `source "${source.id}": ${summarizeWarnings(expanded.warnings)}${expanded.truncated ? " (truncated)" : ""}`,
    );
  }
  const { events, meals } = normalize(
    expanded.occurrences,
    source,
    ctx.config,
    {
      from: ctx.window.from,
      to: ctx.window.to,
    },
  );
  return {
    v: 1,
    sourceId: source.id,
    fetchedAt: new Date(ctx.nowMs).toISOString(),
    window: { ...ctx.window },
    truncated: expanded.truncated,
    events,
    meals,
  };
}

/**
 * Loads one source: fresh entry (same window, younger than the TTL) → upstream (fetch,
 * expand, normalize; then stored) → the older entry as last-good (`stale`) → `error`.
 *
 * The secret URL is only passed to `fetch` and hashed into the cache key; it never
 * appears in results, logs or error messages.
 */
export async function loadSource(
  source: CalendarSource,
  ctx: LoadSourceContext,
): Promise<SourceResult> {
  const secretName = calendarSecretName(source.id);
  const raw = ctx.env[secretName];
  if (raw === undefined || raw.trim() === "") {
    logError(`source "${source.id}": secret ${secretName} is not set`);
    return { id: source.id, status: "error" };
  }
  const url = resolveFeedUrl(raw);
  if (url === null) {
    logError(
      `source "${source.id}": secret ${secretName} is not an http(s) URL`,
    );
    return { id: source.id, status: "error" };
  }

  // The URL takes part in the key so that pointing a source at another calendar
  // invalidates its cache; only its hash is used.
  const hash = (
    await sha256Hex(`${ctx.configHash}\n${source.id}\n${url}`)
  ).slice(0, 32);
  const key = sourceKey(source.id, hash);
  const cached = await ctx.store.get(ctx.backend, key, ctx.nowMs);
  if (cached !== null && isFresh(cached, ctx)) {
    return { id: source.id, status: "ok", entry: cached };
  }

  // Single flight per isolate: concurrent requests share one upstream load.
  const flightKey = `${key}@${ctx.window.from}`;
  const maxFlightMs =
    (ctx.fetchTimeoutMs ?? FEED_TIMEOUT_MS) + FLIGHT_MARGIN_MS;
  let flight = ctx.inflight.get(flightKey);
  // A flight older than the fetch timeout plus margin is dead (e.g. its request was
  // cancelled before `waitUntil` took over): never join it, start a new one.
  if (flight === undefined || ctx.nowMs - flight.startedAtMs > maxFlightMs) {
    const promise = fetchAndNormalize(source, url, ctx).then((entry) => {
      ctx.defer(
        ctx.store.put(ctx.backend, key, entry).catch(() => {
          logWarn(
            `source "${source.id}": ${ctx.backend.kind} cache write failed`,
          );
        }),
      );
      return entry;
    });
    const own: Flight = { promise, startedAtMs: ctx.nowMs };
    const cleanup = (): void => {
      if (ctx.inflight.get(flightKey) === own) {
        ctx.inflight.delete(flightKey);
      }
    };
    promise.then(cleanup, cleanup);
    ctx.inflight.set(flightKey, own);
    // The owner keeps the load alive even if its client disconnects (bounded, so a
    // load that never settles cannot pin the request context either).
    ctx.defer(withDeadline(promise, maxFlightMs).catch(() => undefined));
    flight = own;
  }

  try {
    // Every waiter (owner or follower) gives up after `maxFlightMs`.
    const entry = await withDeadline(flight.promise, maxFlightMs);
    return { id: source.id, status: "ok", entry };
  } catch (error) {
    logWarn(
      `source "${source.id}": upstream failed (${describeFailure(error)}), ${cached === null ? "no last-good data" : "serving last-good data"}`,
    );
    return cached === null
      ? { id: source.id, status: "error" }
      : { id: source.id, status: "stale", entry: cached };
  }
}
