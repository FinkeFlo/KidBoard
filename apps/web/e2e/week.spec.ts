import { expect, test } from "@playwright/test";

import { columnAccount, expectNoOverflow } from "./layout";
import { agenda, config, mockBoard, type MockEvent } from "./mockApi";

const SHOT_DIR = process.env["E2E_SCREENSHOT_DIR"];

/** A busy week: 6 events on every day (one countdown), 4 meals on every day. */
const EVENTS: MockEvent[] = Array.from({ length: 7 }, (_, day) => [
  { title: `Swimming ${String(day)}`, icon: "🏊", time: "07:30", day },
  { title: `Dentist ${String(day)}`, icon: "🦷", time: "08:30", day },
  { title: `Music ${String(day)}`, icon: "🎻", time: "10:00", day },
  { title: `Football ${String(day)}`, icon: "⚽", time: "15:00", day },
  { title: `Bath ${String(day)}`, icon: "🛁", time: "18:00", day },
  { title: `Trip ${String(day)}`, icon: "🦁", time: null, day },
]).flat();
EVENTS.push({
  title: "Birthday party",
  icon: "🎂",
  time: "16:00",
  day: 3,
  childIds: ["mia"],
  countdown: true,
});
const MEALS = Array.from({ length: 7 }, (_, day) => [
  { slot: "breakfast", title: "Oatmeal with berries", icon: "🥣", day },
  { slot: "lunch", title: "Spaghetti with tomato sauce", icon: "🍝", day },
  { slot: "dinner", title: "Vegetable soup and bread", icon: "🍲", day },
  { slot: "unspecified", title: "Apple slices", icon: "🍎", day },
]).flat();

test.describe("week view", () => {
  test("toggles to a seven-day week without scrolling or overflow and back", async ({
    page,
  }, testInfo) => {
    await mockBoard(page, { agenda: agenda(EVENTS, MEALS) });
    await page.goto("/");

    const toWeek = page.getByRole("button", { name: "Week" });
    const toDay = page.getByRole("button", { name: "Today" });
    await expect(toDay).toHaveAttribute("aria-pressed", "true");
    // Picture plus a short word, big: at least 64 x 64 px (CSS px).
    for (const button of [toWeek, toDay]) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(64);
      expect(box?.height).toBeGreaterThanOrEqual(64);
    }
    await expect(toWeek.getByTestId("week-bars")).toBeVisible();
    await expect(toWeek).toHaveText("Week");
    await expect(toDay).toHaveText("☀️Today");

    await toWeek.click();
    await expect(toWeek).toHaveAttribute("aria-pressed", "true");
    const columns = page.getByTestId("day-column");
    await expect(columns).toHaveCount(7);
    // Today first (Sunday 22nd); weekdays follow; Sun and Sat are weekend columns.
    await expect(columns.first().getByRole("heading")).toHaveText("Sunday");
    await expect(columns.last().getByRole("heading")).toHaveText("Saturday");
    await expect(columns.first()).toHaveAttribute("aria-current", "date");
    await expect(
      columns.evaluateAll((all) =>
        all.map((column) => column.getAttribute("data-weekend")),
      ),
    ).resolves.toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
      "false",
      "true",
    ]);
    const surfaces = await columns.evaluateAll((all) =>
      all.map((column) => getComputedStyle(column).backgroundColor),
    );
    expect(surfaces[0]).toBe(surfaces[6]);
    expect(surfaces[1]).not.toBe(surfaces[0]);
    // Weekdays share one surface, except the countdown day (Wednesday), which wears the
    // child's tint.
    expect(
      new Set([...surfaces.slice(1, 3), ...surfaces.slice(4, 6)]).size,
    ).toBe(1);
    expect(surfaces[3]).not.toBe(surfaces[1]);

    // Tiles in the overview's language; "+N" only for what does not fit (space, not a
    // fixed count), and nothing is lost: shown + summed up === events of the day.
    const wednesday = columns.nth(3);
    const account = await columnAccount(wednesday);
    expect(account.shown.length).toBeGreaterThanOrEqual(3);
    expect(account.shown.length + account.hidden).toBe(7);
    expect(account.hidden).toBeGreaterThan(0);
    expect(account.hiddenText).toContain(`${String(account.hidden)} more`);
    // The countdown event wins a slot despite being late in the day (T-24 ranking).
    expect(
      account.shown.some((name) => name.startsWith("Birthday party")),
    ).toBe(true);
    // The countdown day is shown in the child's tint and edge (Mia is child-1, #c2410c).
    await expect(wednesday).toHaveAttribute("data-countdown-day", "true");
    expect(
      await wednesday.evaluate((el) => getComputedStyle(el).boxShadow),
    ).toContain("rgb(194, 65, 12)");
    // One moon per night still to sleep: in each header before the target day.
    await expect(
      columns.evaluateAll((all) =>
        all.map(
          (column) =>
            column.querySelectorAll("[data-testid=column-moon]").length,
        ),
      ),
    ).resolves.toEqual([1, 1, 1, 0, 0, 0, 0]);
    // Meals: breakfast, lunch, dinner rows plus the unspecified one.
    const meals = wednesday.getByTestId("meal-rows");
    await expect(meals.getByRole("img")).toHaveCount(4);
    await expect(
      meals.getByRole("img", { name: "Lunch: Spaghetti with tomato sauce" }),
    ).toBeVisible();
    await expectNoOverflow(page);

    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/week-${testInfo.project.name}.png`,
      });
    }

    await toDay.click();
    await expect(
      page.locator('[data-testid=day-column][data-today="true"]'),
    ).toHaveCount(1);
    // Back on the four-day overview.
    await expect(page.getByTestId("day-column")).toHaveCount(4);
    await expect(page.getByTestId("week-board")).toHaveCount(0);
  });

  for (const locale of ["en", "de"] as const) {
    test(`weekday headers stay on one line (${locale})`, async ({ page }) => {
      await mockBoard(page, {
        config: {
          locale,
          timeZone: "Europe/Berlin",
          calendars: [{ id: "family", kind: "events" }],
        },
        agenda: agenda(EVENTS, MEALS),
      });
      await page.goto("/");
      await page
        .getByRole("button", {
          name: locale === "en" ? "Week" : "Woche",
        })
        .click();
      await expect(page.getByTestId("day-column")).toHaveCount(7);
      const wrapped = await page.evaluate(() =>
        [...document.querySelectorAll("[data-testid=day-column] h2")]
          .filter((h) => {
            const size = parseFloat(getComputedStyle(h).fontSize);
            return (
              h.getBoundingClientRect().height > size * 1.6 ||
              h.scrollWidth > h.clientWidth
            );
          })
          .map((h) => h.textContent),
      );
      expect(wrapped).toEqual([]);
    });
  }

  test("shows an empty week without errors", async ({ page }) => {
    await mockBoard(page, {
      agenda: agenda([{ title: "Swimming", icon: "🏊", time: "10:00" }], []),
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Week" }).click();
    await expect(page.getByTestId("day-column")).toHaveCount(7);
    await expect(
      page
        .getByTestId("day-column")
        .first()
        .getByRole("article", { name: /^Swimming, 10:00 AM/ }),
    ).toBeVisible();
    await expectNoOverflow(page);
  });

  test("tinted tiles with child badges; finished events of today give way first", async ({
    page,
  }) => {
    await mockBoard(page, {
      config: config(),
      agenda: agenda(
        [
          // Now is 12:00 Berlin: the first two are over, so they must not take the slots.
          { title: "Swimming", icon: "🏊", time: "07:30", childIds: ["mia"] },
          { title: "Dentist", icon: "🦷", time: "08:30", childIds: ["ben"] },
          { title: "Lunch", icon: "🍝", time: "12:30" },
          { title: "Football", icon: "⚽", time: "15:00", childIds: ["ben"] },
          {
            title: "Music",
            icon: "🎻",
            time: "16:00",
            childIds: ["mia", "ben"],
          },
          { title: "Bath", icon: "🛁", time: "18:00" },
          { title: "Story", icon: "📖", time: "19:00" },
          { title: "Sleep song", icon: "🎶", time: "19:30" },
          // Tomorrow the same early events are not over.
          { title: "Swimming", icon: "🏊", time: "07:30", day: 1 },
        ],
        [],
      ),
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Week" }).click();
    const columns = page.getByTestId("day-column");
    const today = columns.first();
    const account = await columnAccount(today);
    // 8 events in a column that cannot show them all: shown + summed up === 8.
    expect(account.hidden).toBeGreaterThan(0);
    expect(account.shown.length + account.hidden).toBe(8);
    // The finished events are summed up before any upcoming one.
    const statuses = await today
      .getByTestId("event-tile")
      .evaluateAll((all) =>
        all.map((tile) => tile.getAttribute("data-status")),
      );
    expect(statuses).not.toContain("past");
    expect(account.hiddenText).toContain("Swimming");
    expect(account.hiddenText).toContain("Dentist");

    // Child cue: tint kind, badges (avatar emoji) and the name for assistive tech.
    const tiles = today.getByTestId("event-tile");
    const lunch = tiles.filter({ hasText: "12:30" });
    await expect(lunch).toHaveAttribute("data-tint", "none");
    const football = today.getByRole("article", { name: /^Football/ });
    await expect(football).toHaveAttribute("data-tint", "single");
    await expect(football).toHaveAccessibleName("Football, 3:00 PM, For Ben");
    const music = today.getByRole("article", { name: /^Music/ });
    await expect(music).toHaveAttribute("data-tint", "split");
    const badges = music.locator("xpath=..").getByTestId("child-badges");
    await expect(badges).toContainText("🦊");
    await expect(badges).toContainText("🐻");
    // The single child's edge is drawn in the child's colour (Ben is child-2, #0072b2).
    expect(
      await football.evaluate((el) => getComputedStyle(el).boxShadow),
    ).toContain("rgb(0, 114, 178)");
    // Time-of-day symbols on the tiles; the evening is a dusk skyline, never a moon.
    await expect(football).toContainText("🌞");
    expect(await today.getByText("🌙").count()).toBe(0);

    // Tomorrow nothing is over: the early event keeps its place.
    await expect(
      columns.nth(1).getByRole("article", { name: /^Swimming, 7:30 AM/ }),
    ).toBeVisible();
    await expectNoOverflow(page);
  });
});
