import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  createApiClient,
  REQUEST_TIMEOUT_MS,
  WORKER_UPSTREAM_BUDGET_MS,
} from "./apiClient";
import {
  agendaFixture,
  allFailedAgenda,
  configFixture,
  createFakeFetch,
  TEST_TOKEN,
  TODAY,
} from "./testing.test-utils";

const RANGE = { from: TODAY, days: 8 };

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createApiClient", () => {
  it("fetches and validates /api/config (defaults applied)", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/config", {
      status: 200,
      body: { calendars: [{ id: "family", kind: "events" }] },
    });
    const api = createApiClient({ fetch: fake.fetch });

    const config = await api.getConfig();

    expect(config.refreshMinutes).toBe(60);
    expect(config.locale).toBe("auto");
    expect(config.editor).toBe(false);
    expect(fake.calls[0]?.url).toBe("/api/config");
  });

  it("reads the editor flag and ignores unknown top-level config keys", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/config", {
      status: 200,
      body: {
        calendars: [{ id: "family", kind: "events" }],
        editor: true,
        laterFeature: { on: true },
      },
    });
    const api = createApiClient({ fetch: fake.fetch });

    const config = await api.getConfig();

    expect(config.editor).toBe(true);
    expect(config).not.toHaveProperty("laterFeature");
  });

  it("requests /api/agenda with from and days and returns the parsed body", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/agenda", { status: 200, body: agendaFixture() });
    const api = createApiClient({
      fetch: fake.fetch,
      baseUrl: "https://kb.test",
    });

    const agenda = await api.getAgenda(RANGE);

    expect(agenda.events[0]?.title).toBe("Swimming");
    expect(fake.calls[0]?.url).toBe(
      `https://kb.test/api/agenda?from=${TODAY}&days=8`,
    );
    expect(fake.calls[0]?.init?.cache).toBe("no-store");
  });

  it("sends the token as Bearer header and never in the URL", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/config", { status: 200, body: configFixture() });
    const api = createApiClient({ fetch: fake.fetch, token: TEST_TOKEN });

    await api.getConfig();

    const call = fake.calls[0];
    expect(call?.url).not.toContain(TEST_TOKEN);
    expect(new Headers(call?.init?.headers).get("Authorization")).toBe(
      `Bearer ${TEST_TOKEN}`,
    );
  });

  it("sends no Authorization header without a token", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/config", { status: 200, body: configFixture() });
    await createApiClient({ fetch: fake.fetch, token: "" }).getConfig();

    expect(new Headers(fake.calls[0]?.init?.headers).has("Authorization")).toBe(
      false,
    );
  });

  it.each([
    [400, "bad-request"],
    [401, "unauthorized"],
    [404, "http"],
    [500, "server"],
    [502, "upstream"],
    [503, "http"],
  ] as const)("maps HTTP %i to %s", async (status, kind) => {
    const fake = createFakeFetch();
    fake.setReplies("/api/agenda", {
      status,
      body: { error: "x", message: "y" },
    });
    const error = await rejection(
      createApiClient({ fetch: fake.fetch }).getAgenda(RANGE),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind, status, path: "/api/agenda" });
  });

  it("treats the 502 body (all sources failed) as an error, not as data", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/agenda", { status: 502, body: allFailedAgenda() });
    const error = await rejection(
      createApiClient({ fetch: fake.fetch }).getAgenda(RANGE),
    );

    expect(error).toMatchObject({ kind: "upstream", status: 502 });
  });

  it("rejects a schema-invalid 200 response", async () => {
    const fake = createFakeFetch();
    const broken = { ...agendaFixture(), events: [{ id: "e1" }] };
    fake.setReplies("/api/agenda", { status: 200, body: broken });
    const error = await rejection(
      createApiClient({ fetch: fake.fetch }).getAgenda(RANGE),
    );

    expect(error).toMatchObject({ kind: "invalid-response", status: 200 });
  });

  it("rejects a config that violates the shared schema", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/config", { status: 200, body: { calendars: [] } });
    const error = await rejection(
      createApiClient({ fetch: fake.fetch }).getConfig(),
    );

    expect(error).toMatchObject({ kind: "invalid-response" });
  });

  it("rejects non-JSON bodies", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/config", { raw: "<html>captive portal</html>" });
    const error = await rejection(
      createApiClient({ fetch: fake.fetch }).getConfig(),
    );

    expect(error).toMatchObject({ kind: "invalid-response" });
  });

  it("rejects an agenda for a different range than requested", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/agenda", {
      status: 200,
      body: agendaFixture({ range: { from: "2026-11-23", to: "2026-12-01" } }),
    });
    const error = await rejection(
      createApiClient({ fetch: fake.fetch }).getAgenda(RANGE),
    );

    expect(error).toMatchObject({ kind: "invalid-response" });
  });

  it("maps fetch failures to network errors without leaking details", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/config", "network-error");
    const error = await rejection(
      createApiClient({ fetch: fake.fetch, token: TEST_TOKEN }).getConfig(),
    );

    expect(error).toMatchObject({ kind: "network" });
    expect(String(error)).not.toContain(TEST_TOKEN);
  });

  it("times out after timeoutMs and aborts the request", async () => {
    vi.useFakeTimers();
    const fake = createFakeFetch();
    fake.setReplies("/api/agenda", "hang");
    const promise = rejection(
      createApiClient({ fetch: fake.fetch, timeoutMs: 5000 }).getAgenda(RANGE),
    );

    await vi.advanceTimersByTimeAsync(4999);
    expect(fake.calls[0]?.init?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await promise).toMatchObject({ kind: "timeout" });
    expect(fake.calls[0]?.init?.signal?.aborted).toBe(true);
  });

  it("uses a default timeout above the worker's upstream budget", async () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(WORKER_UPSTREAM_BUDGET_MS);
    expect(WORKER_UPSTREAM_BUDGET_MS).toBe(11_000);

    vi.useFakeTimers();
    const fake = createFakeFetch();
    fake.setReplies("/api/agenda", "hang");
    const promise = rejection(
      createApiClient({ fetch: fake.fetch }).getAgenda(RANGE),
    );

    await vi.advanceTimersByTimeAsync(WORKER_UPSTREAM_BUDGET_MS + 1000);
    expect(fake.calls[0]?.init?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    expect(await promise).toMatchObject({ kind: "timeout" });
  });

  it("passes a caller cancellation through as an abort, not an ApiError", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/agenda", "hang");
    const controller = new AbortController();
    const promise = rejection(
      createApiClient({ fetch: fake.fetch }).getAgenda(
        RANGE,
        controller.signal,
      ),
    );
    controller.abort();

    const error = await promise;
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: "AbortError" });
  });

  it("rejects with an abort (not an ApiError) when the signal is already aborted", async () => {
    const fake = createFakeFetch();
    fake.setReplies("/api/config", "hang");
    const controller = new AbortController();
    controller.abort();

    const error = await rejection(
      createApiClient({ fetch: fake.fetch }).getConfig(controller.signal),
    );

    expect(error).not.toBeInstanceOf(ApiError);
    expect(fake.calls[0]?.init?.signal?.aborted).toBe(true);
  });
});
