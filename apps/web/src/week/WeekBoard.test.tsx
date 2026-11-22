import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BEN,
  eventFixture,
  mealFixture,
  MIA,
} from "../components/fixtures.test-utils";
import type { FormatContext } from "../i18n/format";
import { buildWeekModel } from "./buildWeekModel";
import { WeekBoard, type WeekCountdown } from "./WeekBoard";

const format: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };
const CONFIG = {
  timeZone: "Europe/Berlin",
  bands: { morningStart: "06:00", middayStart: "11:00", eveningStart: "17:00" },
} as const;

/** Makes every column list report `heightRem` (at a 16px root) through a stubbed observer. */
function stubListHeight(heightRem: number): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(
        private readonly callback: (
          entries: { contentRect: { height: number } }[],
        ) => void,
      ) {}
      observe(): void {
        this.callback([{ contentRect: { height: heightRem * 16 } }]);
      }
      disconnect(): void {}
    },
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWeek(
  events = [] as ReturnType<typeof eventFixture>[],
  meals = [] as ReturnType<typeof mealFixture>[],
  countdown?: WeekCountdown,
): HTMLElement[] {
  const days = buildWeekModel(
    { events, meals },
    CONFIG,
    "2026-11-22",
    Date.parse("2026-11-22T12:00:00+01:00"),
  );
  render(
    <WeekBoard
      days={days}
      childList={[MIA, BEN]}
      format={format}
      countdown={countdown}
    />,
  );
  return screen.getAllByTestId("day-column");
}

const tilesOf = (column: HTMLElement): HTMLElement[] =>
  within(column).queryAllByTestId("event-tile");
const namesOf = (column: HTMLElement): (string | null)[] =>
  tilesOf(column).map((tile) => tile.getAttribute("aria-label"));

const hourly = (
  day: string,
  count: number,
): ReturnType<typeof eventFixture>[] =>
  Array.from({ length: count }, (_, i) =>
    eventFixture({
      id: `e${String(i)}`,
      title: `Event ${String(i)}`,
      start: `${day}T${String(7 + i).padStart(2, "0")}:00:00+01:00`,
      end: `${day}T${String(8 + i).padStart(2, "0")}:00:00+01:00`,
    }),
  );

describe("WeekBoard", () => {
  it("renders seven columns with weekday names, today first and marked", () => {
    const columns = renderWeek();
    expect(columns).toHaveLength(7);
    expect(
      columns.map((c) => within(c).getByRole("heading").textContent),
    ).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    expect(columns[0]).toHaveAttribute("aria-current", "date");
    expect(columns[1]).not.toHaveAttribute("aria-current");
    expect(columns.map((c) => c.dataset["weekend"])).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
      "false",
      "true",
    ]);
  });

  it("keeps weekend columns visually distinct through the weekend surface token", () => {
    const columns = renderWeek();
    expect(columns[0]?.className).toContain("bg-surface-weekend");
    expect(columns[6]?.className).toContain("bg-surface-weekend");
    expect(columns[1]?.className).not.toContain("bg-surface-weekend");
    expect(columns[1]?.className).toContain("bg-surface-sunken");
    expect(columns[0]?.className).toContain("ring-today-ring");
    expect(columns[1]?.className).not.toContain("ring-today-ring");
  });

  it("shows events as week tiles in the overview's tile language, in time order", () => {
    const monday = renderWeek(
      hourly("2026-11-23", 3).map((event, i) => ({
        ...event,
        childIds: i === 0 ? ["mia"] : i === 1 ? ["mia", "ben"] : [],
      })),
    )[1] as HTMLElement;
    const tiles = tilesOf(monday);
    expect(tiles).toHaveLength(3);
    expect(namesOf(monday)).toEqual([
      "Event 0, 7:00 AM, For Mia",
      "Event 1, 8:00 AM, For Mia and Ben",
      "Event 2, 9:00 AM, For everyone",
    ]);
    expect(tiles.map((tile) => tile.dataset["tint"])).toEqual([
      "single",
      "split",
      "none",
    ]);
    expect(tiles[0]).toHaveAttribute("data-size", "week");
    // Child badges (decorative) and the time-of-day symbol: morning, then evening.
    const wrapper = (tile: HTMLElement | undefined): HTMLElement =>
      tile?.parentElement as HTMLElement;
    expect(within(wrapper(tiles[0])).getByText("🦊")).toBeInTheDocument();
    expect(within(tiles[0] as HTMLElement).getByText("🌅")).toBeInTheDocument();
    expect(within(wrapper(tiles[1])).getByText("🐻")).toBeInTheDocument();
    // The title is picture-first: only in the accessible name.
    expect(within(monday).queryByText("Event 0")).toBeNull();
  });

  it("uses the dusk symbol for evening events, never the moon (rule 1)", () => {
    const columns = renderWeek([
      eventFixture({
        title: "Bath",
        start: "2026-11-23T18:00:00+01:00",
        end: "2026-11-23T18:30:00+01:00",
      }),
    ]);
    const monday = columns[1] as HTMLElement;
    expect(within(monday).getByText("🌆")).toBeInTheDocument();
    expect(within(monday).queryByText("🌙")).toBeNull();
  });

  it("gives an all-day event its own all-day symbol instead of a time of day", () => {
    const columns = renderWeek([
      eventFixture({
        title: "Trip",
        allDay: true,
        start: "2026-11-23",
        end: "2026-11-24",
      }),
    ]);
    const [tile] = tilesOf(columns[1] as HTMLElement);
    expect(tile).toHaveAttribute("data-all-day", "true");
    expect(
      within(tile as HTMLElement).getByTestId("all-day-icon"),
    ).toBeTruthy();
    expect(
      within(tile as HTMLElement).getByText("All day"),
    ).toBeInTheDocument();
    expect(within(tile as HTMLElement).queryByText("🌞")).toBeNull();
  });

  it("shows no +N while every tile fits, however many events (not a fixed count)", () => {
    stubListHeight(40);
    const monday = renderWeek(hourly("2026-11-23", 5))[1] as HTMLElement;
    expect(tilesOf(monday)).toHaveLength(5);
    expect(within(monday).queryByTestId("column-more")).toBeNull();
  });

  it("sums up what does not fit as +N with a screen reader text naming the titles", () => {
    // Dense tiles: three plus the +N row (3 * 4.5 + 3 * 0.5 + 2.25 = 17.25 rem).
    stubListHeight(17.5);
    const monday = renderWeek(hourly("2026-11-23", 6))[1] as HTMLElement;
    expect(tilesOf(monday)).toHaveLength(3);
    expect(monday).toHaveAttribute("data-size", "week-dense");
    const more = within(monday).getByTestId("column-more");
    expect(more).toHaveAttribute("data-count", "3");
    expect(within(more).getByText("+3")).toHaveAttribute("aria-hidden", "true");
    expect(
      within(more).getByText("3 more: Event 3, Event 4, and Event 5"),
    ).toHaveClass("sr-only");
    // shown + hidden === all events.
    expect(tilesOf(monday).length + Number(more.dataset["count"])).toBe(6);
  });

  it("lets already finished events of today yield first: they are the ones summed up", () => {
    stubListHeight(17.5);
    // Now is 12:00: Events 0..4 (07:00..11:00) are over, 12:00 is current, 13:00+ upcoming.
    const events = hourly("2026-11-22", 9);
    const today = renderWeek(events)[0] as HTMLElement;
    const statuses = tilesOf(today).map((tile) => tile.dataset["status"]);
    // Three tiles: all upcoming/current ones win the slots over the finished ones.
    expect(statuses).toHaveLength(3);
    expect(statuses).not.toContain("past");
    const more = within(today).getByTestId("column-more");
    expect(more.textContent).toContain("6 more");
    expect(within(more).getByText(/Event 0/)).toBeInTheDocument();
  });

  it("lets finished events recede through tokens, not opacity", () => {
    const today = renderWeek([
      eventFixture({
        id: "over",
        title: "Over",
        start: "2026-11-22T08:00:00+01:00",
        end: "2026-11-22T09:00:00+01:00",
      }),
    ])[0] as HTMLElement;
    const [tile] = tilesOf(today);
    expect(tile).toHaveAttribute("data-status", "past");
    expect(tile?.className).toContain("bg-surface-sunken");
    expect(tile?.className).toContain("text-text-muted");
    expect(tile?.className).not.toMatch(/opacity/);
    expect(tile?.getAttribute("aria-label")).toContain("over");
  });

  it("shows a moon in every header before the countdown day and none from it on", () => {
    const columns = renderWeek(
      [
        eventFixture({
          title: "Party",
          childIds: ["mia"],
          start: "2026-11-26T15:00:00+01:00",
          end: "2026-11-26T16:00:00+01:00",
          countdown: true,
        }),
      ],
      [],
      {
        date: "2026-11-26",
        events: [
          eventFixture({
            title: "Party",
            childIds: ["mia"],
            countdown: true,
          }),
        ],
      },
    );
    expect(
      columns.map((c) => within(c).queryAllByTestId("column-moon").length),
    ).toEqual([1, 1, 1, 1, 0, 0, 0]);
    // The moon is decorative: the countdown pill carries the spoken count.
    const moon = within(columns[0] as HTMLElement).getByText("🌙");
    expect(moon).toHaveAttribute("aria-hidden", "true");
  });

  it("puts no moons in the headers without a countdown", () => {
    renderWeek([eventFixture()]);
    expect(screen.queryAllByTestId("column-moon")).toHaveLength(0);
  });

  it("puts a moon on every day up to a far target and on none of today when it is today", () => {
    const far = renderWeek([], [], {
      date: "2026-12-20",
      events: [eventFixture()],
    });
    expect(
      far.map((c) => within(c).queryAllByTestId("column-moon").length),
    ).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(far.every((c) => c.dataset["countdownDay"] === "false")).toBe(true);
  });

  it("shows the countdown day in the child's tint and edge", () => {
    const columns = renderWeek([], [], {
      date: "2026-11-26",
      events: [eventFixture({ childIds: ["mia"], countdown: true })],
    });
    const target = columns[4] as HTMLElement;
    expect(target).toHaveAttribute("data-countdown-day", "true");
    expect(target.style.getPropertyValue("--child-color")).toBe(
      "var(--color-child-1)",
    );
    expect(target.className).toContain("inset-ring-(color:--child-color)");
    expect(target.className).not.toContain("bg-surface");
    // Other days keep their plain surface and no edge.
    expect(columns[3]?.style.getPropertyValue("--child-color")).toBe("");
    expect(columns[3]?.className).toContain("bg-surface-sunken");
  });

  it("keeps the plain surface on a countdown day without a child", () => {
    const columns = renderWeek([], [], {
      date: "2026-11-26",
      events: [eventFixture({ countdown: true })],
    });
    expect(columns[4]).toHaveAttribute("data-countdown-day", "true");
    expect(columns[4]?.className).toContain("bg-surface-sunken");
    expect(columns[4]?.className).not.toContain("inset-ring");
  });

  it("shows meals as a three-row list in slot order, with an empty place for a missing one", () => {
    const columns = renderWeek(
      [],
      [
        mealFixture({ id: "d", slot: "dinner", title: "Soup", icon: "🍲" }),
        mealFixture({ id: "b", slot: "breakfast", title: "Oats", icon: "🥣" }),
      ],
    );
    const meals = within(columns[0] as HTMLElement).getByRole("list", {
      name: "Meals",
    });
    const rows = within(meals).getAllByRole("listitem", { hidden: true });
    expect(rows.map((row) => row.dataset["slot"])).toEqual([
      "breakfast",
      "lunch",
      "dinner",
    ]);
    // Lunch is missing: its place stays, empty and hidden from assistive tech.
    expect(rows[1]).toHaveAttribute("aria-hidden", "true");
    expect(rows[1]).not.toHaveTextContent("🍝");
    expect(
      within(meals).getByRole("img", { name: "Breakfast: Oats" }),
    ).toHaveTextContent("🥣");
    expect(
      within(meals).getByRole("img", { name: "Dinner: Soup" }),
    ).toBeVisible();
    // Time-of-day symbols lead the rows; dinner uses the dusk, not the moon.
    expect(within(rows[2] as HTMLElement).getByText("🌆")).toBeInTheDocument();
    expect(within(meals).queryByText("🌙")).toBeNull();
    // No row for unspecified meals when there are none; other days have no meal list.
    expect(rows.some((row) => row.dataset["slot"] === "unspecified")).toBe(
      false,
    );
    expect(
      within(columns[1] as HTMLElement).queryByRole("list", { name: "Meals" }),
    ).toBeNull();
  });

  it("gives meals without a slot a row of their own below the three", () => {
    const columns = renderWeek(
      [],
      [
        mealFixture({
          id: "u",
          slot: "unspecified",
          title: "Apple",
          icon: "🍎",
        }),
        mealFixture({ id: "l1", slot: "lunch", title: "Pasta", icon: "🍝" }),
        mealFixture({ id: "l2", slot: "lunch", title: "Salad", icon: "🥗" }),
      ],
    );
    const meals = within(columns[0] as HTMLElement).getByRole("list", {
      name: "Meals",
    });
    const rows = within(meals).getAllByRole("listitem", { hidden: true });
    expect(rows.map((row) => row.dataset["slot"])).toEqual([
      "breakfast",
      "lunch",
      "dinner",
      "unspecified",
    ]);
    // Two lunches sit side by side in the lunch row.
    expect(within(rows[1] as HTMLElement).getAllByRole("img")).toHaveLength(2);
    expect(
      within(rows[3] as HTMLElement).getByRole("img", { name: "Meal: Apple" }),
    ).toBeVisible();
  });

  it("renders calendar titles as text, never as markup", () => {
    const columns = renderWeek([
      eventFixture({
        title: "<img src=x onerror=alert(1)>",
        start: "2026-11-22T14:00:00+01:00",
      }),
    ]);
    const [tile] = tilesOf(columns[0] as HTMLElement);
    expect(tile?.getAttribute("aria-label")).toContain(
      "<img src=x onerror=alert(1)>",
    );
    expect(document.querySelector("img")).toBeNull();
  });

  it("skips unknown child ids and counts three or more children as +N on the badge", () => {
    const columns = renderWeek([
      eventFixture({
        title: "Music",
        childIds: ["ben", "ghost", "mia"],
        start: "2026-11-22T14:00:00+01:00",
        end: "2026-11-22T15:00:00+01:00",
      }),
    ]);
    const [tile] = tilesOf(columns[0] as HTMLElement);
    expect(tile).toHaveAttribute("data-tint", "split");
    expect(tile?.getAttribute("aria-label")).toContain("For Ben and Mia");
  });
});
