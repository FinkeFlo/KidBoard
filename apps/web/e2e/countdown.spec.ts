import { expect, type Page, test } from "@playwright/test";

import { agenda, mockBoard, type MockEvent } from "./mockApi";

const SHOT_DIR = process.env["E2E_SCREENSHOT_DIR"];

/** A busy board: 6 events on each of the next 7 days, 4 meals a day. */
const BUSY: MockEvent[] = Array.from({ length: 7 }, (_, day) => [
  { title: `Swimming ${String(day)}`, icon: "🏊", time: "07:30", day },
  { title: `Dentist ${String(day)}`, icon: "🦷", time: "08:30", day },
  { title: `Music ${String(day)}`, icon: "🎻", time: "11:30", day },
  { title: `Football ${String(day)}`, icon: "⚽", time: "15:00", day },
  { title: `Bath ${String(day)}`, icon: "🛁", time: "18:00", day },
  { title: `Trip ${String(day)}`, icon: "🦁", time: null, day },
]).flat();
const MEALS = Array.from({ length: 7 }, (_, day) => [
  { slot: "breakfast", title: "Oatmeal with berries", icon: "🥣", day },
  { slot: "lunch", title: "Spaghetti with tomato sauce", icon: "🍝", day },
  { slot: "dinner", title: "Vegetable soup and bread", icon: "🍲", day },
  { slot: "unspecified", title: "Apple slices", icon: "🍎", day },
]).flat();

function withCountdown(day: number, extra: MockEvent[] = []): unknown {
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
async function expectNoOverflow(page: Page): Promise<void> {
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
async function moons(page: Page): Promise<number> {
  return page
    .getByTestId("countdown")
    .locator(".font-emoji")
    .filter({ hasText: /^🌙$/u })
    .count();
}

test.describe("countdown", () => {
  test("30 nights: compact on the day view, full on the week view, no overflow", async ({
    page,
  }, testInfo) => {
    await mockBoard(page, { agenda: withCountdown(30) });
    await page.goto("/");

    const countdown = page.getByRole("region", { name: "How many sleeps?" });
    await expect(countdown).toHaveAttribute("data-variant", "compact");
    await expect(countdown).toHaveAttribute("data-nights", "30");
    await expect(countdown).toContainText(
      "30 more sleeps until Christmas party",
    );
    await expect(page.getByTestId("countdown-grouped")).toHaveText("🌙×30");
    await expect(page.getByTestId("day-band")).toHaveCount(3);
    await expectNoOverflow(page);
    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/countdown-day-30-${testInfo.project.name}.png`,
      });
    }

    await page.getByRole("button", { name: "Week view" }).click();
    await expect(page.getByTestId("week-day")).toHaveCount(7);
    await expect(countdown).toHaveAttribute("data-variant", "full");
    await expect(countdown).toContainText(
      "30 more sleeps until Christmas party",
    );
    await expectNoOverflow(page);
    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/countdown-week-30-${testInfo.project.name}.png`,
      });
    }
  });

  test("14 nights: every night a moon, in both views, also with the offline banner", async ({
    page,
    context,
  }, testInfo) => {
    await mockBoard(page, {
      agenda: withCountdown(14, [
        // Same day, several countdowns: one shared countdown, up to 3 icons.
        { title: "Gift", icon: "🎁", time: "10:00", day: 14, countdown: true },
        { title: "Cake", icon: "🎂", time: "15:00", day: 14, countdown: true },
        { title: "Fun", icon: "🎉", time: "16:00", day: 14, countdown: true },
      ]),
    });
    await page.goto("/");
    const countdown = page.getByRole("region", { name: "How many sleeps?" });
    await expect(countdown).toContainText(
      "14 more sleeps until Christmas party, Gift, Cake, and Fun",
    );
    expect(await moons(page)).toBe(14);
    await expectNoOverflow(page);

    await page.getByRole("button", { name: "Week view" }).click();
    await expect(countdown).toHaveAttribute("data-variant", "full");
    expect(await moons(page)).toBe(14);
    await expectNoOverflow(page);
    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/countdown-week-14-${testInfo.project.name}.png`,
      });
    }

    await context.setOffline(true);
    await expect(page.getByRole("status")).toContainText("No internet");
    await expectNoOverflow(page);
    await page.getByRole("button", { name: "Day view" }).click();
    await expect(countdown).toHaveAttribute("data-variant", "compact");
    await expectNoOverflow(page);
    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/countdown-day-14-offline-${testInfo.project.name}.png`,
      });
    }
  });

  test("today: the today state in both views", async ({ page }) => {
    await mockBoard(page, { agenda: withCountdown(0) });
    await page.goto("/");
    const countdown = page.getByRole("region", { name: "How many sleeps?" });
    await expect(countdown).toHaveAttribute("data-nights", "0");
    await expect(countdown).toContainText("Today!");
    expect(await moons(page)).toBe(0);
    await expectNoOverflow(page);
    await page.getByRole("button", { name: "Week view" }).click();
    await expect(countdown).toHaveAttribute("data-variant", "full");
    await expect(countdown).toContainText("Today is the day: Christmas party!");
    await expectNoOverflow(page);
  });

  test("German labels with plural rules", async ({ page }) => {
    await mockBoard(page, {
      config: {
        locale: "de",
        timeZone: "Europe/Berlin",
        calendars: [{ id: "family", kind: "events" }],
      },
      agenda: withCountdown(1),
    });
    await page.goto("/");
    const countdown = page.getByRole("region", {
      name: "Wie oft noch schlafen?",
    });
    await expect(countdown).toContainText(
      "Noch einmal schlafen bis Christmas party",
    );
    expect(await moons(page)).toBe(1);
    await expectNoOverflow(page);
  });
});
