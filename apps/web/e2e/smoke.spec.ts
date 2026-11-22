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
