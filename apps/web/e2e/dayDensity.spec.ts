import { expect, test } from "@playwright/test";

import { expectNoOverflow, MEALS } from "./layout";
import { agenda, mockBoard, type MockEvent } from "./mockApi";

/*
 * Day-band density matrix: 1 to 8 timed events in every band at once, with and without
 * an all-day row, plus four meals; both tablet sizes run it as their own project. Every
 * event stays fully visible inside its band (nothing clipped), and above the band's
 * capacity a "+N" tile says how many are not shown instead of hiding them silently.
 */

const BAND_STARTS = { morning: 6, midday: 11, evening: 17 } as const;
type Band = keyof typeof BAND_STARTS;
const BANDS = Object.keys(BAND_STARTS) as Band[];
const ICONS = ["🏊", "🦷", "🎻", "⚽", "🎨", "🛝", "📚", "🧸", "🚲", "🎹"];

/** `count` events in `band`, every 20 minutes (up to 12 stay inside the band); long titles and two avatars on some. */
function bandEvents(band: Band, count: number): MockEvent[] {
  return Array.from({ length: count }, (_, i) => {
    const minutes = BAND_STARTS[band] * 60 + i * 20;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return {
      title:
        i % 3 === 0
          ? `${band} activity ${String(i + 1)} with a long title`
          : `${band} ${String(i + 1)}`,
      icon: ICONS[i % ICONS.length] ?? "🎨",
      time,
      childIds: i % 2 === 0 ? ["mia", "ben"] : ["ben"],
    };
  });
}

const ALL_DAY: MockEvent = {
  title: "School trip to the zoo",
  icon: "🦁",
  time: null,
  childIds: ["mia"],
};

for (const allDay of [false, true]) {
  for (let count = 1; count <= 8; count += 1) {
    test(`${String(count)} events per band${allDay ? " with an all-day row" : ""} stay visible`, async ({
      page,
    }) => {
      const events = BANDS.flatMap((band) => bandEvents(band, count));
      await mockBoard(page, {
        agenda: agenda(allDay ? [ALL_DAY, ...events] : events, MEALS),
      });
      await page.goto("/");
      await expect(page.getByTestId("day-band")).toHaveCount(3);
      for (const band of BANDS) {
        const section = page.locator(
          `[data-testid=day-band][data-band=${band}]`,
        );
        await expect(section.getByRole("article")).toHaveCount(count);
        await expect(section.getByTestId("day-band-more")).toHaveCount(0);
        for (const tile of await section.getByRole("article").all()) {
          await expect(tile).toBeInViewport({ ratio: 1 });
        }
      }
      if (allDay) {
        await expect(
          page.getByRole("article", { name: ALL_DAY.title }),
        ).toBeInViewport({ ratio: 1 });
      }
      await expectNoOverflow(page);
    });
  }
}

test("more events than a band can show end in +N tiles: past ones first, what comes next stays", async ({
  page,
}) => {
  const events = BANDS.flatMap((band) => bandEvents(band, 11));
  await mockBoard(page, { agenda: agenda([ALL_DAY, ...events], MEALS) });
  await page.goto("/");
  for (const band of BANDS) {
    const section = page.locator(`[data-testid=day-band][data-band=${band}]`);
    await expect(section.getByTestId("day-band-more").first()).toBeVisible();
    const shown = await section.getByRole("article").count();
    let hidden = 0;
    for (const more of await section.getByTestId("day-band-more").all()) {
      const kind = await more.getAttribute("data-kind");
      // The visible badge; the sr-only text follows it in the same cell.
      const badge = (
        await more.locator("[aria-hidden=true]").textContent()
      )?.match(/^\+(\d+)$/)?.[1];
      const count = Number(badge);
      expect(count).toBeGreaterThan(0);
      await expect(more).toContainText(
        kind === "earlier"
          ? `${String(count)} already over`
          : `${String(count)} more later`,
      );
      hidden += count;
    }
    // Exact: nothing lost, nothing counted twice.
    expect(shown + hidden).toBe(11);
    expect(shown).toBeGreaterThanOrEqual(6);
    for (const tile of await section.getByRole("article").all()) {
      await expect(tile).toBeInViewport({ ratio: 1 });
    }
  }
  // At the fixed 12:00 the morning is over: its oldest events are summed up first.
  const morning = page.locator("[data-testid=day-band][data-band=morning]");
  await expect(morning.getByTestId("day-band-more")).toHaveAttribute(
    "data-kind",
    "earlier",
  );
  // Midday is in progress: no past event takes a slot from what is going on or next.
  const midday = page.locator("[data-testid=day-band][data-band=midday]");
  await expect(midday.locator("article[data-status=past]")).toHaveCount(0);
  await expect(
    midday.getByRole("article", { name: "midday 5" }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    midday.locator("article[data-status=current]").first(),
  ).toBeVisible();
  await expectNoOverflow(page);
});
