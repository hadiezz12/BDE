import { expect, test } from "@playwright/test";

/**
 * Development test accounts (AUTH_TEST_ACCOUNTS=on). CI creates one fictional
 * account on the local stack with supabase/dev/create-test-account.sql and
 * passes its password in E2E_TEST_ACCOUNT_PASSWORD; without it, this is skipped.
 */
const EMAIL = "e2e.membre@comptes.example.test";
const password = process.env.E2E_TEST_ACCOUNT_PASSWORD;

test("a fictional test account signs in with its password, and only a test address can", async ({ page }) => {
  test.skip(!password, "needs the local test account created by CI");
  await page.goto("/login?next=%2Faccount%2Fprofile");
  const address = page.getByLabel("Adresse du compte test");
  const secret = page.getByLabel("Mot de passe du compte test");
  const submit = page.getByRole("button", { name: "Entrer avec le compte test" });

  const refused = page.getByText("Adresse ou mot de passe incorrect pour un compte test.");

  // A school-looking address is refused here, whatever the password. Each
  // attempt ends with React resetting the form (the password field empties):
  // wait for that before typing the next attempt, or the reset wipes it.
  await address.fill("alice@student.example.test");
  await secret.fill(password!);
  await submit.click();
  await expect(secret).toHaveValue("");
  await expect(refused).toBeVisible();

  // Wrong password.
  await address.fill(EMAIL);
  await secret.fill("not-the-password");
  await submit.click();
  await expect(secret).toHaveValue("");
  await expect(refused).toBeVisible();
  await expect(address).toHaveValue(EMAIL);

  // Right one: straight to where they were going (the account is already onboarded).
  await secret.fill(password!);
  await submit.click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByLabel("Nom affiché")).toHaveValue("Compte test · Membre");

  // Signed in is not authorized: still nothing to manage.
  await page.goto("/manage");
  await expect(page.getByText("L'espace des bureaux ouvre bientôt.")).toBeVisible();
});
