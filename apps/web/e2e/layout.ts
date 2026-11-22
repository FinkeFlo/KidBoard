import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { agenda, type MockEvent } from "./mockApi";

/** A busy board: 6 events on each of the next 7 days, 4 meals a day. */
export const BUSY: MockEvent[] = Array.from({ length: 7 }, (_, day) => [
  { title: `Swimming ${String(day)}`, icon: "🏊", time: "07:30", day },
  { title: `Dentist ${String(day)}`, icon: "🦷", time: "08:30", day },
  { title: `Music ${String(day)}`, icon: "🎻", time: "11:30", day },
  { title: `Football ${String(day)}`, icon: "⚽", time: "15:00", day },
  { title: `Bath ${String(day)}`, icon: "🛁", time: "18:00", day },
  { title: `Trip ${String(day)}`, icon: "🦁", time: null, day },
]).flat();
export const MEALS = Array.from({ length: 7 }, (_, day) => [
  { slot: "breakfast", title: "Oatmeal with berries", icon: "🥣", day },
  { slot: "lunch", title: "Spaghetti with tomato sauce", icon: "🍝", day },
  { slot: "dinner", title: "Vegetable soup and bread", icon: "🍲", day },
  { slot: "unspecified", title: "Apple slices", icon: "🍎", day },
]).flat();

export function withCountdown(day: number, extra: MockEvent[] = []): unknown {
  return agenda(
    [
      ...BUSY,
      {
        title: "Christmas party",
        icon: "🎄",
        time: null,
        day,
        countdown: true,
      },
      ...extra,
    ],
    MEALS,
  );
}

/** Nothing scrolls, is clipped or leaves the viewport; the countdown stays in the header. */
export async function expectNoOverflow(page: Page): Promise<void> {
  const report = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const root = document.documentElement;
    const problems: string[] = [];
    const inside = (rect: DOMRect, box: DOMRect): boolean =>
      rect.left >= box.left - 0.5 &&
      rect.top >= box.top - 0.5 &&
      rect.right <= box.right + 0.5 &&
      rect.bottom <= box.bottom + 0.5;
    const screen = new DOMRect(0, 0, viewport.width, viewport.height);
    for (const el of document.querySelectorAll<HTMLElement>(
      "main, header, [data-testid=countdown], [data-testid=day-band], [data-testid=week-day], article",
    )) {
      const name = `${el.tagName}[${el.dataset["testid"] ?? ""}] ${el.textContent.slice(0, 24)}`;
      if (el.scrollHeight > el.clientHeight + 1) problems.push(`${name} h`);
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${name} w`);
      if (!inside(el.getBoundingClientRect(), screen)) {
        problems.push(`${name} off-screen`);
      }
    }
    // Every part of the countdown lies inside it, and it lies inside the header.
    const countdown = document.querySelector("[data-testid=countdown]");
    const header = document.querySelector("header");
    if (countdown !== null && header !== null) {
      const box = countdown.getBoundingClientRect();
      if (!inside(box, header.getBoundingClientRect())) {
        problems.push("countdown outside header");
      }
      for (const part of countdown.querySelectorAll("span")) {
        if (!inside(part.getBoundingClientRect(), box)) {
          problems.push(`countdown part ${part.textContent}`);
        }
      }
    }
    // Every list item lies inside its column / band.
    for (const column of document.querySelectorAll(
      "[data-testid=week-day], [data-testid=day-band]",
    )) {
      const box = column.getBoundingClientRect();
      for (const item of column.querySelectorAll("li")) {
        if (!inside(item.getBoundingClientRect(), box)) {
          problems.push(`escaping ${item.textContent.slice(0, 24)}`);
        }
      }
    }
    return {
      docScroll: [root.scrollWidth, root.scrollHeight],
      viewport: [viewport.width, viewport.height],
      problems,
    };
  });
  expect(report.docScroll[0]).toBeLessThanOrEqual(report.viewport[0] ?? 0);
  expect(report.docScroll[1]).toBeLessThanOrEqual(report.viewport[1] ?? 0);
  expect(report.problems).toEqual([]);
}

/** Moon symbols drawn in the countdown. */
export async function moons(page: Page): Promise<number> {
  return page
    .getByTestId("countdown")
    .locator(".font-emoji")
    .filter({ hasText: /^🌙$/u })
    .count();
}
