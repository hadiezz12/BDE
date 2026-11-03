import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 13 — statistics on the local stack: an association president's
 * dashboard, views, report and CSV; a communications officer who sees
 * articles and events but no recruitment and no export; the BDE's platform
 * totals with recruitment suppressed; the doors that stay closed (another
 * association, a student, an export without the site's origin or the second
 * factor). Fictional seed accounts only (supabase/seed.sql).
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

test("an association president reads every view, prints a report and downloads a CSV of counts only", async ({ page }) => {
  await signInAs(page, "julie.finance");
  await page.goto("/manage/exemple-finance/analytics");
  await expect(page.getByRole("heading", { level: 1, name: "Statistiques" })).toBeVisible();
  const main = page.locator("main");
  const views = main.getByRole("navigation", { name: "Vues des statistiques" });
  for (const name of ["Vue d'ensemble", "Articles", "Événements", "Recrutement", "Équipe"]) {
    await expect(views.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(main.getByText(/Comptes par période calculés/)).toBeVisible();

  await views.getByRole("link", { name: "Événements", exact: true }).click();
  await expect(page).toHaveURL(/vue=evenements/);
  // Attendance is declared, never shown as a number.
  await expect(main.getByText("Présence réelle")).toBeVisible();

  await page.goto("/manage/exemple-finance/analytics?vue=recrutement");
  await expect(main.getByText("Jamais par évaluateur·rice.")).toBeVisible();

  // A malformed range falls back with a reason, never an unbounded query.
  await page.goto("/manage/exemple-finance/analytics?du=2026-12-01&au=2026-01-01");
  await expect(main.getByText(/La date de début est après la date de fin/)).toBeVisible();

  await page.goto("/manage/exemple-finance/analytics");
  const form = main.locator("form").filter({ hasText: "Ouvrir le rapport imprimable" });
  const [download] = await Promise.all([page.waitForEvent("download"), form.getByRole("button", { name: "Télécharger le CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^statistiques-exemple-finance-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync((await download.path())!, "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("Seuil de confidentialité");
  expect(csv).not.toMatch(/@/);

  await form.getByRole("button", { name: "Ouvrir le rapport imprimable" }).click();
  await expect(page).toHaveURL(/\/analytics\/rapport\?/);
  await expect(page.getByText(/Rapport statistique/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer ou enregistrer en PDF" })).toBeVisible();
});

test("communication sees articles and events, no recruitment and no export", async ({ page }) => {
  await signInAs(page, "lucas.finance");
  await page.goto("/manage/exemple-finance/analytics");
  const views = page.getByRole("navigation", { name: "Vues des statistiques" });
  await expect(views.getByRole("link", { name: "Articles", exact: true })).toBeVisible();
  await expect(views.getByRole("link", { name: "Recrutement", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Rapport et export" })).toHaveCount(0);
  // A typed URL to a view without the key shows the first allowed view instead.
  await page.goto("/manage/exemple-finance/analytics?vue=recrutement");
  await expect(page.getByText("Candidatures envoyées")).toHaveCount(0);
  // The report URL gives nothing without the export right.
  await page.goto("/manage/exemple-finance/analytics/rapport?sections=overview");
  await expect(page.getByText("Rapport non disponible")).toBeVisible();
});

test("the BDE reads campus totals, recruitment suppressed, and the export asks for the second factor", async ({ page, baseURL }) => {
  await signInAs(page, "alice.bde");
  await page.goto("/manage/plateforme");
  await page.getByRole("link", { name: "Statistiques", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Statistiques" })).toBeVisible();
  await page.goto("/manage/plateforme/statistiques?vue=recrutement");
  const main = page.locator("main");
  await expect(main.getByText(/jamais un nombre de candidat·es distinct·es sur tout le campus/)).toBeVisible();
  await expect(main.getByRole("heading", { name: "Détails masqués sous le seuil" })).toBeVisible();
  // Without a second factor the database refuses to record the export: no file.
  const refused = await page.request.post("/manage/plateforme/statistiques/export", {
    form: { periode: "30j", sections: "associations" },
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(refused.status()).toBe(403);
  expect(await refused.text()).toMatch(/double authentification/);
});

test("a student and another association's president are refused, and an export must come from the site", async ({ page, baseURL }) => {
  await signInAs(page, "julie.finance");
  const crossSite = await page.request.post("/manage/exemple-finance/analytics/export", { form: { sections: "overview" } });
  expect(crossSite.status()).toBe(403);
  const otherAsso = await page.request.post("/manage/exemple-sports/analytics/export", {
    form: { sections: "overview" },
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(otherAsso.status()).toBe(403);

  await page.context().clearCookies();
  await signInAs(page, "nina");
  await page.goto("/manage/plateforme/statistiques");
  await expect(page.getByText(/réservé/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Statistiques" })).toHaveCount(0);
});
