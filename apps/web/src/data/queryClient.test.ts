import { onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { ApiError } from "./apiClient";
import {
  createQueryClient,
  MAX_RETRIES,
  PERSIST_MAX_AGE_MS,
  refreshIntervalMs,
  seedOnlineState,
  shouldRetry,
  STALE_TIME_MS,
} from "./queryClient";

describe("shouldRetry", () => {
  it.each(["network", "timeout", "upstream", "server"] as const)(
    "retries transient %s errors up to MAX_RETRIES",
    (kind) => {
      const error = new ApiError(kind, "/api/agenda");
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(MAX_RETRIES - 1, error)).toBe(true);
      expect(shouldRetry(MAX_RETRIES, error)).toBe(false);
    },
  );

  it.each(["unauthorized", "bad-request", "invalid-response"] as const)(
    "never retries deterministic %s errors",
    (kind) => {
      expect(shouldRetry(0, new ApiError(kind, "/api/config"))).toBe(false);
    },
  );

  it("retries other HTTP statuses only for 429 and 5xx", () => {
    expect(shouldRetry(0, new ApiError("http", "/api/agenda", 429))).toBe(true);
    expect(shouldRetry(0, new ApiError("http", "/api/agenda", 503))).toBe(true);
    expect(shouldRetry(0, new ApiError("http", "/api/agenda", 404))).toBe(
      false,
    );
    expect(shouldRetry(0, new ApiError("http", "/api/agenda", 403))).toBe(
      false,
    );
    expect(shouldRetry(0, new ApiError("http", "/api/agenda"))).toBe(false);
  });

  it("never retries unknown errors", () => {
    expect(shouldRetry(0, new Error("boom"))).toBe(false);
  });
});

describe("refreshIntervalMs", () => {
  it("converts refreshMinutes and defaults to 60 min", () => {
    expect(refreshIntervalMs(30)).toBe(30 * 60_000);
    expect(refreshIntervalMs(undefined)).toBe(60 * 60_000);
  });
});

describe("createQueryClient", () => {
  it("applies the ADR-0006 defaults", () => {
    const queries = createQueryClient().getDefaultOptions().queries;
    expect(queries?.gcTime).toBe(PERSIST_MAX_AGE_MS);
    expect(PERSIST_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(queries?.staleTime).toBe(STALE_TIME_MS);
    expect(STALE_TIME_MS).toBe(15 * 60 * 1000);
    expect(queries?.refetchOnWindowFocus).toBe(true);
    expect(queries?.refetchOnReconnect).toBe(true);
    expect(queries?.retry).toBe(shouldRetry);
  });

  it("can disable retries", () => {
    expect(
      createQueryClient({ retry: false }).getDefaultOptions().queries?.retry,
    ).toBe(false);
  });
});

describe("seedOnlineState", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("starts offline when the device boots without network", () => {
    seedOnlineState(() => false);
    expect(onlineManager.isOnline()).toBe(false);
    seedOnlineState(() => true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("reads navigator.onLine by default", () => {
    seedOnlineState();
    expect(onlineManager.isOnline()).toBe(navigator.onLine);
  });
});
