import { onlineManager, type QueryClient } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import { STALE_BANNER_DELAY_MS } from "../day/DiscreetStatusBanner";
import { applyLocale } from "../i18n";
import de from "../i18n/locales/de.json";
import en from "../i18n/locales/en.json";
import { Board } from "./Board";

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
      <Board />
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
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe("Board", () => {
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

  it("explains offline without any saved plan (no 'last known plan' claim)", async () => {
    onlineManager.setOnline(false);
    renderDay();
    const status = (await screen.findByText(en.day.error.offline)).closest(
      "[data-error]",
    );
    expect(status).toHaveAttribute("data-error", "offline");
    expect(status).toHaveTextContent(en.day.error.title);
    expect(status).toHaveTextContent(en.day.error.offline);
    expect(status).not.toHaveTextContent(en.status.offline);
    expect(screen.queryByTestId("day-band")).not.toBeInTheDocument();
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

  it("shows the stale banner once stale data has persisted for the delay", async () => {
    // Timers must be faked before render so the debounce timer is the fake one.
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(Date.parse("2026-11-22T12:00:00+01:00"));
    fake.setReplies("/api/agenda", {
      status: 200,
      body: agendaFixture({ stale: true }),
    });
    renderDay();
    // `vi.waitFor` advances the fake timers while polling (the fetch resolves via I/O).
    await vi.waitFor(() => {
      expect(screen.getAllByTestId("day-band")).toHaveLength(3);
    });
    expect(screen.queryByText(en.status.stale)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALE_BANNER_DELAY_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent(en.status.stale);
  });

  describe("day / week toggle", () => {
    const agenda = (): void => {
      fake.setReplies("/api/agenda", {
        status: 200,
        body: agendaFixture({
          events: [
            eventFixture({ id: "today", title: "Swimming" }),
            eventFixture({
              id: "tue",
              title: "Dentist",
              icon: "🦷",
              start: "2026-11-24T09:00:00+01:00",
              end: "2026-11-24T10:00:00+01:00",
            }),
          ],
          meals: [
            mealFixture({ id: "tue-m", date: "2026-11-24", title: "Soup" }),
          ],
        }),
      });
    };

    it("starts on the day view and switches to the week with the shared header", async () => {
      agenda();
      renderDay();
      expect(await screen.findAllByTestId("day-band")).toHaveLength(3);
      expect(screen.queryByTestId("week-board")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: en.board.week }));
      expect(screen.getByTestId("week-board")).toBeInTheDocument();
      expect(screen.queryByTestId("day-band")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("week-day")).toHaveLength(7);
      // Header (date and legend) and toggle stay.
      expect(
        screen.getByRole("heading", { level: 1, name: "Sunday" }),
      ).toBeInTheDocument();
      expect(screen.getByText("November 22, 2026")).toBeInTheDocument();
      expect(screen.getByRole("list", { name: en.legend.label })).toBeVisible();
      expect(
        screen.getByRole("button", { name: en.board.week }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("img", { name: "Dentist" })).toBeInTheDocument();
      expect(screen.getByText("Lunch: Soup")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: en.board.day }));
      expect(screen.getAllByTestId("day-band")).toHaveLength(3);
    });

    it("returns to the day view after autoReturnSeconds of inactivity, not before", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(Date.parse("2026-11-22T12:00:00+01:00"));
      fake.setReplies("/api/config", {
        status: 200,
        body: configFixture({ children: [MIA], autoReturnSeconds: 30 }),
      });
      agenda();
      renderDay();
      await vi.waitFor(() => {
        expect(screen.getAllByTestId("day-band")).toHaveLength(3);
      });
      fireEvent.click(screen.getByRole("button", { name: en.board.week }));
      expect(screen.getByTestId("week-board")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(29_000);
      });
      // Touch resets the countdown.
      fireEvent.pointerDown(screen.getByTestId("week-board"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(29_000);
      });
      expect(screen.getByTestId("week-board")).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(screen.queryByTestId("week-board")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("day-band")).toHaveLength(3);
    });
  });

  describe("countdown (T-19)", () => {
    it("requests 31 days and shows the countdown compact on the day view, full on the week view", async () => {
      fake.setReplies("/api/agenda", {
        status: 200,
        body: agendaFixture({
          range: { from: "2026-11-22", to: "2026-12-23" },
          events: [
            // Beyond the week, 26 nights ahead (not in any week column).
            eventFixture({
              id: "xmas",
              title: "Christmas",
              icon: "🎄",
              allDay: true,
              start: "2026-12-18",
              end: "2026-12-19",
              countdown: true,
            }),
            // Under way since yesterday: not awaited any more.
            eventFixture({
              id: "holiday",
              title: "Holiday",
              icon: "🏖️",
              allDay: true,
              start: "2026-11-21",
              end: "2026-11-25",
              countdown: true,
            }),
          ],
        }),
      });
      renderDay();
      const compact = await screen.findByRole("region", {
        name: en.countdown.label,
      });
      expect(fake.calls.map((c) => c.url)).toContain(
        "/api/agenda?from=2026-11-22&days=31",
      );
      expect(compact).toHaveAttribute("data-variant", "compact");
      expect(compact).toHaveAttribute("data-nights", "26");
      expect(compact).toHaveTextContent("26 more sleeps until Christmas");
      expect(
        within(compact).getByTestId("countdown-grouped"),
      ).toHaveTextContent("×26");
      // The countdown lives in the header, next to the date.
      expect(compact.closest("header")).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: en.board.week }));
      const full = screen.getByRole("region", { name: en.countdown.label });
      expect(full).toHaveAttribute("data-variant", "full");
      expect(full).toHaveTextContent("26 more sleeps until Christmas");
    });

    it("shows no countdown without an upcoming countdown event", async () => {
      fake.setReplies("/api/agenda", {
        status: 200,
        body: agendaFixture({
          events: [eventFixture({ id: "swim", title: "Swimming" })],
        }),
      });
      renderDay();
      expect(await screen.findAllByTestId("day-band")).toHaveLength(3);
      expect(
        screen.queryByRole("region", { name: en.countdown.label }),
      ).not.toBeInTheDocument();
    });
  });
});
