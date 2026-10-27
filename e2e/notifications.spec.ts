import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 10 — the notification centre on the local stack: the bell, the
 * centre and its filters, a person's choices (essential topics fixed),
 * quiet hours, a message from an association to its members, and the links
 * that must refuse (another person's notification, a forged unsubscribe
 * token). Fictional seed accounts only (supabase/seed.sql). E-mails stay
 * "off" on this stack: nothing is sent.
 */

// The seed's LOCAL-ONLY password (supabase/seed.sql): fictional accounts on the CI stack.
const SEED_PASSWORD = "seed-local-password-2026";

test.describe.configure({ mode: "serial" });
test.skip(!process.env.E2E_TEST_ACCOUNT_PASSWORD, "needs the local stack with test-account sign-in (CI e2e job)");

async function signInAs(page: Page, local: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse du compte test").fill(`${local}@comptes.example.test`);
  await page.getByLabel("Mot de passe du compte test").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrer avec le compte test" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("the bell opens the latest notifications and leads to the centre", async ({ page }) => {
  await signInAs(page, "tom");
  await page.goto("/");
  const bell = page.locator("header").getByRole("button", { name: /^Notifications/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(bell).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(bell).toHaveAttribute("aria-expanded", "false");
  await expect(bell).toBeFocused();

  await page.goto("/account/notifications");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  const filters = page.getByRole("navigation", { name: "Filtrer les notifications" });
  await filters.getByRole("link", { name: "Archivées" }).click();
  await expect(page).toHaveURL(/vue=archivees/);
  await filters.getByRole("link", { name: "Recrutement", exact: true }).click();
  await expect(page).toHaveURL(/categorie=recrutement/);
  await expect(page).toHaveURL(/vue=archivees/);
});

test("choices: essential topics stay on, the others are the person's, and quiet hours are saved", async ({ page }) => {
  await signInAs(page, "tom");
  await page.goto("/account/notifications/reglages");
  const essential = page.locator("form").filter({ hasText: "Tes inscriptions" });
  await expect(essential.getByLabel("Par e-mail")).toBeDisabled();
  await expect(essential.getByLabel("Par e-mail")).toBeChecked();

  const followed = page.locator("form").filter({ hasText: "Assos que tu suis" });
  const email = followed.getByLabel("Par e-mail");
  const before = await email.isChecked();
  await email.click();
  await expect(followed.getByText("Choix enregistré.")).toBeVisible();
  await page.reload();
  await expect(page.locator("form").filter({ hasText: "Assos que tu suis" }).getByLabel("Par e-mail")).toBeChecked({ checked: !before });

  await page.getByLabel("Pas d'e-mail qui peut attendre", { exact: false }).check();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Heures calmes enregistrées", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Heures calmes activées")).toBeVisible();
});

test("an association writes to its members: a draft, the count, then the message", async ({ page }) => {
  await signInAs(page, "julie.finance");
  await page.goto("/manage/exemple-finance/communication");
  await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  await page.getByRole("radio", { name: /Les membres de l'équipe/ }).check();
  const title = `Réunion fictive (e2e) ${Date.now().toString(36)}`;
  await page.getByRole("textbox", { name: "Titre" }).fill(title);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Texte fictif : la réunion d'équipe (exemple) est déplacée.");
  await page.getByRole("textbox", { name: "Lien" }).fill("https://ailleurs.example.test");
  await page.getByRole("button", { name: "Préparer l'envoi" }).click();
  // The browser's own check refuses an outside address before the database does.
  await expect(page.getByText("Avant d'envoyer")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Lien" }).fill("");
  await page.getByRole("button", { name: "Préparer l'envoi" }).click();
  await expect(page.getByText("Avant d'envoyer")).toBeVisible();
  await page.getByRole("button", { name: /^Envoyer à/ }).click();
  await expect(page.getByText("C'est parti", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
});

test("links refuse what they must: another person's notification, a forged unsubscribe token", async ({ page, request }) => {
  await page.goto("/notifications/desabonnement?t=" + "f".repeat(64));
  await expect(page.getByText("pas valable", { exact: false })).toBeVisible();
  expect((await request.post("/api/notifications/unsubscribe?t=xyz")).status()).toBe(400);
  expect((await request.post("/api/notifications/unsubscribe?t=" + "f".repeat(64))).status()).toBe(200);

  await signInAs(page, "tom");
  await page.goto("/account/notifications/999999999");
  await expect(page).toHaveURL(/\/account\/notifications\?introuvable=1$/);
  await expect(page.getByText("n'existe plus", { exact: false })).toBeVisible();
});
