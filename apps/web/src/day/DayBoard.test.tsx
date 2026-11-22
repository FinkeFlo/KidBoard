import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BEN, eventFixture, MIA } from "../components/fixtures.test-utils";
import type { FormatContext } from "../i18n/format";
import { buildDayModel } from "./buildDayModel";
import { DayBoard } from "./DayBoard";

const format: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };
const CONFIG = {
  timeZone: "Europe/Berlin",
  bands: { morningStart: "06:00", middayStart: "11:00", eveningStart: "17:00" },
} as const;

describe("DayBoard band symbols", () => {
  it("gives every band its own symbol and never reuses 🌙 (sleeps) or ☀️ (view toggle)", () => {
    const at = (id: string, hour: number): ReturnType<typeof eventFixture> =>
      eventFixture({
        id,
        start: `2026-11-22T${String(hour).padStart(2, "0")}:00:00+01:00`,
        end: `2026-11-22T${String(hour + 1).padStart(2, "0")}:00:00+01:00`,
      });
    const model = buildDayModel(
      { events: [at("m", 8), at("d", 12), at("e", 18)], meals: [] },
      CONFIG,
      "2026-11-22",
      Date.parse("2026-11-22T12:00:00+01:00"),
    );
    render(<DayBoard model={model} childList={[MIA, BEN]} format={format} />);
    const symbols = screen.getAllByTestId("day-band").map((band) => {
      const heading = within(band).getByRole("heading");
      return heading.querySelector(".font-emoji")?.textContent;
    });
    expect(symbols).toHaveLength(3);
    expect(new Set(symbols).size).toBe(3);
    for (const symbol of symbols) {
      expect(symbol).not.toBe("🌙");
      expect(symbol).not.toBe("☀️");
    }
  });
});
