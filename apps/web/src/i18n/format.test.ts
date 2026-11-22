import { describe, expect, it } from "vitest";

import {
  type FormatContext,
  formatDayMonth,
  formatLongDate,
  formatTime,
  formatWeekday,
} from "./format";

const berlinDe: FormatContext = { locale: "de", timeZone: "Europe/Berlin" };
const berlinEn: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };

describe("date/time formatting", () => {
  it("formats in the active locale", () => {
    const instant = "2025-03-02T12:00:00Z"; // a Sunday
    expect(formatWeekday(instant, berlinDe)).toBe("Sonntag");
    expect(formatWeekday(instant, berlinEn)).toBe("Sunday");
    expect(formatDayMonth(instant, berlinDe)).toBe("2. März");
    expect(formatDayMonth(instant, berlinEn)).toBe("March 2");
    expect(formatLongDate(instant, berlinEn)).toBe("March 2, 2025");
    expect(formatLongDate(instant, berlinDe)).toBe("2. März 2025");
  });

  it("uses 24 h for de and 12 h for en", () => {
    const instant = "2025-03-02T13:30:00Z"; // 14:30 in Berlin
    expect(formatTime(instant, berlinDe)).toBe("14:30");
    expect(formatTime(instant, berlinEn)).toBe("2:30 PM");
  });

  it("uses the configured zone, not the device zone", () => {
    const instant = "2025-06-15T22:30:00Z";
    expect(
      formatTime(instant, { locale: "de", timeZone: "Europe/Berlin" }),
    ).toBe("00:30");
    expect(
      formatWeekday(instant, { locale: "de", timeZone: "Europe/Berlin" }),
    ).toBe("Montag");
    expect(
      formatTime(instant, { locale: "de", timeZone: "America/New_York" }),
    ).toBe("18:30");
    expect(
      formatWeekday(instant, { locale: "de", timeZone: "America/New_York" }),
    ).toBe("Sonntag");
  });

  it("handles the spring-forward night (Berlin, 2025-03-30)", () => {
    // 01:30 CET (UTC+1) then 03:30 CEST (UTC+2): 02:xx does not exist.
    expect(formatTime("2025-03-30T00:30:00Z", berlinDe)).toBe("01:30");
    expect(formatTime("2025-03-30T01:30:00Z", berlinDe)).toBe("03:30");
    expect(formatDayMonth("2025-03-30T01:30:00Z", berlinDe)).toBe("30. März");
  });

  it("handles the fall-back night (Berlin, 2025-10-26)", () => {
    // 02:30 occurs twice: CEST (UTC+2) and CET (UTC+1).
    expect(formatTime("2025-10-26T00:30:00Z", berlinDe)).toBe("02:30");
    expect(formatTime("2025-10-26T01:30:00Z", berlinDe)).toBe("02:30");
    expect(formatTime("2025-10-26T02:30:00Z", berlinDe)).toBe("03:30");
  });

  it("assigns instants just around local midnight to the right day", () => {
    // 2025-03-29T22:59Z = 23:59 CET, 23:00Z = 00:00 CET on the 30th.
    expect(formatDayMonth("2025-03-29T22:59:00Z", berlinDe)).toBe("29. März");
    expect(formatDayMonth("2025-03-29T23:00:00Z", berlinDe)).toBe("30. März");
  });
});
