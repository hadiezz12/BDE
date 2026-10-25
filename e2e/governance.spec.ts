import { expect, test, type Browser, type Page } from "@playwright/test";
import { freshTotp } from "./helpers";

/**
 * Phase 4 through the interface, on the fictional governance world of
 * supabase/seed.sql (local stack only, AUTH_TEST_ACCOUNTS=on):
 *   Alice/Marc lead the BDE, Garance is the guardian, Julie presides
 *   "Finance (exemple)" where Lucas holds Communication + Événements and
 *   borrows members.invite from Julie, Nina is invited to Finance, Emma
 *   presides "Sports (exemple)" and proposed Paul as her successor.
 * The database tests prove the rules; these prove that the screens follow
 * them and say so in words. Tests run in order and share the seed's state.
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

async function personIn(browser: Browser, local: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signInAs(page, local);
  return page;
}

const sections = (page: Page) => page.getByRole("navigation", { name: "Sections de gestion" });

test("navigation follows each person's rights, and other associations stay closed", async ({ page }) => {
  await signInAs(page, "lucas.finance");

  // One association: /manage goes straight to it.
  await page.goto("/manage");
  await expect(page).toHaveURL(/\/manage\/exemple-finance$/);
  await expect(page.getByRole("heading", { level: 1, name: "Finance (exemple)" })).toBeVisible();
  await expect(page.getByText("Tes postes ici : Communication, Événements.")).toBeVisible();

  // Communication + Événements + a borrowed invite right: team, content, events, media. No roles, no governance.
  const nav = sections(page);
  await expect(nav.getByRole("link", { name: "Équipe" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Contenus/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Événements/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Postes et droits" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Gouvernance" })).toHaveCount(0);

  // A typed URL to a section the rights do not open: refused in words.
  await page.goto("/manage/exemple-finance/governance");
  await expect(page.getByRole("heading", { name: "Accès non disponible" })).toBeVisible();

  // Another association, and the BDE control center: closed.
  await page.goto("/manage/exemple-sports");
  await expect(page.getByRole("heading", { name: "Tu ne fais pas partie de l'équipe de Sports (exemple)." })).toBeVisible();
  await page.goto("/manage/plateforme");
  await expect(page.getByText("Le centre de contrôle est réservé à la présidence et à la vice-présidence du BDE.")).toBeVisible();
});

test("the BDE sees the platform, its own leadership and the passation waiting for the vice-president", async ({ page }) => {
  await signInAs(page, "alice.bde");
  await page.goto("/manage");
  await expect(page.getByRole("main").getByRole("link", { name: "Centre de contrôle BDE" })).toBeVisible();

  await page.goto("/manage/plateforme");
  await expect(page.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeVisible();
  // "Arts (exemple)" is still being set up, with no president.
  await expect(page.getByText("Arts (exemple)")).toBeVisible();

  await page.goto("/manage/very-pink-club/governance");
  await expect(page.getByText("Passation du BDE", { exact: true })).toBeVisible();
  await expect(page.getByText("Approbation · Présidence du BDE")).toBeVisible();
  await expect(page.getByText("Approbation · Vice-présidence du BDE")).toBeVisible();
});

test("an invitation is accepted from the account and opens the workspace", async ({ page }) => {
  await signInAs(page, "nina");
  await page.goto("/manage");
  await expect(page.getByRole("heading", { name: "Tu ne fais partie d'aucune équipe d'asso pour l'instant." })).toBeVisible();

  await page.goto("/account/invitations");
  const invitation = page.getByRole("article").filter({ hasText: "Finance (exemple)" });
  await expect(invitation).toContainText("Poste proposé : Communication");
  await invitation.getByRole("button", { name: "Accepter" }).click();

  await expect(page).toHaveURL(/\/manage\/exemple-finance$/);
  await expect(page.getByText("Ton poste ici : Communication.")).toBeVisible();
});

test("a revoked delegation stops working at once, without signing out", async ({ page, browser }) => {
  // Lucas opens the invite form with the right Julie lent him…
  await signInAs(page, "lucas.finance");
  await page.goto("/manage/exemple-finance/team");
  await page.getByText("Nouvelle invitation").click();
  await page.getByLabel("Adresse e-mail").fill("recrue@student.example.test");

  // …Julie ends the delegation from her own session…
  const julie = await personIn(browser, "julie.finance");
  await julie.goto("/manage/exemple-finance/team");
  const delegation = julie.getByRole("listitem").filter({ hasText: "Lucas" }).filter({ hasText: "Inviter des membres" });
  await delegation.getByRole("button", { name: "Arrêter" }).click();
  await expect(delegation).toHaveCount(0);

  // …and Lucas's already-open form is refused by the database, in words.
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByText("Ton poste ne te permet pas de faire ça (ou plus).")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Nouvelle invitation")).toHaveCount(0);
  await julie.context().close();
});

test("a presidency changes hands only with the successor's second factor", async ({ page, browser }) => {
  await signInAs(page, "paul.sports");
  await page.goto("/account/invitations");
  const candidacy = page.getByRole("article").filter({ hasText: "Sports (exemple)" });
  await expect(candidacy).toContainText("Présidence · Sports (exemple)");

  // Without a second factor the database refuses, and the page says why.
  await candidacy.getByRole("button", { name: "J'accepte" }).click();
  await expect(candidacy.getByRole("alert")).toContainText("double authentification");

  // Turn it on (this session becomes aal2), then accept.
  await page.goto("/account/security");
  await page.getByRole("button", { name: "Configurer une application" }).click();
  const secret = (await page.locator("p.select-all").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByLabel("Entre le code à 6 chiffres", { exact: false }).fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Activer" }).click();
  await expect(page.getByText("C'est activé.")).toBeVisible();

  await page.goto("/account/invitations");
  await page.getByRole("article").filter({ hasText: "Sports (exemple)" }).getByRole("button", { name: "J'accepte" }).click();
  await expect(page).toHaveURL(/\/account\/invitations\?fait=passation-validee$/);
  await expect(page.getByText("C'est fait : la passation est validée.", { exact: false })).toBeVisible();

  // Paul now leads Sports; Emma keeps her membership, without the presidency's rights.
  await page.goto("/manage/exemple-sports/governance");
  await expect(page.getByText(/Paul Exemple\s*\(toi\)/).first()).toBeVisible();

  const emma = await personIn(browser, "emma.sports");
  await emma.goto("/manage/exemple-sports");
  await expect(emma.getByText("Tu fais partie de l'asso, sans poste de gestion pour l'instant.", { exact: false })).toBeVisible();
  await expect(sections(emma).getByRole("link", { name: "Gouvernance" })).toHaveCount(0);
  await emma.context().close();

  // Leave Paul's account as found (his aal2 session may remove the factor): later specs
  // (registrations.spec.ts) sign him in with the seed password and turn it on themselves.
  await page.goto("/account/security");
  await page.getByRole("button", { name: "Retirer la double authentification" }).click();
  await expect(page.getByText("Désactivée", { exact: true })).toBeVisible();
});
