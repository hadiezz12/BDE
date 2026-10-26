import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { freshTotp } from "./helpers";

/**
 * Phase 9, brief §117–122: an application from review to an accepted offer,
 * through the interface, on the local stack (fictional accounts only).
 *   Paul (Sports president since governance.spec) opens the seeded
 *   "Recrutement 2027 (exemple)" of Sports from his desk, publishes a grid,
 *   evaluates Nina's application, proposes an offer, validates it (one
 *   approval: the campaign's default) and announces it. Nina, who saw only
 *   "envoyée" until then, reads the offer and accepts it. Hugo, a member of
 *   another association, opens none of it; the CSV export is formula-safe
 *   and only leaves from the site itself.
 * The database tests prove each rule, scope and race; this proves the
 * screens follow them.
 *
 * File order matters (one worker, alphabetical): Paul turns the second
 * factor on here and off at the end, as recruitment.spec does.
 */

// The seed's LOCAL-ONLY password (supabase/seed.sql): fictional accounts on the CI stack.
const SEED_PASSWORD = "seed-local-password-2026";
const ASSO = "exemple-sports";
const CAMPAIGN = "Recrutement 2027 (exemple)";

test.describe.configure({ mode: "serial" });
test.skip(!process.env.E2E_TEST_ACCOUNT_PASSWORD, "needs the local stack with test-account sign-in (CI e2e job)");

function parisDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(Date.now() + days * 86_400_000));
}

async function signInAs(page: Page, local: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse du compte test").fill(`${local}@comptes.example.test`);
  await page.getByLabel("Mot de passe du compte test").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrer avec le compte test" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

let contexts: BrowserContext[] = [];
let paul: Page;
let totpOn = false;
let base = "";
let applicationPath = "";

async function personIn(browser: Browser, local: string): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await signInAs(page, local);
  return page;
}

test.afterAll(async () => {
  if (paul && totpOn) {
    await paul.goto("/account/security");
    const remove = paul.getByRole("button", { name: "Retirer la double authentification" });
    if (await remove.isVisible().catch(() => false)) {
      await remove.click();
      await expect(paul.getByText("Désactivée", { exact: true })).toBeVisible();
    }
  }
  for (const c of contexts) await c.close();
  contexts = [];
});

test("§117 Paul finds the campaign's applications from his desk and publishes a grid", async ({ browser }) => {
  paul = await personIn(browser, "paul.sports");
  // Validating and announcing need the second factor.
  await paul.goto("/account/security");
  await paul.getByRole("button", { name: "Configurer une application" }).click();
  const secret = (await paul.locator("p.select-all").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await paul.getByLabel("Entre le code à 6 chiffres", { exact: false }).fill(await freshTotp(secret));
  await paul.getByRole("button", { name: "Activer" }).click();
  await expect(paul.getByText("C'est activé.")).toBeVisible();
  totpOn = true;

  await paul.goto(`/manage/${ASSO}/recruitment`);
  await expect(paul.getByText("Qui lit les candidatures")).toBeVisible();
  const row = paul.locator("li", { hasText: CAMPAIGN }).first();
  await row.getByRole("link", { name: /Candidatures|à évaluer/ }).click();
  await expect(paul).toHaveURL(/\/recruitment\/[0-9a-f-]{36}\/candidatures$/);
  base = new URL(paul.url()).pathname.replace(/\/candidatures$/, "");

  // A sent application is listed; a withdrawn one says so and offers nothing.
  await expect(paul.getByText("Retirée par la personne")).toBeVisible();

  await paul.goto(`${base}/comite`);
  await paul.locator("summary", { hasText: "Créer la grille" }).first().click();
  await paul.getByRole("button", { name: "Enregistrer le brouillon de la grille" }).first().click();
  await expect(paul.getByText("Brouillon de la grille enregistré.")).toBeVisible();
  await paul.goto(`${base}/comite`);
  await paul.getByRole("button", { name: "Publier cette version" }).first().click();
  await expect(paul.getByText(/Version 1, publiée le/).first()).toBeVisible();
});

test("§118 Paul evaluates Nina's application against the grid", async () => {
  await paul.goto(`${base}/candidatures?etape=new`);
  await paul.locator("tbody th a").first().click();
  await expect(paul).toHaveURL(/\/candidatures\/[0-9a-f-]{36}$/);
  applicationPath = new URL(paul.url()).pathname;
  await expect(paul.getByText("Candidature fictive de Nina.")).toBeVisible();
  await expect(paul.getByText("Formulaire version 1, tel que rempli")).toBeVisible();

  for (const c of ["Motivation", "Expérience utile pour le poste", "Disponibilité"]) {
    await paul.locator("fieldset", { hasText: c }).first().locator("label", { hasText: /^4$/ }).click();
  }
  await expect(paul.getByText(/points pondérés sur/)).toBeVisible();
  await paul.getByLabel("Ton avis").selectOption("offer");
  await paul.getByLabel("Commentaire").fill("Commentaire fictif du test de bout en bout.");
  await paul.getByRole("button", { name: "Soumettre l'évaluation" }).click();
  await expect(paul.getByRole("heading", { name: "Ton évaluation" })).toBeVisible();
  await expect(paul.getByText(/soumise /).first()).toBeVisible();
});

test("§119–121 an offer is proposed, validated and announced; Nina accepts it", async ({ browser }) => {
  // Before any announcement, Nina is told the application is being examined, nothing more.
  const nina = await personIn(browser, "nina");
  await nina.goto("/account/applications");
  await expect(nina.getByText("En cours d'examen").first()).toBeVisible();

  await paul.goto(applicationPath);
  await paul.getByLabel("Décision proposée").selectOption("offer");
  await paul.getByRole("button", { name: "Proposer la décision" }).click();
  await expect(paul.getByText("Proposée, à valider")).toBeVisible();
  await paul.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(paul.getByText("Validée, pas encore annoncée")).toBeVisible();

  // Validated is still internal.
  await nina.goto("/account/applications");
  await expect(nina.getByText("Proposition reçue")).toHaveCount(0);

  await paul.locator('input[name="expires_date"]').fill(parisDay(5));
  await paul.getByRole("button", { name: /^Annoncer/ }).click();
  await expect(paul.getByText("Proposition : En attente de réponse")).toBeVisible();

  await nina.goto("/account/applications");
  await expect(nina.getByText("Proposition reçue").first()).toBeVisible();
  await nina.getByRole("link", { name: "Événements (exemple)" }).first().click();
  await nina.getByRole("button", { name: "J'accepte" }).click();
  await expect(nina.getByText("Proposition acceptée").first()).toBeVisible();
  await expect(nina.getByText(/Commentaire fictif|points pondérés/)).toHaveCount(0);

  await paul.goto(applicationPath);
  await expect(paul.getByText("Proposition : Acceptée par la personne")).toBeVisible();
});

test("§114/§123 another association's member opens nothing; the export is safe and same-site only", async ({ browser }) => {
  const hugo = await personIn(browser, "hugo.finance");
  await hugo.goto(applicationPath);
  await expect(hugo.getByText(/ne fais pas partie de l'équipe/)).toBeVisible();
  await expect(hugo.getByText("Candidature fictive de Nina.")).toHaveCount(0);

  const origin = new URL(paul.url()).origin;
  const csv = await paul.request.post(`${base}/export`, { headers: { origin } });
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toContain("attachment");
  const body = await csv.text();
  expect(body.split("\r\n")[0]).toContain("Référence");
  expect(body).not.toMatch(/Candidature fictive de Nina|Commentaire fictif/);
  const elsewhere = await paul.request.post(`${base}/export`, { headers: { origin: "https://elsewhere.example.test" } });
  expect(elsewhere.status()).toBe(403);
});
