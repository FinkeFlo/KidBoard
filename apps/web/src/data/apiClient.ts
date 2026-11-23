import {
  type AgendaResponse,
  AgendaResponseSchema,
  type PublicConfig,
  PublicConfigSchema,
} from "@kidboard/shared";
import type { z } from "zod";

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

export interface ApiClient {
  getConfig(signal?: AbortSignal): Promise<PublicConfig>;
  getAgenda(range: AgendaRange, signal?: AbortSignal): Promise<AgendaResponse>;
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

/** Creates the typed client for `/api/config` and `/api/agenda`. */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? "";
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token !== undefined && options.token !== "") {
    headers.Authorization = `Bearer ${options.token}`;
  }

  async function getJson<T>(
    path: string,
    query: string,
    schema: z.ZodType<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> {
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

    let status: number;
    let text: string;
    try {
      const response = await fetchImpl(`${baseUrl}${path}${query}`, {
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      status = response.status;
      text = await response.text();
    } catch (error) {
      if (deadline.hit) {
        throw new ApiError("timeout", path);
      }
      if (signal?.aborted === true) {
        // Cancellation by TanStack Query: let it see the original abort.
        throw error;
      }
      throw new ApiError("network", path);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forwardAbort);
    }

    if (status < 200 || status > 299) {
      // A 502 body is a valid AgendaResponse with every source in `error` and no
      // events: it carries nothing to show, so it is an error like any other and the
      // previous (persisted) data stays in the cache.
      throw new ApiError(statusKind(status), path, status);
    }
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
  };
}
