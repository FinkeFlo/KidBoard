import { expect, type Page, test } from "@playwright/test";

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
  countdown: true,
});
const MEALS = Array.from({ length: 7 }, (_, day) => [
  { slot: "breakfast", title: "Oatmeal with berries", icon: "🥣", day },
  { slot: "lunch", title: "Spaghetti with tomato sauce", icon: "🍝", day },
  { slot: "dinner", title: "Vegetable soup and bread", icon: "🍲", day },
  { slot: "unspecified", title: "Apple slices", icon: "🍎", day },
]).flat();

async function expectNoOverflow(page: Page): Promise<void> {
  const report = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const root = document.documentElement;
    const clipped: string[] = [];
    const outside: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      "main, [data-testid=week-board], [data-testid=week-day], header",
    )) {
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
    // Everything inside a column lies inside that column.
    const escaping: string[] = [];
    for (const column of document.querySelectorAll("[data-testid=week-day]")) {
      const box = column.getBoundingClientRect();
      for (const child of column.querySelectorAll("li")) {
        const rect = child.getBoundingClientRect();
        if (
          rect.bottom > box.bottom + 0.5 ||
          rect.right > box.right + 0.5 ||
          rect.left < box.left - 0.5
        ) {
          escaping.push(child.textContent.slice(0, 30));
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

test.describe("week view", () => {
  test("toggles to a seven-day week without scrolling or overflow and back", async ({
    page,
  }, testInfo) => {
    await mockBoard(page, { agenda: agenda(EVENTS, MEALS) });
    await page.goto("/");

    const toWeek = page.getByRole("button", { name: "Week view" });
    const toDay = page.getByRole("button", { name: "Day view" });
    await expect(toDay).toHaveAttribute("aria-pressed", "true");
    // Pictorial and big: at least 64 x 64 px (CSS px), no visible words.
    for (const button of [toWeek, toDay]) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(64);
      expect(box?.height).toBeGreaterThanOrEqual(64);
    }
    await expect(toWeek).toHaveText("🗓️");
    await expect(toDay).toHaveText("☀️");

    await toWeek.click();
    await expect(toWeek).toHaveAttribute("aria-pressed", "true");
    const columns = page.getByTestId("week-day");
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
    expect(new Set(surfaces.slice(1, 6)).size).toBe(1);

    // Three icons plus "+N" (6 events, +1 for the day with the countdown), meals compact.
    const wednesday = columns.nth(3);
    await expect(wednesday.getByRole("img")).toHaveCount(3);
    // The countdown event wins a slot despite being late in the day.
    await expect(
      wednesday.getByRole("img", { name: "Birthday party" }),
    ).toBeVisible();
    await expect(wednesday.getByText("+4", { exact: true })).toBeVisible();
    await expect(
      columns.first().getByText("+3", { exact: true }),
    ).toBeVisible();
    await expect(
      wednesday.getByRole("listitem").filter({ hasText: "Apple" }),
    ).toBeVisible();
    await expectNoOverflow(page);

    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/week-${testInfo.project.name}.png`,
      });
    }

    await toDay.click();
    await expect(page.getByTestId("day-band")).toHaveCount(3);
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
          name: locale === "en" ? "Week view" : "Wochenansicht",
        })
        .click();
      await expect(page.getByTestId("week-day")).toHaveCount(7);
      const wrapped = await page.evaluate(() =>
        [...document.querySelectorAll("[data-testid=week-day] h2")]
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
    await page.getByRole("button", { name: "Week view" }).click();
    await expect(page.getByTestId("week-day")).toHaveCount(7);
    await expect(
      page
        .getByTestId("week-day")
        .first()
        .getByRole("img", { name: "Swimming" }),
    ).toBeVisible();
    await expectNoOverflow(page);
  });

  test("child colour ring and avatar on icons, finished events of today rank last", async ({
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
          // Tomorrow the same early events are not over.
          { title: "Swimming", icon: "🏊", time: "07:30", day: 1 },
        ],
        [],
      ),
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Week view" }).click();
    const columns = page.getByTestId("week-day");
    const today = columns.first();
    await expect(
      today
        .getByRole("img")
        .evaluateAll((all) => all.map((img) => img.getAttribute("aria-label"))),
    ).resolves.toEqual(["Lunch", "Football", "Music"]);
    await expect(today.getByText("+2", { exact: true })).toBeVisible();

    // Child cue: ring colour from the first child, avatars for all, name for assistive tech.
    const icons = today.getByTestId("week-icon");
    await expect(icons.nth(0)).toHaveAttribute("data-child-ids", "");
    await expect(icons.nth(1)).toHaveAttribute("data-child-ids", "ben");
    await expect(icons.nth(2)).toHaveAttribute("data-child-ids", "mia ben");
    await expect(icons.nth(1)).toContainText("🐻");
    await expect(icons.nth(2)).toContainText("🦊");
    await expect(icons.nth(2)).toContainText("🐻");
    await expect(icons.nth(2).getByText("For Mia and Ben")).toBeAttached();
    const rings = await icons.evaluateAll((all) =>
      all.map((li) => {
        const style = getComputedStyle(li);
        return { shadow: style.boxShadow };
      }),
    );
    expect(rings[0]?.shadow).toBe("none");
    // The ring (box-shadow) is drawn in the child's colour: Ben is child-2 (#0072b2).
    expect(rings[1]?.shadow).toContain("rgb(0, 114, 178)");
    // Mia (child-1, #c2410c) for the shared event: the first child wins.
    expect(rings[2]?.shadow).toContain("rgb(194, 65, 12)");

    // Tomorrow nothing is over: the early event keeps its place.
    await expect(
      columns.nth(1).getByRole("img", { name: "Swimming" }),
    ).toBeVisible();
    await expectNoOverflow(page);
  });
});
