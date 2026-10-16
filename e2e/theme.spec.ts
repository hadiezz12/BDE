import { expect, test } from "@playwright/test";

/** Light / dark: dark (the maquette) by default, the visitor's choice remembered by the server. */
test("the light theme is chosen in the header and remembered", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  const toggle = page.getByRole("button", { name: "Mode clair" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#fdf9fb");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(253, 249, 251)");

  // Rendered light by the server on the next visit, without a flash.
  await page.goto("/events");
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Mode clair" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Mode clair" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
});
