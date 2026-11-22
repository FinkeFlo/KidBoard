import { describe, expect, it } from "vitest";

import {
  AgendaResponseSchema,
  CalendarEventSchema,
  ChildSchema,
  MealSchema,
} from "./model";

const timedEvent = {
  id: "e1",
  sourceId: "kinder",
  title: "Kita",
  icon: "🏫",
  iconIsFallback: false,
  childIds: [],
  allDay: false,
  start: "2026-11-23T08:00:00+01:00",
  end: "2026-11-23T12:00:00+01:00",
  countdown: false,
};

describe("CalendarEventSchema", () => {
  it("accepts timed and all-day events", () => {
    expect(CalendarEventSchema.safeParse(timedEvent).success).toBe(true);
    expect(
      CalendarEventSchema.safeParse({
        ...timedEvent,
        allDay: true,
        start: "2026-11-23",
        end: "2026-11-24",
      }).success,
    ).toBe(true);
  });

  it("rejects start/end that do not match allDay", () => {
    const timedAsAllDay = CalendarEventSchema.safeParse({
      ...timedEvent,
      allDay: true,
    });
    expect(timedAsAllDay.success).toBe(false);
    const allDayAsTimed = CalendarEventSchema.safeParse({
      ...timedEvent,
      start: "2026-11-23",
      end: "2026-11-24",
    });
    expect(allDayAsTimed.success).toBe(false);
  });

  it("rejects timed values without offset or invalid dates", () => {
    expect(
      CalendarEventSchema.safeParse({
        ...timedEvent,
        start: "2026-11-23T08:00:00",
      }).success,
    ).toBe(false);
    expect(
      CalendarEventSchema.safeParse({
        ...timedEvent,
        allDay: true,
        start: "2026-02-30",
        end: "2026-03-01",
      }).success,
    ).toBe(false);
  });
});

describe("MealSchema / ChildSchema", () => {
  it("validates a meal", () => {
    const meal = {
      id: "m",
      sourceId: "essen",
      date: "2026-11-23",
      slot: "lunch",
      title: "Spaghetti",
      icon: "🍝",
      iconIsFallback: false,
    };
    expect(MealSchema.safeParse(meal).success).toBe(true);
    expect(MealSchema.safeParse({ ...meal, slot: "snack" }).success).toBe(
      false,
    );
    expect(MealSchema.safeParse({ ...meal, date: "23.11.2026" }).success).toBe(
      false,
    );
  });

  it("validates a child", () => {
    expect(
      ChildSchema.safeParse({
        id: "mia",
        name: "Mia",
        color: "#E4572E",
        avatar: "🦊",
      }).success,
    ).toBe(true);
  });
});

describe("AgendaResponseSchema", () => {
  it("validates a response", () => {
    const response = {
      generatedAt: "2026-11-22T10:00:00Z",
      timeZone: "Europe/Berlin",
      range: { from: "2026-11-22", to: "2026-11-29" },
      stale: false,
      sources: [
        { id: "kinder", status: "ok", fetchedAt: "2026-11-22T10:00:00Z" },
        { id: "essen", status: "error" },
      ],
      events: [timedEvent],
      meals: [],
    };
    expect(AgendaResponseSchema.safeParse(response).success).toBe(true);
    expect(
      AgendaResponseSchema.safeParse({
        ...response,
        sources: [{ id: "x", status: "weird" }],
      }).success,
    ).toBe(false);
  });
});
