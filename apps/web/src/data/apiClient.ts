import {
  type AgendaResponse,
  AgendaResponseSchema,
  DateTimeStringSchema,
  type PublicConfig,
  PublicConfigSchema,
} from "@kidboard/shared";
import { z } from "zod";

/**
 * Worst-case time the worker needs for `/api/agenda` before it answers with last-good
 * data or 502: the upstream feed timeout (10 s, `FEED_TIMEOUT_MS`) plus the flight
 * margin (1 s, `FLIGHT_MARGIN_MS`) in `apps/worker`. Sources load in parallel.
 */
export const WORKER_UPSTREAM_BUDGET_MS = 11_000;
/**
 * Client request timeout (headers and body). Must exceed the worker budget so a slow
 * upstream still lets stale data arrive; 4 s margin for KV I/O and weak Wi-Fi.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Classification of failed API calls; drives retries and the connection status. */
export type ApiErrorKind =
  /** No response (offline, DNS, connection reset). */
  | "network"
  /** No complete response within {@link REQUEST_TIMEOUT_MS}. */
  | "timeout"
  /** 401: access token missing or wrong. */
  | "unauthorized"
  /** 400: invalid query parameters (a client bug). */
  | "bad-request"
  /** 502: every calendar source failed and the worker had no last-good data. */
  | "upstream"
  /** 500: server misconfigured or internal error. */
  | "server"
  /** Any other non-2xx status. */
  | "http"
  /** 2xx, but not JSON or not matching the shared zod schema. */
  | "invalid-response";

/**
 * Error thrown by {@link ApiClient}. Messages name the path and status only: never
 * the token, never response bodies (they may quote feed content).
 */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly kind: ApiErrorKind,
    readonly path: string,
    readonly status?: number,
  ) {
    super(
      status === undefined
        ? `${path}: ${kind}`
        : `${path}: ${kind} (HTTP ${String(status)})`,
    );
  }
}

/** Requested agenda range: `days` days starting at `from` (`YYYY-MM-DD`, config zone). */
export interface AgendaRange {
  from: string;
  /** 1-14 (worker limit). */
  days: number;
}

/** Header that carries the parent session token (ADR-0013). */
export const PARENT_SESSION_HEADER = "X-KidBoard-Parent";

/** Lockout length when neither `Retry-After` nor the body says (ADR-0013: 15 min). */
export const DEFAULT_LOCKOUT_SECONDS = 15 * 60;

/**
 * Answer of `POST /api/parent/unlock` for its three expected outcomes. Anything else
 * (401 access token, 404 editor off, network, timeout, …) is thrown as {@link ApiError}.
 */
export type ParentUnlockResult =
  /** Session token and its expiry (epoch ms, server clock). */
  | { kind: "unlocked"; token: string; expiresAt: number }
  /** 403 `wrong_pin`. */
  | { kind: "wrong-pin"; attemptsLeft: number }
  /** 429 `parent_lockout`; seconds from `Retry-After` (fallback: body, then 15 min). */
  | { kind: "lockout"; retryAfterSeconds: number };

/** `GET /api/parent/session`: the session's expiry (epoch ms, server clock). */
export interface ParentSessionInfo {
  expiresAt: number;
}

export interface ApiClient {
  getConfig(signal?: AbortSignal): Promise<PublicConfig>;
  getAgenda(range: AgendaRange, signal?: AbortSignal): Promise<AgendaResponse>;
  /**
   * Exchanges the parent PIN for a session token (ADR-0013). Not a TanStack query, so
   * no answer of it (not even a 401) runs the board's "forget the access token" path.
   */
  unlockParent(pin: string, signal?: AbortSignal): Promise<ParentUnlockResult>;
  /** Checks a session token; `null` when the worker answers 403 `parent_locked`. */
  getParentSession(
    token: string,
    signal?: AbortSignal,
  ): Promise<ParentSessionInfo | null>;
}

export interface ApiClientOptions {
  /** Optional access token, sent as `Authorization: Bearer`. */
  token?: string | undefined;
  /** Origin prefix for API paths; default `""` (same origin). */
  baseUrl?: string;
  /** Fetch implementation; defaults to the global `fetch` (looked up per call). */
  fetch?: typeof fetch;
  /** Request timeout override (tests). */
  timeoutMs?: number;
}

const InstantSchema = DateTimeStringSchema.transform((value) =>
  Date.parse(value),
);
const UnlockOkSchema = z.object({
  token: z.string().min(1),
  expiresAt: InstantSchema,
});
const WrongPinSchema = z.object({
  error: z.literal("wrong_pin"),
  attemptsLeft: z.number().int().min(0),
});
const SessionOkSchema = z.object({ expiresAt: InstantSchema });
const LockoutBodySchema = z.object({
  retryAfterSeconds: z.number().int().positive(),
});

function statusKind(status: number): ApiErrorKind {
  switch (status) {
    case 400:
      return "bad-request";
    case 401:
      return "unauthorized";
    case 500:
      return "server";
    case 502:
      return "upstream";
    default:
      return "http";
  }
}

function parseBody<T>(
  text: string,
  schema: z.ZodType<T>,
  path: string,
  status: number,
): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError("invalid-response", path, status);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("invalid-response", path, status);
  }
  return parsed.data;
}

interface RawResponse {
  status: number;
  text: string;
  headers: Headers;
}

/**
 * Seconds until a lockout ends: the `Retry-After` header (delta seconds, ADR-0013), else
 * the body's `retryAfterSeconds`, else {@link DEFAULT_LOCKOUT_SECONDS}.
 */
function lockoutSeconds(response: RawResponse): number {
  const header = response.headers.get("Retry-After")?.trim() ?? "";
  if (/^\d+$/.test(header) && Number(header) > 0) {
    return Number(header);
  }
  try {
    const body = LockoutBodySchema.safeParse(JSON.parse(response.text));
    if (body.success) return body.data.retryAfterSeconds;
  } catch {
    // Not JSON: fall back to the default.
  }
  return DEFAULT_LOCKOUT_SECONDS;
}

interface SendInit {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
}

/** Creates the typed client for `/api/config`, `/api/agenda` and `/api/parent/*`. */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? "";
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token !== undefined && options.token !== "") {
    headers.Authorization = `Bearer ${options.token}`;
  }

  /**
   * One request with the access token and the client timeout. No response or no
   * complete response becomes an {@link ApiError}; every HTTP status is returned.
   */
  async function send(
    path: string,
    query: string,
    init: SendInit,
    signal: AbortSignal | undefined,
  ): Promise<RawResponse> {
    const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    // Own controller instead of `AbortSignal.any`/`AbortSignal.timeout` so older
    // kiosk WebViews work and a timeout can be told apart from a cancellation.
    const controller = new AbortController();
    const deadline = { hit: false };
    const timer = setTimeout(() => {
      deadline.hit = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = (): void => {
      controller.abort(signal?.reason);
    };
    if (signal?.aborted === true) {
      forwardAbort();
    }
    signal?.addEventListener("abort", forwardAbort, { once: true });

    try {
      const response = await fetchImpl(`${baseUrl}${path}${query}`, {
        ...(init.method === undefined ? {} : { method: init.method }),
        headers: { ...headers, ...init.headers },
        ...(init.body === undefined ? {} : { body: init.body }),
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      return { status: response.status, text, headers: response.headers };
    } catch (error) {
      if (deadline.hit) {
        throw new ApiError("timeout", path);
      }
      if (signal?.aborted === true) {
        // Cancellation by the caller (TanStack Query): let it see the original abort.
        throw error;
      }
      throw new ApiError("network", path);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forwardAbort);
    }
  }

  async function getJson<T>(
    path: string,
    query: string,
    schema: z.ZodType<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    const { status, text } = await send(path, query, {}, signal);
    if (status < 200 || status > 299) {
      // A 502 body is a valid AgendaResponse with every source in `error` and no
      // events: it carries nothing to show, so it is an error like any other and the
      // previous (persisted) data stays in the cache.
      throw new ApiError(statusKind(status), path, status);
    }
    return parseBody(text, schema, path, status);
  }

  async function unlockParent(
    pin: string,
    signal?: AbortSignal,
  ): Promise<ParentUnlockResult> {
    const path = "/api/parent/unlock";
    const response = await send(
      path,
      "",
      {
        method: "POST",
        body: JSON.stringify({ pin }),
        headers: { "Content-Type": "application/json" },
      },
      signal,
    );
    switch (response.status) {
      case 200: {
        const body = parseBody(response.text, UnlockOkSchema, path, 200);
        return {
          kind: "unlocked",
          token: body.token,
          expiresAt: body.expiresAt,
        };
      }
      case 403: {
        const body = parseBody(response.text, WrongPinSchema, path, 403);
        return { kind: "wrong-pin", attemptsLeft: body.attemptsLeft };
      }
      case 429:
        return { kind: "lockout", retryAfterSeconds: lockoutSeconds(response) };
      default:
        throw new ApiError(statusKind(response.status), path, response.status);
    }
  }

  async function getParentSession(
    token: string,
    signal?: AbortSignal,
  ): Promise<ParentSessionInfo | null> {
    const path = "/api/parent/session";
    const response = await send(
      path,
      "",
      { headers: { [PARENT_SESSION_HEADER]: token } },
      signal,
    );
    if (response.status === 200) {
      return parseBody(response.text, SessionOkSchema, path, 200);
    }
    if (response.status === 403) {
      // `parent_locked`: expired, or signed for another PIN or database.
      return null;
    }
    throw new ApiError(statusKind(response.status), path, response.status);
  }

  return {
    getConfig: (signal) =>
      getJson("/api/config", "", PublicConfigSchema, signal),
    getAgenda: async (range, signal) => {
      const params = new URLSearchParams({
        from: range.from,
        days: String(range.days),
      });
      const agenda = await getJson(
        "/api/agenda",
        `?${params.toString()}`,
        AgendaResponseSchema,
        signal,
      );
      if (agenda.range.from !== range.from) {
        throw new ApiError("invalid-response", "/api/agenda");
      }
      return agenda;
    },
    unlockParent,
    getParentSession,
  };
}
