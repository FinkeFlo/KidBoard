import { expect, test } from "@playwright/test";

import { expectNoOverflow, moons, withCountdown } from "./layout";
import { mockBoard } from "./mockApi";

const SHOT_DIR = process.env["E2E_SCREENSHOT_DIR"];

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
    await expect(page.getByTestId("board-ready")).toBeVisible();
    await expectNoOverflow(page);
    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/countdown-day-30-${testInfo.project.name}.png`,
      });
    }

    await page.getByRole("button", { name: "Week" }).click();
    await expect(page.getByTestId("day-column")).toHaveCount(7);
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

    await page.getByRole("button", { name: "Week" }).click();
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
    await page.getByRole("button", { name: "Today" }).click();
    await expect(countdown).toHaveAttribute("data-variant", "compact");
    await expectNoOverflow(page);
    if (SHOT_DIR !== undefined) {
      await page.screenshot({
        path: `${SHOT_DIR}/countdown-day-14-offline-${testInfo.project.name}.png`,
      });
    }
  });

  test("compact moons on the day view are large, and no 🎉 cue while nights are left", async ({
    page,
  }) => {
    await mockBoard(page, { agenda: withCountdown(6) });
    await page.goto("/");
    await expect(page.getByTestId("countdown")).toHaveAttribute(
      "data-variant",
      "compact",
    );
    expect(await moons(page)).toBe(6);
    await expect(page.getByTestId("countdown-today")).toHaveCount(0);
    const sizes = await page.evaluate(() => {
      const px = (el: Element | null): number =>
        el === null ? 0 : Number.parseFloat(getComputedStyle(el).fontSize);
      const moon = [
        ...document.querySelectorAll("[data-testid=countdown] .font-emoji"),
      ].find((el) => el.textContent === "🌙");
      const heading = document.querySelector("h1");
      return { moon: px(moon ?? null), title: px(heading) };
    });
    // The day-view heading is display-sized; the moon is at least 2 x the body text size
    // (--text-body is 1.125rem; the root size is 16 px at 1280 wide and grows with the screen).
    const root = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    );
    expect(sizes.moon).toBeGreaterThanOrEqual(root * 2);
    expect(sizes.moon).toBeLessThan(sizes.title);
    await expectNoOverflow(page);
  });

  test("today: the today state in both views", async ({ page }) => {
    await mockBoard(page, { agenda: withCountdown(0) });
    await page.goto("/");
    const countdown = page.getByRole("region", { name: "How many sleeps?" });
    await expect(countdown).toHaveAttribute("data-nights", "0");
    await expect(countdown).toContainText("Today!");
    // A picture for children who cannot read "Today!": the party popper.
    await expect(page.getByTestId("countdown-today")).toContainText("🎉");
    expect(await moons(page)).toBe(0);
    await expectNoOverflow(page);
    await page.getByRole("button", { name: "Week" }).click();
    await expect(countdown).toHaveAttribute("data-variant", "full");
    await expect(page.getByTestId("countdown-today")).toContainText("🎉");
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
