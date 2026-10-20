import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { fakeStudent, freshTotp, signInWithEmail, solidPng } from "./helpers";

/**
 * Phase 5, brief §79: an association's page from creation to publication,
 * through the interface, on the local stack (fictional accounts only).
 *   Marc (BDE vice-president) creates "Asso e2e (exemple)", names a new
 *   student as its president and makes it active; the president sets the
 *   page up with the wizard, previews it, publishes it; a visitor finds it;
 *   a draft edit stays private until published; the BDE withholds and
 *   releases it; after signing out nothing administrative remains. Then the
 *   critical operations as people without the right: refused.
 * The database tests prove each rule; this proves the screens follow them.
 */

// The seed's LOCAL-ONLY password (supabase/seed.sql): fictional accounts on the CI stack.
const SEED_PASSWORD = "seed-local-password-2026";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";

const NAME = "Asso e2e (exemple)";
const SLUG = "exemple-e2e";
const TAGLINE = "Accroche fictive du test de bout en bout.";
const DESCRIPTION = "Présentation fictive écrite par le test de bout en bout.";
const DESCRIPTION_2 = "Présentation modifiée par le test de bout en bout, puis publiée.";
const NAME_RE = /Asso e2e \(exemple\)/;

test.describe.configure({ mode: "serial" });
test.skip(!process.env.E2E_TEST_ACCOUNT_PASSWORD, "needs the local stack with test-account sign-in (CI e2e job)");

async function signInAs(page: Page, local: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse du compte test").fill(`${local}@comptes.example.test`);
  await page.getByLabel("Mot de passe du compte test").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrer avec le compte test" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Turns on two-factor authentication; the session becomes aal2. */
async function enrollTotp(page: Page) {
  await page.goto("/account/security");
  await page.getByRole("button", { name: "Configurer une application" }).click();
  const secret = (await page.locator("p.select-all").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByLabel("Entre le code à 6 chiffres", { exact: false }).fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Activer" }).click();
  await expect(page.getByText("C'est activé.")).toBeVisible();
}

const image = (name: string, width: number, height: number, rgb: [number, number, number]) => ({
  name,
  mimeType: "image/png",
  buffer: solidPng(width, height, rgb),
});

let contexts: BrowserContext[] = [];
let marc: Page;
let president: Page;
let visitor: Page;

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  return context.newPage();
}

test.beforeAll(async ({ browser }) => {
  marc = await newPage(browser);
  president = await newPage(browser);
  visitor = await newPage(browser);
});

test.afterAll(async () => {
  for (const c of contexts) await c.close();
  contexts = [];
});

test("1–3. the BDE creates an association, names its president, who accepts", async () => {
  // The future president has an account (an appointment names an existing person).
  const email = fakeStudent("presidence");
  await signInWithEmail(president, email);
  await expect(president).toHaveURL(/\/account\/onboarding/);
  await president.getByLabel("Prénom").fill("Camille");
  await president.getByLabel("Nom", { exact: true }).fill("Exemple");
  await president.getByRole("button", { name: "C'est parti" }).click();
  await expect(president).toHaveURL(/\/account$/);

  await signInAs(marc, "marc.bde");
  await enrollTotp(marc);
  await marc.goto("/manage/plateforme/assos");
  await marc.getByText("Nouvelle asso").click();
  await marc.getByLabel("Nom", { exact: true }).fill(NAME);
  await marc.getByLabel("Adresse de la page").fill(SLUG);
  await marc.getByLabel("Catégorie").selectOption("sport");
  await marc.getByRole("button", { name: "Créer l'asso" }).click();
  await expect(marc).toHaveURL(new RegExp(`cree=${SLUG}`));

  const card = marc.locator(`#asso-${SLUG}`);
  await expect(card).toContainText("Page en brouillon");
  const appoint = card.locator("details").filter({ hasText: "Nommer une présidence" });
  await appoint.locator("summary").click();
  await appoint.getByLabel("Adresse e-mail").fill(email);
  await appoint.getByLabel("Raison").fill("Première présidence (test)");
  await appoint.getByRole("button", { name: "Proposer" }).click();
  await expect(card).toContainText("en cours");

  const status = card.locator("details").filter({ hasText: "Changer le statut" });
  await status.locator("summary").click();
  await status.getByRole("button", { name: "Appliquer" }).click();
  await expect(card.getByText("Active", { exact: true })).toBeVisible();

  // The president accepts with a second factor.
  await enrollTotp(president);
  await president.goto("/account/invitations");
  await president.getByRole("article").filter({ hasText: NAME }).getByRole("button", { name: "J'accepte" }).click();
  await expect(president).toHaveURL(/\/account\/invitations\?fait=/);
});

test("4–13. the president sets the page up with the wizard", async () => {
  const p = president;
  await p.goto("/manage");
  await expect(p).toHaveURL(new RegExp(`/manage/${SLUG}$`));
  await p.getByRole("link", { name: "Démarrer la page" }).click();
  await expect(p).toHaveURL(new RegExp(`/manage/${SLUG}/demarrer`));

  // Name and category (chosen by the BDE at creation, kept), and a line.
  await expect(p.getByRole("textbox", { name: "Nom", exact: true })).toHaveValue(NAME);
  await expect(p.getByRole("checkbox", { name: "Sport" })).toBeChecked();
  await p.getByRole("textbox", { name: "Accroche" }).fill(TAGLINE);
  await p.getByRole("button", { name: "Enregistrer et continuer" }).click();
  await expect(p).toHaveURL(/etape=presentation/);

  await p.getByRole("textbox", { name: "Présentation", exact: true }).fill(DESCRIPTION);
  await p.getByRole("button", { name: "Enregistrer et continuer" }).click();
  await expect(p).toHaveURL(/etape=images/);

  // Logo and cover sent from the wizard, then the colour.
  await p.locator('section[aria-labelledby="logo"] input[type="file"]').setInputFiles(image("logo.png", 256, 256, [40, 200, 120]));
  await expect(p.getByText("logo.png est dans la médiathèque.")).toBeVisible();
  await expect(p.locator('input[name="logo_media_id"]:checked:not([value=""])')).toHaveCount(1);
  await p
    .locator('section[aria-labelledby="couverture"] input[type="file"]')
    .setInputFiles(image("couverture.png", 1600, 900, [20, 60, 160]));
  await expect(p.getByText("couverture.png est dans la médiathèque.")).toBeVisible();
  await expect(p.locator('input[name="cover_media_id"]:checked:not([value=""])')).toHaveCount(1);
  await p.getByRole("radio", { name: /Vert désintégration/ }).check({ force: true });
  await p.getByRole("button", { name: "Enregistrer et continuer" }).click();
  await expect(p).toHaveURL(/etape=contact/);

  await p.getByRole("textbox", { name: /Instagram/ }).fill("@asso.e2e");
  await p.getByRole("textbox", { name: /Site web/ }).fill("exemple.test/asso-e2e");
  await p.getByRole("button", { name: "Enregistrer et continuer" }).click();
  await expect(p).toHaveURL(/etape=verifier/);
  await expect(p.getByText("Prête à publier")).toBeVisible();

  // The team shown on the page (presentation only).
  await p.goto(`/manage/${SLUG}/settings/equipe`);
  await p.getByRole("textbox", { name: /Titre affiché/ }).fill("Présidence (test)");
  await p.getByRole("button", { name: "Enregistrer l'équipe présentée" }).click();
  await expect(p.getByText("Présentation de l'équipe enregistrée dans le brouillon.")).toBeVisible();
});

test("14–15. the president previews on desktop and phone, then publishes", async () => {
  const p = president;
  await p.goto(`/associations/${SLUG}/apercu`);
  await expect(p.getByText(/Aperçu · brouillon n°/)).toBeVisible();
  await expect(p.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
  await expect(p.getByText(TAGLINE)).toBeVisible();
  // Draft images come from the private preview route only.
  await expect(p.locator('[data-media-slot="association-cover"] img')).toHaveAttribute("src", /^\/media\/apercu\/associations\//);

  await p.getByRole("link", { name: "Téléphone" }).click();
  await expect(p).toHaveURL(/vue=telephone/);
  await expect(p.frameLocator("iframe").getByRole("heading", { level: 1, name: NAME })).toBeVisible();

  await p.getByRole("link", { name: "Ordinateur" }).click();
  await p.getByRole("button", { name: "Publier la page" }).click();
  await expect(p).toHaveURL(new RegExp(`/associations/${SLUG}\\?publiee=1$`));
  await expect(p.getByText("C'est en ligne", { exact: false })).toBeVisible();
});

test("16–19. a visitor finds the association and reads its page", async () => {
  const v = visitor;
  await v.goto("/associations");
  await expect(v.getByRole("link", { name: NAME_RE })).toBeVisible();
  await v.goto("/associations?categorie=sport");
  await expect(v.getByRole("link", { name: NAME_RE })).toBeVisible();
  await v.goto("/associations?q=e2e");
  await expect(v.getByText("1 asso trouvée", { exact: false })).toBeVisible();

  await v.getByRole("link", { name: NAME_RE }).click();
  await expect(v).toHaveURL(new RegExp(`/associations/${SLUG}$`));
  await expect(v.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
  await expect(v.getByText(TAGLINE)).toBeVisible();
  await expect(v.getByText(DESCRIPTION)).toBeVisible();
  await expect(v.getByRole("link", { name: /instagram\.com\/asso\.e2e/ })).toHaveAttribute("href", "https://www.instagram.com/asso.e2e/");
  await expect(v.getByRole("link", { name: /exemple\.test\/asso-e2e/ })).toHaveAttribute("href", "https://exemple.test/asso-e2e");
  await expect(v.getByRole("link", { name: "Sport", exact: true })).toBeVisible();
  await expect(v.getByText("Présidence (test)")).toBeVisible();
  // Published images are served by the site, never by a storage URL.
  await expect(v.locator('[data-media-slot="association-cover"] img')).toHaveAttribute("src", /url=%2Fmedia%2Fassociations%2F/);
  await expect(v.getByRole("link", { name: "Gérer la page" })).toHaveCount(0);
});

test("20–23. a draft edit stays private until it is published", async () => {
  const p = president;
  await p.goto(`/manage/${SLUG}/settings`);
  const presentation = p.getByRole("form", { name: "Présentation" });
  await presentation.getByRole("textbox", { name: "Présentation", exact: true }).fill(DESCRIPTION_2);
  await presentation.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(presentation.getByText("Brouillon enregistré.", { exact: false })).toBeVisible();

  await visitor.reload();
  await expect(visitor.getByText(DESCRIPTION)).toBeVisible();
  await expect(visitor.getByText(DESCRIPTION_2)).toHaveCount(0);

  await p.goto(`/manage/${SLUG}/settings/publication`);
  await p.getByRole("button", { name: "Publier les changements" }).click();
  await expect(p.getByText("Rien à publier", { exact: false })).toBeVisible();

  await visitor.reload();
  await expect(visitor.getByText(DESCRIPTION_2)).toBeVisible();
});

test("the BDE can withhold and release a page, never edit it", async () => {
  await marc.goto(`/manage/${SLUG}/settings`);
  await expect(marc.getByRole("heading", { name: `Tu ne fais pas partie de l'équipe de ${NAME}.` })).toBeVisible();

  await marc.goto("/manage/plateforme/assos");
  const card = marc.locator(`#asso-${SLUG}`);
  await expect(card).toContainText("Page en ligne");
  const withhold = card.locator("details").filter({ hasText: "Retirer la page du site (modération)" });
  await withhold.locator("summary").click();
  await withhold.getByLabel("Raison").fill("Vérification du contenu (test)");
  await withhold.getByRole("button", { name: "Retirer la page", exact: true }).click();
  await expect(card).toContainText("Page retirée par le BDE");

  await visitor.reload();
  await expect(visitor.getByText("Cette asso n'a pas (ou plus) de page ici.")).toBeVisible();
  await president.goto(`/manage/${SLUG}/settings`);
  await expect(president.getByText("Le BDE a retiré ta page du site")).toBeVisible();
  await expect(president.getByText("Vérification du contenu (test)")).toBeVisible();

  const release = card.locator("details").filter({ hasText: "Rétablir la page" });
  await release.locator("summary").click();
  await release.getByLabel("Raison").fill("Contenu vérifié (test)");
  await release.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(card).toContainText("Page en ligne");
  await visitor.reload();
  await expect(visitor.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
});

test("24–25. after signing out, nothing administrative remains", async () => {
  const p = president;
  await p.goto(`/associations/${SLUG}`);
  await p.getByRole("banner").getByRole("button", { name: /Camille/ }).click();
  await p.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(p.getByRole("banner").getByRole("link", { name: "Se connecter" })).toBeVisible();

  await p.goto(`/manage/${SLUG}/settings`);
  await expect(p.getByRole("heading", { name: `Connecte-toi pour gérer ${NAME}.` })).toBeVisible();
  await p.goto(`/associations/${SLUG}/apercu`);
  await expect(p).toHaveURL(/\/login/);
  const upload = await p.request.post(`/manage/${SLUG}/media/upload`, {
    headers: { origin: BASE },
    multipart: { file: image("x.png", 64, 64, [1, 2, 3]), kind: "image" },
  });
  expect(upload.status()).toBe(401);
});

test("the same operations fail for people without the right", async ({ browser }) => {
  // A student outside the association.
  const nina = await newPage(browser);
  await signInAs(nina, "nina");
  await nina.goto(`/manage/${SLUG}/settings`);
  await expect(nina.getByRole("heading", { name: `Tu ne fais pas partie de l'équipe de ${NAME}.` })).toBeVisible();
  await nina.goto(`/associations/${SLUG}/apercu`);
  await expect(nina.getByText("Aperçu réservé à l'équipe de la page")).toBeVisible();
  const upload = await nina.request.post(`/manage/${SLUG}/media/upload`, {
    headers: { origin: BASE },
    multipart: { file: image("x.png", 64, 64, [1, 2, 3]), kind: "image" },
  });
  expect(upload.status()).toBe(403);

  // A member whose position manages images but not the page.
  const lucas = await newPage(browser);
  await signInAs(lucas, "lucas.finance");
  await lucas.goto("/manage/exemple-finance/settings");
  await expect(lucas.getByRole("heading", { name: "Accès non disponible" })).toBeVisible();
  await lucas.goto("/manage/exemple-finance/settings/publication");
  await expect(lucas.getByRole("heading", { name: "Accès non disponible" })).toBeVisible();
  await lucas.goto("/manage/exemple-finance/media");
  await expect(lucas.getByRole("heading", { level: 1, name: "Médias" })).toBeVisible();

  // A request sent from another site is refused even with a valid session.
  const forged = await lucas.request.post("/manage/exemple-finance/media/upload", {
    headers: { origin: "https://autre-site.example" },
    multipart: { file: image("x.png", 64, 64, [1, 2, 3]), kind: "image" },
  });
  expect(forged.status()).toBe(403);
});
