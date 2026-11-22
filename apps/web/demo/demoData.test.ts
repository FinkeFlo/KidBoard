import { AgendaResponseSchema, AppConfigSchema } from "@kidboard/shared";
import { describe, expect, it } from "vitest";

import {
  DEMO_COUNTDOWN_DAYS,
  DEMO_TIME_ZONE,
  demoAgenda,
  demoConfig,
  isoInZone,
} from "./demoData.ts";

const TODAY = "2026-11-22";
const NOW = "2026-11-22T12:00:00+01:00";

describe("demo data", () => {
  it("is a valid config with Mia and Ben and no secrets", () => {
    const config = demoConfig();
    expect(AppConfigSchema.safeParse(config).success).toBe(true);
    expect(config.children.map((child) => child.avatar)).toEqual(["🦊", "🐻"]);
    expect(JSON.stringify(config)).not.toMatch(/https?:|CAL_|key|token/i);
  });

  it("is a valid agenda covering 31 days from today", () => {
    const agenda = demoAgenda(TODAY, NOW);
    expect(AgendaResponseSchema.safeParse(agenda).success).toBe(true);
    expect(agenda.range).toEqual({ from: TODAY, to: "2026-12-23" });
    const days = new Set(agenda.meals.map((meal) => meal.date));
    expect(days.size).toBe(31);
    // Only configured children are referenced.
    const known = new Set(demoConfig().children.map((child) => child.id));
    for (const event of agenda.events) {
      for (const id of event.childIds) expect(known.has(id)).toBe(true);
    }
    expect(new Set(agenda.events.map((event) => event.id)).size).toBe(
      agenda.events.length,
    );
  });

  it("moves with today: the same pattern starts on any given day", () => {
    const first = demoAgenda("2026-11-22", NOW);
    const later = demoAgenda("2027-03-01", "2027-03-01T12:00:00+01:00");
    const titles = (a: typeof first, date: string): string[] =>
      a.events
        .filter((e) => (e.allDay ? e.start : e.start.slice(0, 10)) === date)
        .map((e) => e.title);
    expect(titles(first, "2026-11-22")).toEqual(titles(later, "2027-03-01"));
    expect(later.range.from).toBe("2027-03-01");
  });

  it("has exactly one countdown event, `countdownDays` nights ahead", () => {
    const agenda = demoAgenda(TODAY, NOW);
    const countdowns = agenda.events.filter((event) => event.countdown);
    expect(countdowns).toHaveLength(1);
    expect(countdowns[0]?.start.slice(0, 10)).toBe("2026-11-28");
    expect(DEMO_COUNTDOWN_DAYS).toBe(6);
    const today = demoAgenda(TODAY, NOW, { countdownDays: 0 });
    expect(
      today.events.find((event) => event.countdown)?.start.slice(0, 10),
    ).toBe(TODAY);
  });

  it("has events in the morning, midday and evening of today, plus an all-day event", () => {
    const todays = demoAgenda(TODAY, NOW).events.filter(
      (event) =>
        (event.allDay ? event.start : event.start.slice(0, 10)) === TODAY,
    );
    const hours = todays
      .filter((event) => !event.allDay)
      .map((event) => Number(event.start.slice(11, 13)));
    expect(hours.some((hour) => hour < 11)).toBe(true);
    expect(hours.some((hour) => hour >= 11 && hour < 17)).toBe(true);
    expect(hours.some((hour) => hour >= 17)).toBe(true);
    expect(todays.some((event) => event.allDay)).toBe(true);
  });
});

describe("isoInZone", () => {
  it("uses the zone's offset on that day, across DST changes", () => {
    expect(isoInZone("2026-01-15", "08:30", DEMO_TIME_ZONE)).toBe(
      "2026-01-15T08:30:00+01:00",
    );
    expect(isoInZone("2026-07-15", "08:30", DEMO_TIME_ZONE)).toBe(
      "2026-07-15T08:30:00+02:00",
    );
    // Day of the spring-forward change (2026-03-29): 01:30 is CET, 09:00 is CEST.
    expect(isoInZone("2026-03-29", "01:30", DEMO_TIME_ZONE)).toBe(
      "2026-03-29T01:30:00+01:00",
    );
    expect(isoInZone("2026-03-29", "09:00", DEMO_TIME_ZONE)).toBe(
      "2026-03-29T09:00:00+02:00",
    );
    expect(isoInZone("2026-07-15", "08:30", "America/New_York")).toBe(
      "2026-07-15T08:30:00-04:00",
    );
    expect(isoInZone("2026-07-15", "08:30", "Asia/Kolkata")).toBe(
      "2026-07-15T08:30:00+05:30",
    );
  });
});
