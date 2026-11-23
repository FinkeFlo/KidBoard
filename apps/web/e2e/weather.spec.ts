import { expect, type Locator, type Page, test } from "@playwright/test";

import { demoWeather } from "../demo/demoData";
import { clothingPlacement, columnAccount, expectNoOverflow } from "./layout";
import {
  agenda,
  at,
  CHILDREN,
  config,
  dateOf,
  mockBoard,
  type MockEvent,
  NOW,
  setNow,
} from "./mockApi";

/*
 * Weather and what to wear (T-49) on a fixed clock (device zone America/Los_Angeles,
 * config zone Europe/Berlin): a chip on every overview column and in the week headers
 * (synthetic demo forecast: today mostly sunny, now 8°, high 12°; tomorrow rain, 7°),
 * today's clothing row until eveningStart (17:00) and tomorrow's with the 🎒 day cue from
 * then; weather off shows nothing and never asks; a failing `/api/weather` hides the
 * weather without any message.
 */

const MEALS = [0, 1, 2, 3].flatMap((day) => [
  { slot: "breakfast", title: "Oatmeal with berries", icon: "🥣", day },
  { slot: "dinner", title: "Vegetable soup and bread", icon: "🍲", day },
]);

const EVENTS: MockEvent[] = [
  { title: "Kindergarten", icon: "🏫", time: "08:30", childIds: ["ben"] },
  { title: "Piano", icon: "🎹", time: "16:30", childIds: ["mia"] },
  { title: "Bath time", icon: "🛁", time: "18:00" },
  {
    title: "Swimming",
    icon: "🏊",
    time: "07:30",
    day: 1,
    childIds: ["mia"],
    bring: ["🩱", "🧴"],
  },
  { title: "Dentist", icon: "🦷", time: "09:00", day: 2 },
];

const todayColumn = (page: Page): Locator =>
  page.locator("[data-testid=day-column][data-today=true]");

async function openBoard(
  page: Page,
  options: { weather?: boolean; now?: string; status?: number } = {},
): Promise<Awaited<ReturnType<typeof mockBoard>>> {
  const now = options.now ?? NOW;
  const api = await mockBoard(page, {
    config: config({ weather: options.weather ?? true }),
    agenda: agenda(EVENTS, MEALS),
    weather:
      options.status === undefined || options.status === 200
        ? demoWeather(dateOf(0), now)
        : { error: "weather_unavailable" },
    weatherStatus: options.status ?? 200,
    now,
  });
  await page.goto("/");
  await expect(page.getByTestId("board-ready")).toBeVisible();
  return api;
}

/**
 * Nothing overlaps or is cut; with `sameLine` the pill also sits beside the chip in the
 * heading row (the demo's one to four items with "now 8°" fit at both sizes).
 */
async function expectClothingLayout(
  page: Page,
  { sameLine = false }: { sameLine?: boolean } = {},
): Promise<void> {
  const placement = await clothingPlacement(page);
  expect(placement.problems).toEqual([]);
  if (sameLine) expect(placement.sameLine).toBe(true);
}

test("chips on every overview column and in the week headers, with the attribution", async ({
  page,
}) => {
  await openBoard(page);
  const columns = page.getByTestId("day-column");
  await expect(columns).toHaveCount(4);
  await expect(page.getByTestId("weather-chip")).toHaveCount(4);
  for (const [index, column] of (await columns.all()).entries()) {
    await expect(column.getByTestId("weather-chip")).toHaveAttribute(
      "data-date",
      dateOf(index),
    );
    await expect(column.getByTestId("weather-chip")).toBeInViewport({
      ratio: 1,
    });
  }
  await expect(
    todayColumn(page).getByRole("img", {
      name: "Mostly sunny, now 8 degrees, high 12 degrees",
    }),
  ).toHaveText("🌤️8°");
  await expect(
    columns.nth(1).getByRole("img", { name: "Rain, high 7 degrees" }),
  ).toHaveText("🌧️7°");
  // Never the moon for the weather (rule 1).
  await expect(
    page.getByTestId("weather-chip").filter({ hasText: "🌙" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("weather-attribution")).toHaveText(
    "Weather: Open-Meteo.com",
  );
  await expect(page.getByTestId("weather-attribution")).toBeInViewport({
    ratio: 1,
  });
  await expectNoOverflow(page);

  await page.getByRole("button", { name: "Week" }).click();
  await expect(columns).toHaveCount(7);
  const chips = page.getByTestId("weather-chip");
  await expect(chips).toHaveCount(7);
  for (const chip of await chips.all()) {
    await expect(chip).toHaveAttribute("aria-hidden", "true");
    await expect(chip).toBeInViewport({ ratio: 1 });
  }
  await expect(
    page.getByRole("heading", { name: "Monday, Rain, high 7 degrees" }),
  ).toBeVisible();
  await expect(page.getByTestId("clothing-row")).toHaveCount(0);
  // Week account: nothing lost with the weather line in the header.
  const today = page.locator("[data-testid=day-column][data-today=true]");
  const account = await columnAccount(today);
  expect(account.shown.length + account.folded + account.hidden).toBe(3);
  await expectNoOverflow(page);
});

for (const night of [false, true]) {
  const mode = night ? "night" : "light";
  test(`today's clothes in the morning, tomorrow's from eveningStart (${mode})`, async ({
    page,
  }) => {
    await mockBoard(page, {
      config: config({ weather: true, children: CHILDREN }),
      agenda: agenda(EVENTS, MEALS),
      weather: demoWeather(dateOf(0), at("16:59")),
      now: at("16:59"),
    });
    await page.goto(`/?night=${night ? "1" : "0"}`);
    await expect(page.getByTestId("board-ready")).toBeVisible();
    const column = todayColumn(page);
    const morning = column.getByRole("list", { name: "Wear today: jacket" });
    await expect(morning).toBeVisible();
    await expect(column.getByTestId("clothing-row")).toHaveAttribute(
      "data-when",
      "today",
    );
    await expect(column.getByTestId("clothing-arrow")).toHaveCount(0);
    await expect(column.getByTestId("clothing-day")).toHaveCount(0);
    await expect(page.getByTestId("clothing-row")).toHaveCount(1);
    await expectClothingLayout(page, { sameLine: true });

    // eveningStart: tomorrow's clothes (cold and rainy), with the 🎒 day cue.
    await setNow(page, at("17:00"));
    const evening = column.getByRole("list", {
      name: "Wear tomorrow: umbrella, boots, jacket, and scarf",
    });
    await expect(evening).toBeVisible();
    await expect(evening.getByRole("listitem")).toHaveText([
      "☔",
      "👢",
      "🧥",
      "🧣",
    ]);
    await expect(column.getByTestId("clothing-arrow")).toBeVisible();
    await expect(column.getByTestId("clothing-day")).toHaveText("Mon");
    await expectClothingLayout(page, { sameLine: true });
    // The 🎒 area shows too, and neither 🎒 nor 🌙 is used for the weather.
    await expect(column.getByTestId("bring-area")).toBeVisible();
    await expect(column.getByTestId("clothing-row")).not.toContainText(
      /🎒|🌙/u,
    );
    // Not a live region, nothing to touch.
    await expect(
      column.getByTestId("clothing-row").locator("[aria-live], button, a"),
    ).toHaveCount(0);

    await setNow(page, at("19:40"));
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      night ? "night" : "light",
    );
    if (night) {
      // Night: the emoji are dimmed through <Emoji>.
      const filter = await column
        .getByTestId("clothing-item")
        .first()
        .locator(".font-emoji")
        .evaluate((emoji) => getComputedStyle(emoji).filter);
      expect(filter).toContain("brightness(0.75)");
    }
    // Later the chip shows the high (12°, the "now" value is over 2 h old): the pill may
    // wrap below it, but nothing overlaps or is cut.
    await expectClothingLayout(page);
    await expectNoOverflow(page);
  });
}

test("five clothing items and the day cue wrap below the chip at 1280x800", async ({
  page,
}, testInfo) => {
  const now = at("18:00");
  const weather = demoWeather(dateOf(0), now);
  const tomorrow = weather.days[1];
  if (tomorrow === undefined) throw new Error("no forecast day");
  weather.days[1] = { ...tomorrow, feelsMin: -4, snow: true };
  await mockBoard(page, {
    config: config({ weather: true, locale: "de" }),
    agenda: agenda(EVENTS, MEALS),
    weather,
    now,
  });
  await page.goto("/");
  await expect(page.getByTestId("board-ready")).toBeVisible();
  const column = todayColumn(page);
  await expect(
    column.getByRole("list", {
      name: "Morgen anziehen: Regenschirm, Stiefel, Jacke, Schal und Handschuhe",
    }),
  ).toBeVisible();
  await expect(column.getByTestId("clothing-item")).toHaveCount(5);
  const placement = await clothingPlacement(page);
  expect(placement.problems).toEqual([]);
  if (testInfo.project.name === "tablet-1280x800") {
    // The pill moves to a line of its own below the chip, still right-aligned.
    expect(placement.sameLine).toBe(false);
  }
  for (const item of await column.getByTestId("clothing-item").all()) {
    await expect(item).toBeInViewport({ ratio: 1 });
  }
  await expectNoOverflow(page);
});

test("weather off: no chips, no clothes, no attribution, no request", async ({
  page,
}) => {
  const api = await openBoard(page, { weather: false });
  await expect(page.getByTestId("event-tile").first()).toBeVisible();
  await expect(page.getByTestId("weather-chip")).toHaveCount(0);
  await expect(page.getByTestId("clothing-row")).toHaveCount(0);
  await expect(page.getByTestId("weather-attribution")).toHaveCount(0);
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.getByTestId("day-column")).toHaveCount(7);
  await expect(page.getByTestId("weather-chip")).toHaveCount(0);
  await expect(page.getByTestId("week-weather")).toHaveCount(0);
  expect(api.requests).not.toContain("/api/weather");
});

test("a failing /api/weather hides the weather quietly", async ({ page }) => {
  const api = await openBoard(page, { status: 503 });
  await expect(page.getByTestId("event-tile").first()).toBeVisible();
  // The first attempt and the two automatic retries of a 5xx, all failed.
  await expect
    .poll(() => api.requests.filter((path) => path === "/api/weather").length, {
      timeout: 10_000,
    })
    .toBe(3);
  // Longer than the status banner's 5 s delay (STALE_BANNER_DELAY_MS): still calm.
  await page.waitForTimeout(6000);
  await expect(page.getByTestId("weather-chip")).toHaveCount(0);
  await expect(page.getByTestId("clothing-row")).toHaveCount(0);
  await expect(page.getByTestId("weather-attribution")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.locator("[data-status=stale], [data-status=offline]"),
  ).toHaveCount(0);
  await expect(page.getByTestId("updated-at")).toBeVisible();
  await expectNoOverflow(page);
});
