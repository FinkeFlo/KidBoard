import type { Page } from "@playwright/test";

/*
 * Synthetic API for the E2E specs. The clock is fixed to Sunday 2026-11-22 12:00 in
 * Berlin (CET), so "today" and the current band (midday) are deterministic.
 */

export const NOW = "2026-11-22T12:00:00+01:00";

export interface MockChild {
  id: string;
  name: string;
  color: string;
  avatar: string;
}

export const CHILDREN: MockChild[] = [
  { id: "mia", name: "Mia", color: "child-1", avatar: "🦊" },
  { id: "ben", name: "Ben", color: "child-2", avatar: "🐻" },
];

export function config(overrides: Record<string, unknown> = {}): unknown {
  return {
    locale: "auto",
    timeZone: "Europe/Berlin",
    children: CHILDREN,
    calendars: [{ id: "family", kind: "events" }],
    bands: {
      morningStart: "06:00",
      middayStart: "11:00",
      eveningStart: "17:00",
    },
    nightMode: { enabled: true, start: "19:30", end: "06:30" },
    countdown: { emojis: ["🎂"] },
    refreshMinutes: 60,
    autoReturnSeconds: 120,
    ...overrides,
  };
}

export interface MockEvent {
  title: string;
  icon: string;
  /** `HH:mm` on today, or `null` for an all-day event. */
  time: string | null;
  childIds?: string[];
  /** Days after today (default 0). */
  day?: number;
  countdown?: boolean;
}

/** `2026-11-22` plus `offset` calendar days (pure calendar math). */
export function dateOf(offset: number): string {
  return new Date(Date.UTC(2026, 10, 22 + offset)).toISOString().slice(0, 10);
}

export function agenda(
  events: MockEvent[],
  meals: { slot: string; title: string; icon: string; day?: number }[],
): unknown {
  return {
    generatedAt: NOW,
    timeZone: "Europe/Berlin",
    range: { from: "2026-11-22", to: "2026-11-30" },
    stale: false,
    sources: [{ id: "family", status: "ok", fetchedAt: NOW }],
    events: events.map((event, index) => {
      const base = {
        id: `e${String(index)}`,
        sourceId: "family",
        title: event.title,
        icon: event.icon,
        iconIsFallback: false,
        childIds: event.childIds ?? [],
        countdown: event.countdown ?? false,
      };
      const day = dateOf(event.day ?? 0);
      if (event.time === null) {
        return {
          ...base,
          allDay: true,
          start: day,
          end: dateOf((event.day ?? 0) + 1),
        };
      }
      // One hour long, on today.
      const [hour = "0", minute = "00"] = event.time.split(":");
      const endHour = String(Math.min(Number(hour) + 1, 23)).padStart(2, "0");
      return {
        ...base,
        allDay: false,
        start: `${day}T${event.time}:00+01:00`,
        end: `${day}T${endHour}:${minute}:00+01:00`,
      };
    }),
    meals: meals.map((meal, index) => ({
      id: `m${String(index)}`,
      sourceId: "meals",
      date: dateOf(meal.day ?? 0),
      slot: meal.slot,
      title: meal.title,
      icon: meal.icon,
      iconIsFallback: false,
    })),
  };
}

/**
 * Offsets "now" so that it reads {@link NOW} when the page loads (the clock keeps
 * ticking). Done with a `Proxy` around the real `Date` so that `Date.prototype` stays
 * the same object: `@date-fns/tz` copies the prototype's methods at load time, and a
 * `Date` subclass (or Playwright's `page.clock` wrapper) hides them, which makes
 * `TZDate#getHours()` read the device zone.
 */
export async function fixClock(page: Page): Promise<void> {
  await page.addInitScript((fixedMs: number) => {
    const RealDate = Date;
    const offset = fixedMs - RealDate.now();
    const now = (): number => RealDate.now() + offset;
    window.Date = new Proxy(RealDate, {
      construct(target, args: unknown[], newTarget): object {
        return Reflect.construct(
          target,
          args.length === 0 ? [now()] : args,
          newTarget,
        ) as object;
      },
      get(target, property, receiver): unknown {
        return property === "now"
          ? now
          : Reflect.get(target, property, receiver);
      },
    });
  }, Date.parse(NOW));
}

/** Fixes the clock and answers `/api/config` and `/api/agenda`. */
export async function mockBoard(
  page: Page,
  options: {
    config?: unknown;
    agenda?: unknown;
    agendaStatus?: number;
  } = {},
): Promise<void> {
  await fixClock(page);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") {
      return route.fulfill({ json: options.config ?? config() });
    }
    if (path === "/api/agenda") {
      return route.fulfill({
        status: options.agendaStatus ?? 200,
        json: options.agenda ?? agenda([], []),
      });
    }
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
}
