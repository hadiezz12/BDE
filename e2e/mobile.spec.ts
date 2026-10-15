import { expect, test } from "@playwright/test";
import { fakeStudent, signInWithEmail } from "./helpers";

/** Phone: sign-in, the code step and the first-visit form, without horizontal scrolling. */
test("sign-in and onboarding work on a phone", async ({ page }) => {
  const email = fakeStudent("ines");
  await signInWithEmail(page, email, "/login");
  await expect(page).toHaveURL(/\/account\/onboarding/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);

  await page.getByLabel("Prénom").fill("Inès");
  await page.getByLabel("Nom", { exact: true }).fill("Exemple");
  await page.getByRole("button", { name: "C'est parti" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Inès");
});
