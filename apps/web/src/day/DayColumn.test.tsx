import type { CalendarEvent, Meal } from "@kidboard/shared";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TILE_HEIGHT_REM } from "../components/EventTile";
import {
  BEN,
  eventFixture,
  mealFixture,
  MIA,
} from "../components/fixtures.test-utils";
import type { FormatContext } from "../i18n/format";
import en from "../i18n/locales/en.json";
import type { DayModelConfig } from "./buildDayModel";
import { buildOverviewModel, type OverviewDay } from "./buildOverviewModel";
import { DayColumn } from "./DayColumn";

const CONFIG: DayModelConfig = {
  timeZone: "Europe/Berlin",
  bands: { morningStart: "06:00", middayStart: "11:00", eveningStart: "17:00" },
};
const format: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };
const TODAY = "2026-11-22";
const NOW = Date.parse("2026-11-22T12:00:00+01:00");

/** `count` one-hour events from `firstHour` on, one per hour (half hours past 23). */
function hourly(
  count: number,
  firstHour: number,
  day = TODAY,
): CalendarEvent[] {
  return Array.from({ length: count }, (_, i) => {
    const minutes = firstHour * 60 + i * 50;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    const endMinutes = minutes + 30;
    const eh = String(Math.floor(endMinutes / 60)).padStart(2, "0");
    const em = String(endMinutes % 60).padStart(2, "0");
    return eventFixture({
      id: `e${String(i)}`,
      title: `Event ${String(i + 1)}`,
      icon: "🎨",
      start: `${day}T${hh}:${mm}:00+01:00`,
      end: `${day}T${eh}:${em}:00+01:00`,
    });
  });
}

function day(
  events: CalendarEvent[],
  meals: Meal[] = [],
  offset = 0,
): OverviewDay {
  const model = buildOverviewModel({ events, meals }, CONFIG, TODAY, NOW);
  const result = model.days[offset];
  if (result === undefined) throw new Error("no day");
  return result;
}

/** Makes the list report `heightRem` (at a 16px root) through a stubbed observer. */
/** Height of a dense tile in today's column (rem). */
const DENSE = TILE_HEIGHT_REM.dense;

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

function renderColumn(model: OverviewDay): HTMLElement {
  render(
    <DayColumn
      day={model}
      childList={[MIA, BEN]}
      format={format}
      nowTime="12:00 PM"
    />,
  );
  return screen.getByTestId("day-column");
}

const timedTiles = (column: HTMLElement): HTMLElement[] =>
  within(within(column).getByTestId("column-events")).queryAllByTestId(
    "event-tile",
  );

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DayColumn", () => {
  it("shows every event until the list is measured", () => {
    const column = renderColumn(day(hourly(9, 7)));
    expect(timedTiles(column)).toHaveLength(9);
    expect(column).toHaveAttribute("data-size", "dense");
  });

  it("today: heading, past events, the now line with its time, then the upcoming ones; the next one emphasised", () => {
    stubListHeight(40);
    const column = renderColumn(day(hourly(4, 9)));
    expect(column).toHaveAttribute("aria-current", "date");
    expect(
      within(column).getByRole("heading", { level: 2, name: en.day.today }),
    ).toBeVisible();
    expect(column).toHaveTextContent("Sunday, November 22");
    const tiles = timedTiles(column);
    // 9:00, 9:50, 10:40 and 11:30 (until 12:00) are over at 12:00.
    expect(tiles.map((tile) => tile.dataset["status"])).toEqual([
      "past",
      "past",
      "past",
      "past",
    ]);
    const line = within(column).getByRole("separator", {
      name: "now, 12:00 PM",
    });
    // All started: the line sits below the last tile.
    expect(
      line.compareDocumentPosition(tiles[3] as HTMLElement) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(line).not.toHaveAttribute("aria-live");
  });

  it("puts the now line above the first event when nothing has started; the first is next", () => {
    stubListHeight(40);
    const column = renderColumn(day(hourly(3, 14)));
    const tiles = timedTiles(column);
    const line = within(column).getByRole("separator");
    expect(
      line.compareDocumentPosition(tiles[0] as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(tiles.map((tile) => tile.dataset["next"])).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(column).toHaveAttribute("data-size", "large");
    expect(within(tiles[0] as HTMLElement).getByText("🎨")).toHaveClass(
      "text-[3.5rem]",
    );
  });

  it("keeps the current tile's ring next to the now line", () => {
    stubListHeight(40);
    const events = [
      eventFixture({
        id: "now",
        title: "Lunch",
        start: "2026-11-22T11:30:00+01:00",
        end: "2026-11-22T12:30:00+01:00",
      }),
      ...hourly(2, 15),
    ];
    const column = renderColumn(day(events));
    const current = within(column).getByRole("article", { name: /Lunch/ });
    expect(current).toHaveAttribute("data-status", "current");
    expect(current).toHaveClass("ring-4");
  });

  it("busy day: past events fold into a named 'vorbei' strip, the latest into a named +N; nothing is lost", () => {
    // 12 events from 6:00 every 50 min: 7 over, 1 current (11:50), 4 upcoming at 12:00.
    const events = hourly(12, 6);
    // Room for the strip, the now line and three dense tiles plus "+N".
    stubListHeight(2.25 + 1.5 + 3 * DENSE + 2.25 + 5 * 0.5);
    const column = renderColumn(day(events));
    const strip = within(column).getByRole("group", { name: /Already over/ });
    const folded = Number(strip.dataset["count"]);
    const more = within(column).getByTestId("column-more");
    const hidden = Number(more.dataset["count"]);
    const shown = timedTiles(column).length;
    expect(shown).toBe(3);
    expect(shown + folded + hidden).toBe(12);
    // The strip names every folded title, the "+N" every summed-up one.
    const foldedTitles = events.slice(0, folded).map((event) => event.title);
    expect(strip).toHaveAccessibleName(
      `Already over: ${new Intl.ListFormat("en", { type: "conjunction" }).format(foldedTitles)}`,
    );
    const later = events.slice(12 - hidden).map((event) => event.title);
    expect(within(more).getByText(/more later/)).toHaveClass("sr-only");
    expect(within(more).getByText(/more later/)).toHaveTextContent(
      `${String(hidden)} more later: ${new Intl.ListFormat("en", { type: "conjunction" }).format(later)}`,
    );
    expect(within(more).getByText(`+${String(hidden)}`)).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    // Folded icons recede (grey), no opacity.
    for (const icon of strip.querySelectorAll(".font-emoji")) {
      expect(icon).toHaveClass("grayscale");
      expect(icon.className).not.toMatch(/opacity/);
    }
  });

  it("counts strip icons beyond the drawn ones as +N with an sr-only label", () => {
    // 11 past events, 1 upcoming, little room: all past fold, only 8 get an icon.
    const events = hourly(12, 3);
    stubListHeight(2.25 + 1.5 + DENSE + 2 * 0.5);
    const column = renderColumn(day(events));
    const strip = within(column).getByTestId("past-strip");
    expect(strip.querySelectorAll(".font-emoji")).toHaveLength(8);
    const extra = Number(strip.dataset["count"]) - 8;
    expect(extra).toBeGreaterThan(0);
    expect(
      within(strip).getByText(`${String(extra)} more already over`),
    ).toHaveClass("sr-only");
  });

  it("other days: weekday heading, compact tiles, no now line", () => {
    stubListHeight(40);
    const column = renderColumn(day(hourly(2, 9, "2026-11-23"), [], 1));
    expect(
      within(column).getByRole("heading", { level: 2, name: "Monday" }),
    ).toBeVisible();
    expect(column).not.toHaveAttribute("aria-current");
    expect(within(column).queryByRole("separator")).toBeNull();
    expect(column).toHaveAttribute("data-size", "compact");
    expect(timedTiles(column).map((t) => t.dataset["status"])).toEqual([
      "upcoming",
      "upcoming",
    ]);
  });

  it("all-day events: a banner on top, two entries, the rest as a named +N", () => {
    const allDay = ["Trip", "Holiday", "Fair", "Market"].map((title, i) =>
      eventFixture({
        id: `a${String(i)}`,
        title,
        allDay: true,
        start: TODAY,
        end: "2026-11-23",
        childIds: i === 0 ? ["mia"] : [],
      }),
    );
    const column = renderColumn(day([...allDay, ...hourly(1, 15)]));
    const banner = within(column).getByTestId("all-day");
    expect(within(banner).getAllByRole("article")).toHaveLength(2);
    expect(
      within(banner).getByRole("article", { name: "Trip, All day, For Mia" }),
    ).toHaveAttribute("data-tint", "single");
    expect(within(banner).getAllByTestId("all-day-icon")).toHaveLength(3);
    const more = within(banner).getByTestId("all-day-more");
    expect(more).toHaveTextContent("+2");
    expect(
      within(more).getByText("2 more all day: Fair and Market"),
    ).toHaveClass("sr-only");
    // The banner comes before the timed events.
    expect(
      banner.compareDocumentPosition(
        within(column).getByTestId("column-events"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("an empty today shows the friendly note and keeps the meals", () => {
    const column = renderColumn(day([], [mealFixture()]));
    expect(within(column).getByTestId("day-empty")).toHaveTextContent(
      en.day.empty.title,
    );
    expect(
      within(column).getByRole("img", { name: "Lunch: Pasta" }),
    ).toBeInTheDocument();
    expect(within(column).queryByRole("separator")).toBeNull();
  });

  it("the empty-day illustration uses the children's tints, 🧸 and 🪁, decorative only", () => {
    const column = renderColumn(day([], [mealFixture()]));
    const empty = within(column).getByTestId("day-empty");
    expect(empty).toHaveTextContent(en.day.empty.hint);
    const art = within(empty).getByTestId("day-empty-art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(art).toHaveTextContent("🧸");
    expect(art).toHaveTextContent("🪁");
    const fills = [...art.querySelectorAll<HTMLElement>("span")].map(
      (span) => span.style.backgroundColor,
    );
    // Mia's token tint; Ben's custom colour is mixed into the surface (childTint).
    expect(fills[0]).toBe("var(--color-child-1-tint)");
    expect(fills[1]).toContain("color-mix");
  });

  it("other days without events show no empty illustration", () => {
    const column = renderColumn(day([], [], 1));
    expect(within(column).queryByTestId("day-empty")).toBeNull();
  });

  it("renders titles as text, never as markup", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const { container } = render(
      <DayColumn
        day={day([eventFixture({ title: evil })])}
        childList={[]}
        format={format}
        nowTime="12:00 PM"
      />,
    );
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
