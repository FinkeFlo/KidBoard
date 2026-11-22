import { expect, test } from "@playwright/test";

test("renders the placeholder page", async ({ page }) => {
  // The API is never contacted for real in E2E: intercept every call.
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: { ok: true } }),
  );

  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "KidBoard" }),
  ).toBeVisible();
  await expect(page.getByText("Placeholder page")).toBeVisible();
});

test("fits the viewport without scrolling", async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: { ok: true } }),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "KidBoard" }),
  ).toBeVisible();

  const metrics = await page.evaluate(() => ({
    docScrollHeight: document.documentElement.scrollHeight,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    rootFontSize: parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    ),
  }));

  expect(metrics.docScrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
  expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
  expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  // Fluid root size: 16px at 1280x800, 24px at 2000x1200.
  expect(metrics.rootFontSize).toBeCloseTo(metrics.innerHeight / 50, 0);
});

test("applies the self-hosted Nunito font and token colors", async ({
  page,
}) => {
  await page.goto("/");
  const style = await page.evaluate(async () => {
    await document.fonts.ready;
    const heading = document.querySelector("h1");
    return {
      family: heading ? getComputedStyle(heading).fontFamily : "",
      nunitoLoaded: document.fonts.check('16px "Nunito Variable"'),
      background: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(style.family).toContain("Nunito Variable");
  expect(style.nunitoLoaded).toBe(true);
  expect(style.background).toBe("rgb(255, 248, 240)");
});
