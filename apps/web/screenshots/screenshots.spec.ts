import { expect, type Page, test } from "@playwright/test";

import { demoAgenda, demoConfig } from "../demo/demoData";
import { at, dateOf, mockBoard, NOW } from "../e2e/mockApi";
import { SCREENSHOT_DIR } from "./paths";

/*
 * README screenshots: day and week view, light and night, with the synthetic demo data
 * (Mia 🦊 / Ben 🐻). Deterministic: the clock is fixed (Sunday 12:00 / 20:00 Berlin), the
 * burn-in shift is pinned to its centre (`?burnin=0`), animations are off (reduced motion).
 * Run with `pnpm screenshots` after `pnpm build`.
 */

const NIGHT_NOW = at("20:00");

type Theme = "light" | "night";

async function openBoard(
  page: Page,
  theme: Theme,
  options: { countdownDays?: number } = {},
): Promise<void> {
  const now = theme === "light" ? NOW : NIGHT_NOW;
  await mockBoard(page, {
    config: demoConfig(),
    agenda: demoAgenda(dateOf(0), now, options),
    now,
  });
  await page.goto(`/?burnin=0&night=${theme === "night" ? "1" : "0"}`);
  await expect(page.getByTestId("board-ready")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function shoot(page: Page, name: string, size: string): Promise<void> {
  // Webfont and emoji glyphs must be in before the picture is taken.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}-${size}.png`,
    animations: "disabled",
    caret: "hide",
  });
}

for (const theme of ["light", "night"] as const) {
  test(`day and week view, ${theme}`, async ({ page }, testInfo) => {
    const size = testInfo.project.name.replace("tablet-", "");
    await openBoard(page, theme);
    await expect(page.getByTestId("countdown")).toHaveAttribute(
      "data-nights",
      "6",
    );
    await shoot(page, `day-${theme}`, size);

    await page.getByRole("button", { name: "Week view" }).click();
    await expect(page.getByTestId("day-column")).toHaveCount(7);
    await shoot(page, `week-${theme}`, size);
  });
}

test("countdown reaching today, light", async ({ page }, testInfo) => {
  const size = testInfo.project.name.replace("tablet-", "");
  await openBoard(page, "light", { countdownDays: 0 });
  await expect(page.getByTestId("countdown-today")).toContainText("🎉");
  await shoot(page, "day-countdown-today", size);
});
