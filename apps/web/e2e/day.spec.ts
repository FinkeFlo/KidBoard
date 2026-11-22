import { expect, type Page, test } from "@playwright/test";

import { agenda, fixClock, mockBoard, type MockEvent } from "./mockApi";

/** 8 timed events (3 morning, 3 midday, 2 evening) plus an all-day one, and 3 meals. */
const EVENTS: MockEvent[] = [
  { title: "School trip to the zoo", icon: "🦁", time: null },
  { title: "Swimming", icon: "🏊", time: "07:30", childIds: ["mia"] },
  {
    title: "Dentist with a very long appointment title",
    icon: "🦷",
    time: "08:30",
  },
  { title: "Music class", icon: "🎻", time: "10:00", childIds: ["ben", "mia"] },
  { title: "Lunch with Grandma", icon: "👵", time: "11:30" },
  { title: "Football", icon: "⚽", time: "12:00", childIds: ["ben"] },
  { title: "Playground", icon: "🛝", time: "15:00" },
  { title: "Bath time", icon: "🛁", time: "18:00" },
  { title: "Story time", icon: "📖", time: "19:00" },
];
const MEALS = [
  { slot: "breakfast", title: "Oatmeal with berries", icon: "🥣" },
  { slot: "lunch", title: "Spaghetti with tomato sauce", icon: "🍝" },
  { slot: "dinner", title: "Vegetable soup and bread", icon: "🍲" },
];

const SHOT_DIR = process.env["E2E_SCREENSHOT_DIR"];

async function expectNoOverflow(page: Page): Promise<void> {
  const report = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const root = document.documentElement;
    const clipped: string[] = [];
    const outside: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      "main, [data-testid=day-band], article",
    )) {
      // 1px tolerance for sub-pixel rounding.
      if (el.scrollHeight > el.clientHeight + 1) {
        clipped.push(`${el.tagName} ${el.textContent.slice(0, 30)} h`);
      }
      if (el.scrollWidth > el.clientWidth + 1) {
        clipped.push(`${el.tagName} ${el.textContent.slice(0, 30)} w`);
      }
      const rect = el.getBoundingClientRect();
      if (
        rect.left < -0.5 ||
        rect.top < -0.5 ||
        rect.right > viewport.width + 0.5 ||
        rect.bottom > viewport.height + 0.5
      ) {
        outside.push(el.textContent.slice(0, 30));
      }
    }
    // Every event tile lies inside its band column.
    const escaping: string[] = [];
    for (const band of document.querySelectorAll("[data-testid=day-band]")) {
      const box = band.getBoundingClientRect();
      for (const tile of band.querySelectorAll("article")) {
        const rect = tile.getBoundingClientRect();
        if (rect.bottom > box.bottom + 0.5 || rect.right > box.right + 0.5) {
          escaping.push(tile.textContent.slice(0, 30));
        }
      }
    }
    return {
      docScroll: [root.scrollWidth, root.scrollHeight],
      viewport: [viewport.width, viewport.height],
      clipped,
      outside,
      escaping,
    };
  });
  expect(report.docScroll[0]).toBeLessThanOrEqual(report.viewport[0] ?? 0);
  expect(report.docScroll[1]).toBeLessThanOrEqual(report.viewport[1] ?? 0);
  expect(report.clipped).toEqual([]);
  expect(report.outside).toEqual([]);
  expect(report.escaping).toEqual([]);
}

test.describe("day view", () => {
  test("shows 8 events, an all-day event and 3 meals without scrolling or overflow", async ({
    page,
  }, testInfo) => {
    await mockBoard(page, { agenda: agenda(EVENTS, MEALS) });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Sunday" }),
    ).toBeVisible();
    await expect(page.getByText("November 22, 2026")).toBeVisible();
    await expect(page.getByTestId("day-band")).toHaveCount(3);
    // Clock fixed at 12:00: morning is past, midday current, evening upcoming.
    await expect(
      page
        .locator("[data-testid=day-band]")
        .evaluateAll((bands) =>
          bands.map((band) => band.getAttribute("data-status")),
        ),
    ).resolves.toEqual(["past", "current", "upcoming"]);
    // Every event and meal is visible (no scrolling needed, none clipped away).
    for (const event of EVENTS) {
      await expect(
        page.getByRole("article", { name: event.title }),
      ).toBeVisible();
    }
    for (const meal of MEALS) {
      await expect(
        page.getByRole("article", { name: meal.title }),
      ).toBeInViewport({ ratio: 1 });
    }
    // Times are shown in the config zone (Berlin), not the device zone.
    await expect(page.getByRole("article", { name: "Swimming" })).toContainText(
      "7:30 AM",
    );
    await expect(page.getByRole("article", { name: "Football" })).toContainText(
      "12:00 PM",
    );
    await expect(
      page.getByRole("article", { name: "School trip to the zoo" }),
    ).toContainText("All day");
    await expectNoOverflow(page);

    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/day-${testInfo.project.name}.png`,
      });
    }
  });

  test("keeps all events of one crowded band on screen", async ({ page }) => {
    const crowded: MockEvent[] = Array.from({ length: 8 }, (_, i) => ({
      title: `Activity number ${String(i + 1)}`,
      icon: "🎨",
      time: `${String(6 + (i % 5)).padStart(2, "0")}:00`,
    }));
    await mockBoard(page, { agenda: agenda(crowded, MEALS) });
    await page.goto("/");
    await expect(page.getByTestId("day-band").first()).toBeVisible();
    await expect(page.getByRole("article", { name: /Activity/ })).toHaveCount(
      8,
    );
    await expectNoOverflow(page);
  });

  test("shows the discreet offline banner with the last data", async ({
    page,
    context,
  }) => {
    await mockBoard(page, { agenda: agenda(EVENTS, MEALS) });
    await page.goto("/");
    await expect(page.getByRole("article", { name: "Swimming" })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole("status")).toContainText("No internet");
    await expect(page.getByRole("article", { name: "Swimming" })).toBeVisible();
    await expectNoOverflow(page);
  });

  test("shows a calm, parent-readable state for an expired access link", async ({
    page,
  }) => {
    await fixClock(page);
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 401, json: { error: "unauthorized" } }),
    );
    await page.goto("/");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("The plan isn't here right now");
    await expect(alert).toContainText("?key=");
    await expectNoOverflow(page);
  });

  test("shows the loading skeleton while the config is pending", async ({
    page,
  }) => {
    await page.route("**/api/**", () => new Promise(() => undefined));
    await page.goto("/");
    await expect(page.getByRole("status")).toHaveText("Loading the plan");
    await expectNoOverflow(page);
  });

  test("each symbol has one meaning: no 🌙 or ☀️ in a band heading, 🌙 only counts sleeps", async ({
    page,
  }) => {
    await mockBoard(page, {
      agenda: agenda(
        [
          ...EVENTS,
          {
            title: "Party",
            icon: "🎂",
            time: "16:00",
            day: 3,
            countdown: true,
          },
        ],
        MEALS,
      ),
    });
    await page.goto("/");
    await expect(page.getByTestId("day-band")).toHaveCount(3);
    const bandSymbols = await page
      .getByTestId("day-band")
      .evaluateAll((bands) =>
        bands.map(
          (band) => band.querySelector("h2 .font-emoji")?.textContent ?? "",
        ),
      );
    expect(new Set(bandSymbols).size).toBe(3);
    expect(bandSymbols).not.toContain("🌙");
    expect(bandSymbols).not.toContain("☀️");
    // The only moons on the board are the countdown's three sleeps.
    const moonsOnBoard = await page.evaluate(
      () =>
        [...document.querySelectorAll(".font-emoji")].filter(
          (el) => el.textContent === "🌙",
        ).length,
    );
    expect(moonsOnBoard).toBe(3);
    // And the day toggle's ☀️ is not repeated in the bands.
    await expect(page.getByRole("button", { name: "Day view" })).toHaveText(
      "☀️",
    );
  });
});
