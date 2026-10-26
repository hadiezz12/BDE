import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { freshTotp } from "./helpers";

/**
 * Phase 8, brief §110–111: a recruitment campaign from creation to
 * cancellation, through the interface, on the local stack (fictional
 * accounts only).
 *   Paul (Sports president since governance.spec handed it over) builds
 *   "Recrutement e2e (exemple)" with the wizard (a position, a question and
 *   an optional document, dates), previews its form and publishes it.
 *   Visitors find it in the directory. Hugo applies with a PDF, reviews,
 *   acknowledges the privacy information and sends it; he downloads his own
 *   file; Léa can neither open his application nor his file. Paul's desk
 *   counts one application and shows none of it. Paul pauses the campaign
 *   (the page says so), then cancels it with a reason: Hugo is told, his
 *   application is kept, and he can still withdraw it.
 * The database tests prove each rule, the deadlines and the races; this
 * proves the screens follow them.
 *
 * File order matters (one worker, alphabetical): governance.spec makes Paul
 * the Sports president without a second factor; Paul turns it on here and
 * removes it at the end, for registrations.spec, which signs him in again.
 */

// The seed's LOCAL-ONLY password (supabase/seed.sql): fictional accounts on the CI stack.
const SEED_PASSWORD = "seed-local-password-2026";

const ASSO = "exemple-sports";
const TITLE = "Recrutement e2e (exemple)";
const POSITION = "Arbitre (exemple e2e)";
const QUESTION = "Pourquoi arbitrer ? (question fictive e2e)";
const ANSWER = "Réponse fictive écrite par le test de bout en bout.";
const REASON = "Annulation fictive décidée par le test de bout en bout.";

test.describe.configure({ mode: "serial" });
test.skip(!process.env.E2E_TEST_ACCOUNT_PASSWORD, "needs the local stack with test-account sign-in (CI e2e job)");

/** "2026-11-02": a Paris day `days` from now. */
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
let campaignId = "";
let campaignPath = "";
let applicationPath = "";
let documentPath = "";
let totpOn = false;

async function personIn(browser: Browser, local: string | null): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  if (local) await signInAs(page, local);
  return page;
}

test.afterAll(async () => {
  // Leave Paul's account as found, even after a failure: registrations.spec signs him in
  // with the seed password alone.
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

test("§110 Paul builds a campaign with the wizard and publishes it", async ({ browser }) => {
  paul = await personIn(browser, "paul.sports");

  // Publishing needs the second factor.
  await paul.goto("/account/security");
  await paul.getByRole("button", { name: "Configurer une application" }).click();
  const secret = (await paul.locator("p.select-all").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await paul.getByLabel("Entre le code à 6 chiffres", { exact: false }).fill(await freshTotp(secret));
  await paul.getByRole("button", { name: "Activer" }).click();
  await expect(paul.getByText("C'est activé.")).toBeVisible();
  totpOn = true;

  await paul.goto(`/manage/${ASSO}/recruitment`);
  await expect(paul.getByRole("heading", { name: "Recrutement", exact: true })).toBeVisible();
  await expect(paul.getByText("Qui lit les candidatures")).toBeVisible();
  await paul.goto(`/manage/${ASSO}/recruitment/new`);
  await paul.getByLabel("Titre").fill(TITLE);
  await paul.getByRole("button", { name: "Ouvrir le brouillon" }).click();
  await expect(paul).toHaveURL(/etape=infos/);
  campaignId = paul.url().match(/recruitment\/([0-9a-f-]{36})/)![1];

  await paul.getByLabel("En une phrase").fill("Un recrutement fictif pour tester les candidatures de bout en bout.");
  await paul.getByRole("button", { name: "Enregistrer et passer au déroulé" }).click();
  await expect(paul).toHaveURL(/etape=deroule/);
  await paul.getByRole("button", { name: "Enregistrer et passer aux postes" }).click();
  await expect(paul).toHaveURL(/etape=postes/);

  await paul.getByLabel("Nouveau poste").fill(POSITION);
  await paul.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(paul).toHaveURL(/poste-ajoute/);
  const card = paul.locator("article", { hasText: POSITION }).first();
  await card.getByLabel("En une phrase").fill("Arbitrer les matchs fictifs.");
  await card.getByLabel("Les missions").fill("- Arbitrer (exemple)\n- Tenir la feuille de match (exemple)");
  await card.getByRole("button", { name: "Enregistrer le poste" }).click();
  await expect(card.getByText("Poste enregistré.")).toBeVisible();

  // The form: a long answer, then an optional document.
  await paul.goto(`/manage/${ASSO}/recruitment/${campaignId}?etape=formulaire`);
  await expect(paul.getByText("Ne demande que ce qui sert à choisir.")).toBeVisible();
  await paul.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await paul.getByLabel("Question", { exact: true }).first().fill(QUESTION);
  await paul.locator("select").filter({ hasText: "Réponse courte" }).first().selectOption("file");
  await paul.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await paul.getByLabel("Question", { exact: true }).nth(1).fill("Un document si tu veux (exemple)");
  await paul.getByRole("button", { name: "Enregistrer le formulaire" }).click();
  await expect(paul.getByText("Formulaire enregistré.")).toBeVisible();

  await paul.goto(`/manage/${ASSO}/recruitment/${campaignId}?etape=regles`);
  await paul.locator('input[name="opens_date"]').fill(parisDay(0));
  await paul.locator('input[name="opens_time"]').fill("00:00");
  await paul.locator('input[name="closes_date"]').fill(parisDay(7));
  await paul.locator('input[name="closes_time"]').fill("23:59");
  await paul.getByRole("button", { name: "Enregistrer et voir l'aperçu" }).click();
  await expect(paul).toHaveURL(/etape=apercu/);

  // The team's preview of the form: usable, nothing saved.
  await paul.goto(`/recruitment/apercu/${campaignId}`);
  await paul.getByRole("link", { name: `Formulaire · ${POSITION}` }).click();
  await expect(paul.getByRole("heading", { name: "Ta candidature" })).toBeVisible();
  await paul.getByRole("button", { name: /Vérifier comme avant l'envoi/ }).click();
  await expect(paul.getByText(/bloqueraient l'envoi/)).toBeVisible();

  await paul.goto(`/manage/${ASSO}/recruitment/${campaignId}?etape=publication`);
  await paul.getByRole("button", { name: "Publier le recrutement" }).click();
  await expect(paul.getByText(/C'est en ligne/)).toBeVisible();
});

test("§110 visitors find it; signing in is needed to apply", async ({ browser }) => {
  const visitor = await personIn(browser, null);
  await visitor.goto("/recruitment");
  await visitor.getByRole("link", { name: TITLE }).first().click();
  await expect(visitor).toHaveURL(/\/recruitment\/[a-z0-9-]+$/);
  campaignPath = new URL(visitor.url()).pathname;
  await expect(visitor.getByRole("heading", { name: POSITION })).toBeVisible();
  await expect(visitor.getByText("Arbitrer (exemple)")).toBeVisible();
  await visitor.getByRole("button", { name: "Candidater à ce poste" }).click();
  await expect(visitor).toHaveURL(/\/login\?next=/);
});

test("§111 Hugo applies with a document, reviews and sends", async ({ browser }) => {
  const hugo = await personIn(browser, "hugo.finance");
  await hugo.goto(campaignPath);
  await hugo.getByRole("button", { name: "Candidater à ce poste" }).click();
  await expect(hugo).toHaveURL(/\/account\/applications\/[0-9a-f-]{36}$/);
  applicationPath = new URL(hugo.url()).pathname;

  await hugo.getByLabel(QUESTION).fill(ANSWER);
  await hugo.locator('input[type="file"]').first().setInputFiles({
    name: "piece-exemple.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
  });
  await expect(hugo.getByRole("link", { name: /piece-exemple\.pdf/ })).toBeVisible();

  await hugo.getByRole("button", { name: "Relire", exact: true }).click();
  await expect(hugo.getByText("Avec tes réponses, l'association recevra")).toBeVisible();
  await expect(hugo.getByText(ANSWER)).toBeVisible();
  const send = hugo.getByRole("button", { name: "Envoyer ma candidature" });
  await expect(send).toBeDisabled();
  await hugo.getByLabel(/J'ai lu comment mes données sont utilisées/).check();
  await send.click();
  await expect(hugo).toHaveURL(/fait=envoyee/);
  await expect(hugo.getByText("Ce que tu as envoyé")).toBeVisible();
  await expect(hugo.getByText(ANSWER)).toBeVisible();

  const link = hugo.getByRole("link", { name: /piece-exemple\.pdf/ });
  documentPath = (await link.getAttribute("href")) ?? "";
  const own = await hugo.request.get(documentPath);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-disposition"]).toContain("attachment");
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");

  await hugo.goto("/account/applications");
  await expect(hugo.getByRole("link", { name: POSITION })).toBeVisible();
  await hugo.goto("/account/notifications");
  await expect(hugo.getByText(`Candidature envoyée : ${POSITION}`)).toBeVisible();
});

test("§114 another student reads neither the application nor its file; the team sees a count", async ({ browser }) => {
  const lea = await personIn(browser, "lea");
  await lea.goto(applicationPath);
  await expect(lea.getByText("Cette candidature n'est pas dans ton espace.")).toBeVisible();
  expect((await lea.request.get(documentPath)).status()).toBe(404);

  await paul.goto(`/manage/${ASSO}/recruitment`);
  const row = paul.locator("li", { hasText: TITLE });
  await expect(row.getByText("Candidatures envoyées")).toBeVisible();
  await expect(row).toContainText("1");
  await expect(paul.getByText(ANSWER)).toHaveCount(0);
  expect((await paul.request.get(documentPath)).status()).toBe(404);
});

test("§113 pause, cancellation and withdrawal follow the campaign's state", async ({ browser }) => {
  await paul.goto(`/manage/${ASSO}/recruitment/${campaignId}?etape=publication`);
  await paul.getByRole("button", { name: "Mettre en pause" }).click();
  await expect(paul.getByText(/En pause : personne ne peut commencer/)).toBeVisible();

  const visitor = await personIn(browser, null);
  await visitor.goto(campaignPath);
  await expect(visitor.getByText(/a mis ce recrutement en pause/).filter({ visible: true }).first()).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Candidater à ce poste" })).toHaveCount(0);

  await paul.getByText("Annuler le recrutement", { exact: true }).first().click();
  await paul.getByLabel("Raison, lue par les candidat·es").fill(REASON);
  await paul.locator("form").getByRole("button", { name: "Annuler le recrutement" }).click();
  await expect(paul.getByText(/Recrutement annulé\./)).toBeVisible();

  await visitor.goto(campaignPath);
  await expect(visitor.getByText(REASON).filter({ visible: true }).first()).toBeVisible();

  // Hugo's sent application is kept, he is told, and he may still withdraw it.
  const hugo = await personIn(browser, "hugo.finance");
  await hugo.goto("/account/notifications");
  await expect(hugo.getByText(/Recrutement annulé/)).toBeVisible();
  await hugo.goto(applicationPath);
  await expect(hugo.getByText(ANSWER)).toBeVisible();
  await hugo.getByRole("button", { name: "Retirer ma candidature" }).click();
  await hugo.getByRole("button", { name: "Oui, retirer" }).click();
  await expect(hugo).toHaveURL(/fait=retiree/);
  await expect(hugo.getByText("Candidature retirée. Elle reste lisible ici.")).toBeVisible();
});
