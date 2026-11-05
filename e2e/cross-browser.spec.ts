import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 15 — the main paths on the other browser engines: Firefox, WebKit
 * (Safari's engine) on a desktop and on an iPhone-sized screen. Runs only in
 * the "firefox", "webkit" and "iphone" projects (playwright.config.ts); the
 * whole suite already runs in Chromium. Emulation in CI, not real devices.
 * Fictional seed accounts only; nothing here changes data.
 */

const SEED_PASSWORD = "seed-local-password-2026";

async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

test("public pages render and run under the security policy", async ({ page }) => {
  await watchViolations(page);
  for (const path of ["/", "/associations", "/events", "/recruitment", "/campus", "/privacy", "/login"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await violations(page), `CSP violations on ${path}`).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `sideways scrolling on ${path}`).toBeLessThanOrEqual(1);
  }
});

test("search opens from the keyboard and finds something", async ({ page }) => {
  await page.goto("/events");
  const opener = page.getByRole("button", { name: /Rechercher/ }).first();
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Recherche" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type("exemple");
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("an event opens from the list", async ({ page }) => {
  await page.goto("/events");
  const href = await page
    .locator('a[href^="/events/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? "").find((h) => /^\/events\/[a-z0-9-]+$/.test(h) && h !== "/events/calendrier"));
  expect(href, "an event in the list").toBeTruthy();
  await page.goto(href!);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("a student signs in, reaches their space, signs out, and the space closes", async ({ page }) => {
  await watchViolations(page);
  await page.goto("/login");
  await page.getByLabel("Adresse du compte test").fill("tom@comptes.example.test");
  await page.getByLabel("Mot de passe du compte test").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrer avec le compte test" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator("h1").first()).toContainText(/Tom/);
  expect(await violations(page)).toEqual([]);
  await page.goto("/account/applications");
  await expect(page.locator("h1").first()).toBeVisible();

  // Sign out through the account menu (a sheet on a phone).
  await page.getByRole("banner").getByRole("button", { name: /Tom|Mon compte/ }).first().click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});
