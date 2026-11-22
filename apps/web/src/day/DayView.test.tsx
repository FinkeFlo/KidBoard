import type { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  eventFixture,
  mealFixture,
  MIA,
} from "../components/fixtures.test-utils";
import { createApiClient } from "../data/apiClient";
import { createQueryClient } from "../data/queryClient";
import {
  agendaFixture,
  configFixture,
  createFakeFetch,
  createMemoryStorage,
  dataWrapper,
  type FakeFetch,
  TEST_TOKEN,
} from "../data/testing.test-utils";
import { applyLocale } from "../i18n";
import de from "../i18n/locales/de.json";
import en from "../i18n/locales/en.json";
import { DayView } from "./DayView";

let fake: FakeFetch;
let clients: QueryClient[] = [];

function renderDay(): void {
  const client = createQueryClient({ retry: false });
  clients.push(client);
  const Wrapper = dataWrapper(
    createApiClient({ fetch: fake.fetch, token: TEST_TOKEN }),
    client,
    createMemoryStorage(),
  );
  render(
    <Wrapper>
      <DayView />
    </Wrapper>,
  );
}

const config = configFixture({ children: [MIA] });

beforeEach(() => {
  // Sunday 2026-11-22, 12:00 in Berlin; only `Date` is faked so TanStack keeps running.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-11-22T12:00:00+01:00"));
  fake = createFakeFetch();
  fake.setReplies("/api/config", { status: 200, body: config });
});

afterEach(() => {
  clients.forEach((client) => {
    client.clear();
  });
  clients = [];
  applyLocale("en");
  vi.useRealTimers();
});

describe("DayView", () => {
  it("shows the loading skeleton until the config is there", () => {
    fake.setReplies("/api/config", "hang");
    renderDay();
    expect(screen.getByRole("status")).toHaveTextContent(en.day.loading);
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    // No agenda request with a guessed zone while the config is missing.
    expect(fake.count("/api/agenda")).toBe(0);
  });

  it("renders header, bands, all-day row and meals; highlights the current band", async () => {
    fake.setReplies("/api/agenda", {
      status: 200,
      body: agendaFixture({
        events: [
          eventFixture({
            id: "trip",
            title: "School trip",
            allDay: true,
            start: "2026-11-22",
            end: "2026-11-23",
          }),
          eventFixture({
            id: "swim",
            title: "Swimming",
            start: "2026-11-22T09:00:00+01:00",
            end: "2026-11-22T10:00:00+01:00",
            childIds: ["mia"],
          }),
          eventFixture({
            id: "piano",
            title: "Piano",
            start: "2026-11-22T11:30:00+01:00",
            end: "2026-11-22T12:30:00+01:00",
          }),
          eventFixture({
            id: "bath",
            title: "Bath time",
            start: "2026-11-22T18:00:00+01:00",
            end: "2026-11-22T18:30:00+01:00",
          }),
        ],
        meals: [
          mealFixture({ id: "m2", slot: "dinner", title: "Soup" }),
          mealFixture({ id: "m1", slot: "lunch", title: "Pasta" }),
        ],
      }),
    });
    renderDay();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Sunday" }),
    ).toBeInTheDocument();
    expect(screen.getByText("November 22, 2026")).toBeInTheDocument();

    const bands = screen.getAllByTestId("day-band");
    expect(bands.map((b) => b.dataset["band"])).toEqual([
      "morning",
      "midday",
      "evening",
    ]);
    expect(bands.map((b) => b.dataset["status"])).toEqual([
      "past",
      "current",
      "upcoming",
    ]);
    expect(bands[1]).toHaveAttribute("aria-current", "time");
    expect(within(bands[0] as HTMLElement).getByText("Swimming")).toBeVisible();
    expect(
      within(bands[0] as HTMLElement).getByRole("article", {
        name: "Swimming",
      }),
    ).toHaveAttribute("data-status", "past");
    expect(
      within(bands[1] as HTMLElement).getByRole("article", { name: "Piano" }),
    ).toHaveAttribute("data-status", "current");
    expect(
      within(bands[2] as HTMLElement).getByText("Bath time"),
    ).toBeVisible();

    // The all-day event is outside the bands and shows no clock time.
    const trip = screen.getByRole("article", { name: "School trip" });
    expect(trip).toHaveAttribute("data-all-day", "true");
    expect(trip).toHaveTextContent(en.event.allDay);
    expect(bands.some((b) => b.contains(trip))).toBe(false);

    const meals = screen.getByRole("region", { name: en.day.meals });
    expect(
      within(meals)
        .getAllByRole("article")
        .map((m) => m.dataset["slot"]),
    ).toEqual(["lunch", "dinner"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the empty-day state without events and meals", async () => {
    fake.setReplies("/api/agenda", {
      status: 200,
      body: agendaFixture({ events: [], meals: [] }),
    });
    renderDay();
    expect(
      await screen.findByRole("heading", { name: en.day.empty.title }),
    ).toBeVisible();
    expect(screen.queryByTestId("day-band")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sunday",
    );
  });

  it("keeps the bands when only meals exist", async () => {
    fake.setReplies("/api/agenda", {
      status: 200,
      body: agendaFixture({ events: [], meals: [mealFixture()] }),
    });
    renderDay();
    expect(await screen.findAllByTestId("day-band")).toHaveLength(3);
    expect(screen.queryByTestId("day-empty")).not.toBeInTheDocument();
  });

  it("follows the config locale and zone", async () => {
    fake.setReplies("/api/config", {
      status: 200,
      body: configFixture({ locale: "de" }),
    });
    fake.setReplies("/api/agenda", {
      status: 200,
      body: agendaFixture({ events: [], meals: [] }),
    });
    renderDay();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sonntag" }),
    ).toBeInTheDocument();
    expect(screen.getByText("22. November 2026")).toBeInTheDocument();
    expect(screen.getByText(de.day.empty.title)).toBeVisible();
  });

  it("explains an expired access link, calm for children", async () => {
    fake.setReplies("/api/config", { status: 401, body: {} });
    renderDay();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-error", "unauthorized");
    expect(alert).toHaveTextContent(en.day.error.title);
    expect(alert).toHaveTextContent(en.status.unauthorized);
  });

  it("shows the error state when the agenda fails and nothing is cached", async () => {
    fake.setReplies("/api/agenda", {
      status: 502,
      body: { error: "upstream" },
    });
    renderDay();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-error", "failed");
    expect(alert).toHaveTextContent(en.status.error);
    expect(screen.queryByTestId("day-band")).not.toBeInTheDocument();
  });

  it("keeps showing the board for worker-stale data", async () => {
    fake.setReplies("/api/agenda", {
      status: 200,
      body: agendaFixture({ stale: true }),
    });
    renderDay();
    await waitFor(() => {
      expect(screen.getAllByTestId("day-band")).toHaveLength(3);
    });
    // Stale data is shown; the banner is debounced (see DiscreetStatusBanner.test).
    expect(screen.queryByTestId("day-empty")).not.toBeInTheDocument();
  });
});
