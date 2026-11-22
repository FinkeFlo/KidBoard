import { expect, test } from "@playwright/test";

import { columnAccount, expectNoOverflow, MEALS } from "./layout";
import {
  agenda,
  CHILDREN,
  config,
  mockBoard,
  type MockChild,
  type MockEvent,
} from "./mockApi";

/*
 * Overview density matrix: 1 to 12 timed events in today's column (at the fixed 12:00,
 * the early ones are over, one is current, the rest upcoming), three children (tiles for
 * one, two and three children and for everyone), a long German title, the 📅 fallback,
 * an all-day banner and four meals per day, the countdown in the header; English and
 * German alternate. Both tablet sizes run it as their own project, each count at a
 * pinned burn-in position (the four corners rotate through the counts). Nothing
 * scrolls, overflows or is cut; every event is a tile, in the named "vorbei" strip or
 * in a named "+N": shown + folded + hidden = n.
 */

const LEO: MockChild = {
  id: "leo",
  name: "Leo",
  color: "child-3",
  avatar: "🦁",
};
const KIDS = [...CHILDREN, LEO];
const CHILD_SETS: string[][] = [
  ["mia"],
  ["mia", "ben"],
  ["mia", "ben", "leo"],
  [],
];
const ICONS = [
  "🏊",
  "🦷",
  "📅",
  "🎻",
  "⚽",
  "🎨",
  "🛝",
  "📚",
  "🧸",
  "🚲",
  "🎹",
];
const LONG_TITLE =
  "Kinderturnen in der Sporthalle am Marktplatz mit Elternabend";
/** Burn-in corners (maximum shift on both axes), see burnin.spec.ts. */
const CORNERS = [1, 3, 5, 7] as const;

/** `count` one-hour events today from 07:00 on, every hour. */
function todayEvents(count: number): MockEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    title: i % 4 === 1 ? LONG_TITLE : `Termin ${String(i + 1)}`,
    icon: ICONS[i % ICONS.length] ?? "📅",
    time: `${String(7 + i).padStart(2, "0")}:00`,
    childIds: CHILD_SETS[i % CHILD_SETS.length] ?? [],
  }));
}

/** A few events on the other overview days, so every column has tiles and plates. */
const OTHER_DAYS: MockEvent[] = [1, 2, 3].flatMap((day) => [
  { title: "Kita", icon: "🏫", time: "08:00", day, childIds: ["mia", "ben"] },
  { title: LONG_TITLE, icon: "📅", time: "15:00", day, childIds: ["leo"] },
  { title: "Baden", icon: "🛁", time: "18:30", day },
]);
const ALL_DAY: MockEvent = {
  title: "Ausflug in den Zoo",
  icon: "🦁",
  time: null,
  childIds: ["mia", "ben", "leo"],
};
const COUNTDOWN: MockEvent = {
  title: "Geburtstag",
  icon: "🎂",
  time: null,
  day: 9,
  countdown: true,
  childIds: ["mia"],
};

for (let count = 1; count <= 12; count += 1) {
  const locale = count % 2 === 0 ? "de" : "en";
  const corner = CORNERS[count % CORNERS.length] ?? 1;
  test(`${String(count)} events today (${locale}, burn-in corner ${String(corner)}) fit without loss`, async ({
    page,
  }) => {
    const events = todayEvents(count);
    await mockBoard(page, {
      config: config({ locale, children: KIDS }),
      agenda: agenda(
        [ALL_DAY, COUNTDOWN, ...events, ...OTHER_DAYS],
        MEALS.filter((meal) => meal.day < 4),
      ),
    });
    await page.goto(`/?burnin=${String(corner)}`);
    await expect(page.getByTestId("board-ready")).toBeVisible();
    const today = page.locator("[data-testid=day-column][data-today=true]");
    await expect(today.getByTestId("event-tile").first()).toBeVisible();

    const account = await columnAccount(today);
    // No loss: every event is a tile, folded into the strip or summed up in "+N".
    expect(account.shown.length + account.folded + account.hidden).toBe(count);
    for (const event of events) {
      const named =
        account.shown.some((name) => name.startsWith(event.title)) ||
        account.stripName.includes(event.title) ||
        account.hiddenText.includes(event.title);
      expect(named, event.title).toBe(true);
    }
    // Up to four events need no folding at either size.
    if (count <= 4) expect(account.shown).toHaveLength(count);
    // The current event (12:00) is never folded or summed up.
    if (count >= 6) {
      await expect(
        today.locator("article[data-status=current]"),
      ).toBeInViewport({ ratio: 1 });
    }
    for (const tile of await today.getByRole("article").all()) {
      await expect(tile).toBeInViewport({ ratio: 1 });
    }
    // Today's emoji stay at least 3.5rem, also dense.
    const sizes = await today
      .getByTestId("column-events")
      .getByTestId("event-tile")
      .evaluateAll((tiles) => {
        const rem = parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        );
        return tiles.map(
          (tile) =>
            parseFloat(
              getComputedStyle(tile.querySelector(".font-emoji") as Element)
                .fontSize,
            ) / rem,
        );
      });
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(3.5 - 0.01);
    // Every plate of every column is on screen.
    for (const plate of await page
      .getByTestId("meal-plates")
      .getByRole("img")
      .all()) {
      await expect(plate).toBeInViewport({ ratio: 1 });
    }
    await expect(
      page.getByTestId("all-day").first().getByRole("article"),
    ).toBeInViewport({ ratio: 1 });
    await expectNoOverflow(page);
  });
}

test("a crowded day folds the past into the strip first, then sums up the latest", async ({
  page,
}) => {
  const events = todayEvents(12);
  await mockBoard(page, {
    config: config({ children: KIDS }),
    agenda: agenda([ALL_DAY, ...events, ...OTHER_DAYS], MEALS),
  });
  await page.goto("/");
  const today = page.locator("[data-testid=day-column][data-today=true]");
  await expect(today.getByTestId("past-strip")).toBeVisible();
  const account = await columnAccount(today);
  // 07:00-11:00 are over at 12:00: the strip names all of them.
  expect(account.folded).toBe(5);
  expect(account.stripName).toMatch(/^Already over: /);
  for (const event of events.slice(0, 5)) {
    expect(account.stripName).toContain(event.title);
  }
  // Nothing past takes a tile while the strip holds them; what comes next stays.
  await expect(today.locator("article[data-status=past]")).toHaveCount(0);
  await expect(today.locator("article[data-status=current]")).toHaveCount(1);
  await expect(today.locator("article[data-next=true]")).toBeInViewport({
    ratio: 1,
  });
  if (account.hidden > 0) {
    const more = today.getByTestId("column-more");
    await expect(more.locator("[aria-hidden=true]")).toHaveText(
      `+${String(account.hidden)}`,
    );
    expect(account.hiddenText).toMatch(
      new RegExp(`^${String(account.hidden)} more later: `),
    );
    // The summed-up ones are the latest.
    for (const event of events.slice(12 - account.hidden)) {
      expect(account.hiddenText).toContain(event.title);
    }
  }
  expect(account.shown.length + account.folded + account.hidden).toBe(12);
  await expectNoOverflow(page);
});
