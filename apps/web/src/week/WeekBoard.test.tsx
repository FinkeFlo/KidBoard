import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { eventFixture, mealFixture } from "../components/fixtures.test-utils";
import type { FormatContext } from "../i18n/format";
import { buildWeekModel } from "./buildWeekModel";
import { WeekBoard } from "./WeekBoard";

const format: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };
const CONFIG = {
  timeZone: "Europe/Berlin",
  bands: { morningStart: "06:00", middayStart: "11:00", eveningStart: "17:00" },
} as const;

function renderWeek(
  events = [] as ReturnType<typeof eventFixture>[],
  meals = [] as ReturnType<typeof mealFixture>[],
): HTMLElement[] {
  const days = buildWeekModel(
    { events, meals },
    CONFIG,
    "2026-11-22",
    Date.parse("2026-11-22T12:00:00+01:00"),
  );
  render(<WeekBoard days={days} format={format} />);
  return screen.getAllByTestId("week-day");
}

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
    // Weekend columns carry a different surface than weekdays.
    expect(columns[0]?.className).toContain("bg-band-morning");
    expect(columns[1]?.className).toContain("bg-surface-raised");
  });

  it("shows event icons labelled with the title and a +N for the rest", () => {
    const events = ["a", "b", "c", "d", "e"].map((id, i) =>
      eventFixture({
        id,
        title: `Event ${id}`,
        icon: ["🏊", "🎻", "⚽", "🛝", "🛁"][i] ?? "🎨",
        start: `2026-11-23T${String(8 + i).padStart(2, "0")}:00:00+01:00`,
        end: `2026-11-23T${String(9 + i).padStart(2, "0")}:00:00+01:00`,
      }),
    );
    const monday = renderWeek(events)[1] as HTMLElement;
    expect(within(monday).getAllByRole("img")).toHaveLength(3);
    expect(
      within(monday).getByRole("img", { name: "Event a" }),
    ).toHaveTextContent("🏊");
    expect(within(monday).queryByRole("img", { name: "Event d" })).toBeNull();
    expect(within(monday).getByText("+2")).toBeInTheDocument();
    expect(within(monday).getByText("2 more")).toHaveClass("sr-only");
  });

  it("shows compact meals in slot order with an accessible slot name", () => {
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
    const items = within(meals).getAllByRole("listitem");
    expect(items.map((i) => i.dataset["slot"])).toEqual([
      "breakfast",
      "dinner",
    ]);
    expect(within(meals).getByText("Breakfast: Oats")).toBeInTheDocument();
    // Other days have no meal list.
    expect(
      within(columns[1] as HTMLElement).queryByRole("list", { name: "Meals" }),
    ).toBeNull();
  });

  it("renders calendar titles as text, never as markup", () => {
    const columns = renderWeek([
      eventFixture({
        title: "<img src=x onerror=alert(1)>",
        start: "2026-11-22T14:00:00+01:00",
      }),
    ]);
    const icon = within(columns[0] as HTMLElement).getByRole("img");
    expect(icon).toHaveAttribute("aria-label", "<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
  });
});
