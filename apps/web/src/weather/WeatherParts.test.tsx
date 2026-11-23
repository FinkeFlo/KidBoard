import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { applyLocale } from "../i18n";
import type { FormatContext } from "../i18n/format";
import type { ClothingRowModel, DayWeather } from "./buildBoardWeather";
import { ClothingRow } from "./ClothingRow";
import { WeatherChip } from "./WeatherChip";

const format: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };
const formatDe: FormatContext = { locale: "de", timeZone: "Europe/Berlin" };

const TODAY: DayWeather = {
  date: "2026-11-22",
  icon: "☀️",
  kind: "clear",
  high: 12,
  current: 8,
};
const RAINY: DayWeather = {
  date: "2026-11-23",
  icon: "🌧️",
  kind: "rain",
  high: 9,
};

afterEach(() => {
  applyLocale("en");
});

describe("WeatherChip", () => {
  it("is one image named with kind, current temperature and high", () => {
    const { rerender } = render(<WeatherChip day={TODAY} size="today" />);
    const chip = screen.getByRole("img", {
      name: "Sunny, now 8 degrees, high 12 degrees",
    });
    // Shows the current temperature; the icon and number are decorative parts.
    expect(chip).toHaveTextContent("☀️8°");
    expect(within(chip).queryAllByRole("img")).toHaveLength(0);
    applyLocale("de");
    rerender(<WeatherChip day={TODAY} size="today" />);
    expect(
      screen.getByRole("img", { name: "Sonnig, jetzt 8 Grad, bis 12 Grad" }),
    ).toBeInTheDocument();
  });

  it("shows the high on other days, with singular and negative degrees", () => {
    const { rerender } = render(<WeatherChip day={RAINY} size="day" />);
    const chip = screen.getByRole("img", { name: "Rain, high 9 degrees" });
    expect(chip).toHaveTextContent("🌧️9°");
    rerender(
      <WeatherChip
        day={{ ...RAINY, kind: "snow", icon: "🌨️", high: 1 }}
        size="day"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Snow, high 1 degree" }),
    ).toHaveTextContent("1°");
    rerender(
      <WeatherChip
        day={{ ...RAINY, kind: "snow", icon: "🌨️", high: -3 }}
        size="day"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Snow, high -3 degrees" }),
    ).toHaveTextContent("-3°");
    applyLocale("de");
    rerender(<WeatherChip day={RAINY} size="day" />);
    expect(
      screen.getByRole("img", { name: "Regen, bis 9 Grad" }),
    ).toBeInTheDocument();
  });

  it("can be purely decorative", () => {
    render(<WeatherChip day={RAINY} size="week" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("weather-chip")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

const MORNING: ClothingRowModel = {
  when: "today",
  date: "2026-11-22",
  items: [
    { key: "jacket", emoji: "🧥" },
    { key: "scarf", emoji: "🧣" },
  ],
};
const EVENING: ClothingRowModel = {
  when: "tomorrow",
  date: "2026-11-23",
  items: [
    { key: "umbrella", emoji: "☔" },
    { key: "boots", emoji: "👢" },
    { key: "jacket", emoji: "🧥" },
  ],
};

describe("ClothingRow", () => {
  it("is a labelled list of today's clothes without a day cue", () => {
    const { rerender } = render(<ClothingRow row={MORNING} format={format} />);
    const list = screen.getByRole("list", {
      name: "Wear today: jacket and scarf",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["🧥", "🧣"]);
    expect(within(list).getByRole("img", { name: "scarf" })).toHaveTextContent(
      "🧣",
    );
    expect(screen.queryByTestId("clothing-arrow")).toBeNull();
    expect(screen.queryByTestId("clothing-day")).toBeNull();
    // Not a live region, nothing to press.
    expect(screen.getByTestId("clothing-row")).not.toHaveAttribute("aria-live");
    expect(screen.queryByRole("button")).toBeNull();
    applyLocale("de");
    rerender(<ClothingRow row={MORNING} format={formatDe} />);
    expect(
      screen.getByRole("list", { name: "Heute anziehen: Jacke und Schal" }),
    ).toBeInTheDocument();
  });

  it("in the evening is for tomorrow, with the arrow and tomorrow's short weekday", () => {
    const { rerender } = render(<ClothingRow row={EVENING} format={format} />);
    expect(
      screen.getByRole("list", {
        name: "Wear tomorrow: umbrella, boots, and jacket",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("clothing-arrow")).toBeInTheDocument();
    expect(screen.getByTestId("clothing-day")).toHaveTextContent("Mon");
    // The cue is decorative (the list's name says "tomorrow").
    expect(
      screen.getByTestId("clothing-day").closest("[aria-hidden=true]"),
    ).not.toBeNull();
    applyLocale("de");
    rerender(<ClothingRow row={EVENING} format={formatDe} />);
    expect(
      screen.getByRole("list", {
        name: "Morgen anziehen: Regenschirm, Stiefel und Jacke",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("clothing-day")).toHaveTextContent("Mo");
  });

  it("never uses the bag or the moon", () => {
    render(<ClothingRow row={EVENING} format={format} />);
    expect(screen.getByTestId("clothing-row").textContent).not.toMatch(
      /🎒|🌙/u,
    );
  });
});
