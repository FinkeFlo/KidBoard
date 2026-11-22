import { describe, expect, it } from "vitest";

import {
  deriveConnectionStatus,
  isAgendaDegraded,
  type QueryHealth,
} from "./connectionStatus";
import { agendaFixture } from "./testing.test-utils";

const ok: QueryHealth = { hasData: true, isError: false, dataStale: false };
const pending: QueryHealth = {
  hasData: false,
  isError: false,
  dataStale: false,
};
const failedNoData: QueryHealth = {
  hasData: false,
  isError: true,
  dataStale: false,
};
const failedWithData: QueryHealth = {
  hasData: true,
  isError: true,
  dataStale: false,
};
const workerStale: QueryHealth = {
  hasData: true,
  isError: false,
  dataStale: true,
};

describe("deriveConnectionStatus", () => {
  it.each<[string, Parameters<typeof deriveConnectionStatus>[0], string]>([
    ["restoring", { restoring: true, online: true, queries: [ok] }, "loading"],
    [
      "no query in use",
      { restoring: false, online: true, queries: [] },
      "loading",
    ],
    [
      "first fetch running",
      { restoring: false, online: true, queries: [ok, pending] },
      "loading",
    ],
    [
      "all data current",
      { restoring: false, online: true, queries: [ok, ok] },
      "ready",
    ],
    [
      "offline with data",
      { restoring: false, online: false, queries: [ok, ok] },
      "offline",
    ],
    [
      "offline without data",
      { restoring: false, online: false, queries: [pending] },
      "offline",
    ],
    [
      "offline beats stale",
      {
        restoring: false,
        online: false,
        queries: [failedWithData, workerStale],
      },
      "offline",
    ],
    [
      "worker served last-good",
      { restoring: false, online: true, queries: [ok, workerStale] },
      "stale",
    ],
    [
      "refetch failed, data kept",
      { restoring: false, online: true, queries: [ok, failedWithData] },
      "stale",
    ],
    [
      "failed without data",
      { restoring: false, online: true, queries: [ok, failedNoData] },
      "error",
    ],
    [
      "error beats offline",
      { restoring: false, online: false, queries: [failedNoData] },
      "error",
    ],
    [
      "error beats loading",
      { restoring: false, online: true, queries: [pending, failedNoData] },
      "error",
    ],
  ])("%s → %s", (_name, input, expected) => {
    expect(deriveConnectionStatus(input)).toBe(expected);
  });
});

describe("isAgendaDegraded", () => {
  it("is false for a complete, fresh agenda", () => {
    expect(isAgendaDegraded(agendaFixture())).toBe(false);
  });

  it("is true when the worker served last-good data", () => {
    expect(isAgendaDegraded(agendaFixture({ stale: true }))).toBe(true);
  });

  it("is true when a source failed even though stale is false", () => {
    expect(
      isAgendaDegraded(
        agendaFixture({
          stale: false,
          sources: [
            {
              id: "family",
              status: "ok",
              fetchedAt: "2026-11-22T08:00:00+01:00",
            },
            { id: "meals", status: "error" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("is false for non-agenda data", () => {
    expect(isAgendaDegraded(undefined)).toBe(false);
    expect(isAgendaDegraded({ refreshMinutes: 60 })).toBe(false);
  });
});
