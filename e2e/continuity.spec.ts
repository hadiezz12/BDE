import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 11 — continuity on the local stack: the BDE's continuity pages
 * (governance health, the academic year, operations, the register,
 * retention, the handover report), an association's handover checklist, the
 * guardian's narrower view, the doors that stay closed, and the public
 * health check. Fictional seed accounts only (supabase/seed.sql); nothing
 * here needs a second factor, so the actions that do are shown as such.
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

test("the BDE reads the site's continuity: governance, the year, operations, the register, retention, the report", async ({ page }) => {
  await signInAs(page, "alice.bde");
  await page.goto("/manage/plateforme");
  await page.getByRole("link", { name: "Continuité", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Continuité" })).toBeVisible();
  const main = page.locator("main");
  await expect(main.getByText("Points à régler")).toBeVisible();
  await expect(main.getByText("Vice-présidence du BDE").first()).toBeVisible();

  await page.goto("/manage/plateforme/continuite/annee");
  await expect(page.getByRole("heading", { level: 1, name: "Année universitaire" })).toBeVisible();
  await expect(main.getByText("En cours", { exact: true }).first()).toBeVisible();

  await page.goto("/manage/plateforme/continuite/operations");
  await expect(main.getByText("Vérification de la continuité").first()).toBeVisible();
  await expect(main.getByText("Contrôle de sécurité")).toBeVisible();
  // Without the second factor: the jobs are visible, the retry is not offered.
  await expect(main.getByRole("button", { name: "Relancer" })).toHaveCount(0);

  await page.goto("/manage/plateforme/continuite/registre");
  await expect(main.getByText("Registre des comptes techniques")).toBeVisible();
  await expect(main.getByText("Nom de domaine")).toBeVisible();

  await page.goto("/manage/plateforme/continuite/conservation");
  await expect(main.getByText(/pas encore décidée/)).toBeVisible();

  await page.goto("/manage/plateforme/continuite/passation");
  await expect(main.getByText("Direction du BDE")).toBeVisible();
  await expect(main.getByText("Santé du site")).toBeVisible();
});

test("an association president ticks the handover checklist, and the control centre stays closed", async ({ page }) => {
  await signInAs(page, "julie.finance");
  await page.goto("/manage/exemple-finance/continuite");
  await expect(page.getByRole("heading", { level: 1, name: "Passation" })).toBeVisible();
  const item = page.locator("li").filter({ hasText: "Aucun mot de passe partagé" }).first();
  await item.locator("summary", { hasText: "Mettre à jour" }).click();
  const box = item.getByLabel("C'est fait");
  if (!(await box.isChecked())) await box.check();
  await item.getByRole("button", { name: "Enregistrer" }).click();
  await expect(item.getByText("Liste de passation mise à jour.")).toBeVisible();

  await page.goto("/manage/plateforme/continuite");
  await expect(page.getByText(/réservé/i).first()).toBeVisible();
  await expect(page.getByText("Points à régler")).toHaveCount(0);
});

test("the guardian sees BDE availability only, and a student sees no handover", async ({ page }) => {
  await signInAs(page, "garance.garante");
  await page.goto("/manage/continuite");
  await expect(page.getByText("Points de continuité")).toBeVisible();
  await page.goto("/manage/plateforme/continuite/operations");
  await expect(page.getByText("Contrôle de sécurité")).toHaveCount(0);

  await page.context().clearCookies();
  await signInAs(page, "nina");
  await page.goto("/manage/exemple-finance/continuite");
  await expect(page.getByText("Liste de passation")).toHaveCount(0);
});

test("the public health check says three things and nothing else", async ({ request }) => {
  const response = await request.get("/api/health");
  expect([200, 503]).toContain(response.status());
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["auth", "checked_at", "database", "jobs", "status"]);
  expect(body.database).toBe(true);
});
