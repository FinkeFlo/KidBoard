import { expect, test } from "@playwright/test";

import { agenda, mockBoard, type MockEvent } from "./mockApi";

const EVENTS: MockEvent[] = [
  { title: "Swimming", icon: "🏊", time: "07:30", childIds: ["mia"] },
  { title: "Lunch with Grandma", icon: "👵", time: "11:30" },
  { title: "Bath time", icon: "🛁", time: "18:00" },
];

/** Busy week as in week.spec.ts: 6 events and 4 meals on every day. */
const BUSY_EVENTS: MockEvent[] = Array.from({ length: 7 }, (_, day) => [
  { title: `Swimming ${String(day)}`, icon: "🏊", time: "07:30", day },
  { title: `Dentist ${String(day)}`, icon: "🦷", time: "08:30", day },
  { title: `Music ${String(day)}`, icon: "🎻", time: "10:00", day },
  { title: `Football ${String(day)}`, icon: "⚽", time: "15:00", day },
  { title: `Bath ${String(day)}`, icon: "🛁", time: "18:00", day },
  { title: `Trip ${String(day)}`, icon: "🦁", time: null, day },
]).flat();
const BUSY_MEALS = Array.from({ length: 7 }, (_, day) => [
  { slot: "breakfast", title: "Oatmeal with berries", icon: "🥣", day },
  { slot: "lunch", title: "Spaghetti with tomato sauce", icon: "🍝", day },
  { slot: "dinner", title: "Vegetable soup and bread", icon: "🍲", day },
  { slot: "unspecified", title: "Apple slices", icon: "🍎", day },
]).flat();

test.describe("fullscreen control", () => {
  test("is a quiet 64px corner target that causes no overflow", async ({
    page,
  }) => {
    await mockBoard(page, {
      agenda: agenda(EVENTS, [
        { slot: "lunch", title: "Spaghetti with tomato sauce", icon: "🍝" },
      ]),
    });
    await page.goto("/");
    const control = page.getByRole("button", { name: /fullscreen on/i });
    await expect(control).toBeVisible();

    const box = await control.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box === null || viewport === null) return;
    expect(box.width).toBeGreaterThanOrEqual(64);
    expect(box.height).toBeGreaterThanOrEqual(64);
    // Fully inside the viewport, in the bottom-right corner.
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(box.x + box.width).toBeGreaterThan(viewport.width - 1);
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 1);

    // It is an overlay: the document does not grow and the header keeps its place.
    const scroll = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }));
    expect(scroll.w).toBeLessThanOrEqual(viewport.width);
    expect(scroll.h).toBeLessThanOrEqual(viewport.height);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sunday" }),
    ).toBeInViewport({ ratio: 1 });
  });

  test("a short tap does nothing, a long press enters fullscreen", async ({
    page,
  }) => {
    await mockBoard(page);
    await page.goto("/");
    const control = page.getByTestId("fullscreen-control");
    await expect(control).toBeVisible();

    await control.click();
    expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(
      false,
    );

    const box = await control.boundingBox();
    if (box === null) throw new Error("control has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await expect(control).toHaveAttribute("data-active", "true");
    await expect(control).toBeVisible();
  });

  for (const view of ["Day view", "Week view"] as const) {
    test(`never covers content on a busy ${view.toLowerCase()}`, async ({
      page,
    }) => {
      await mockBoard(page, { agenda: agenda(BUSY_EVENTS, BUSY_MEALS) });
      await page.goto("/");
      await page.getByRole("button", { name: view }).click();
      const control = page.getByTestId("fullscreen-control");
      await expect(control).toBeVisible();

      const report = await page.evaluate(() => {
        const control = document.querySelector(
          "[data-testid=fullscreen-control]",
        );
        if (control === null) throw new Error("no control");
        const c = control.getBoundingClientRect();
        const covered: string[] = [];
        for (const el of document.querySelectorAll("main *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const overlaps =
            r.left < c.right - 0.5 &&
            r.right > c.left + 0.5 &&
            r.top < c.bottom - 0.5 &&
            r.bottom > c.top + 0.5;
          if (overlaps) {
            covered.push(`${el.tagName} ${el.textContent.slice(0, 30)}`);
          }
        }
        const root = document.documentElement;
        return {
          covered,
          doc: [root.scrollWidth, root.scrollHeight],
          view: [window.innerWidth, window.innerHeight],
          clipped: [...document.querySelectorAll("main")].filter(
            (m) => m.scrollHeight > m.clientHeight + 1,
          ).length,
        };
      });
      expect(report.covered).toEqual([]);
      expect(report.doc[0]).toBeLessThanOrEqual(report.view[0] ?? 0);
      expect(report.doc[1]).toBeLessThanOrEqual(report.view[1] ?? 0);
      expect(report.clipped).toBe(0);
    });
  }
});
