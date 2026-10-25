import { readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { freshTotp, solidPng } from "./helpers";

/**
 * Phase 7, brief §100–103: an event from creation to cancellation, through
 * the interface, on the local stack (fictional accounts only).
 *   Paul (Sports president since governance.spec handed it over) creates
 *   "Match de démonstration (exemple e2e)"
 *   with the wizard (cover, campus, two seats, a waiting list, a deadline),
 *   previews and publishes it; visitors find it in the agenda, the calendar
 *   and on the Sports page. Nina and Tom take the two seats, Léa and Hugo
 *   join the waiting list; Nina cancels and Léa is promoted (and told), Hugo
 *   moves up. Paul reads the participants and exports them; a Finance member
 *   reads nothing. Paul cancels: the page says so with the reason, and the
 *   students' spaces follow.
 * The database tests prove each rule and the race for the last seat; this
 * proves the screens follow them.
 *
 * File order matters (one worker, alphabetical): governance.spec makes Paul
 * the Sports president (and removes the second factor it turned on); Paul
 * turns it on again here, after every spec that signs him in without it.
 */

// The seed's LOCAL-ONLY password (supabase/seed.sql): fictional accounts on the CI stack.
const SEED_PASSWORD = "seed-local-password-2026";

const ASSO = "exemple-sports";
const TITLE = "Match de démonstration (exemple e2e)";
const SUMMARY = "Un match fictif pour tester les inscriptions de bout en bout.";
const VENUE = "Gymnase fictif (exemple)";
const ACCESS = "Vestiaire B, code fictif 0000";
const REASON = "Annulation fictive décidée par le test de bout en bout.";

test.describe.configure({ mode: "serial" });
test.skip(!process.env.E2E_TEST_ACCOUNT_PASSWORD, "needs the local stack with test-account sign-in (CI e2e job)");

/** "2026-11-02": a Paris day `days` from now. */
function parisDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(Date.now() + days * 86_400_000));
}
const DAY = parisDay(7);

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

let contexts: BrowserContext[] = [];
let paul: Page;
let eventPath = "";
let editorPath = "";

async function personIn(browser: Browser, local: string | null): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  if (local) await signInAs(page, local);
  return page;
}

test.afterAll(async () => {
  for (const c of contexts) await c.close();
  contexts = [];
});

const panel = (page: Page) => page.locator("section[aria-labelledby='inscription']");

async function register(page: Page, expected: RegExp) {
  await page.goto(eventPath);
  await panel(page).getByRole("button", { name: /^(S'inscrire|Rejoindre la liste d'attente)$/ }).click();
  await expect(panel(page).getByText(expected)).toBeVisible();
}

test("§100 the Sports president creates, previews and publishes an event", async ({ browser }) => {
  paul = await personIn(browser, "paul.sports");
  await enrollTotp(paul);

  await paul.goto(`/manage/${ASSO}/events`);
  await paul.getByRole("link", { name: "Nouvel événement" }).first().click();
  await paul.locator('input[name="title"]').fill(TITLE);
  await paul.getByRole("button", { name: "Ouvrir le brouillon" }).click();
  await expect(paul).toHaveURL(/etape=infos/);
  editorPath = new URL(paul.url()).pathname;

  await paul.locator('textarea[name="summary"]').fill(SUMMARY);
  await paul.locator('textarea[name="description"]').fill("Premier paragraphe fictif.\n\nSecond paragraphe fictif.");
  await paul.locator('select[name="category_id"]').selectOption({ label: "Sport" });
  await paul.getByRole("button", { name: "Enregistrer et passer au lieu" }).click();
  await expect(paul).toHaveURL(/etape=lieu/);

  await paul.locator('input[name="starts_date"]').fill(DAY);
  await paul.locator('input[name="starts_time"]').fill("18:00");
  await paul.locator('input[name="ends_date"]').fill(DAY);
  await paul.locator('input[name="ends_time"]').fill("20:00");
  await paul.getByText("Sur le campus", { exact: true }).click();
  await paul.locator('input[name="venue_name"]').fill(VENUE);
  await paul.getByRole("button", { name: "Enregistrer et passer au visuel" }).click();
  await expect(paul).toHaveURL(/etape=visuels/);

  await paul.getByLabel("Description de l'image").fill("Aplat vert fictif envoyé par le test");
  await paul
    .locator('input[type="file"]')
    .setInputFiles({ name: "match.png", mimeType: "image/png", buffer: solidPng(1600, 1000, [30, 150, 90]) });
  await expect(paul.getByRole("img", { name: "Aplat vert fictif envoyé par le test" })).toBeVisible();
  await paul.getByRole("button", { name: "Enregistrer et passer aux inscriptions" }).click();
  await expect(paul).toHaveURL(/etape=inscriptions/);

  await paul.getByText("Inscription ici", { exact: true }).click();
  await paul.getByText("Un nombre de places", { exact: true }).click();
  await paul.locator('input[name="capacity"]').fill("2");
  await paul.locator('input[name="waitlist_enabled"]').check();
  await paul.locator('input[name="closes_date"]').fill(DAY);
  await paul.locator('input[name="closes_time"]').fill("12:00");
  await paul.locator('select[name="cancellation_cutoff_minutes"]').selectOption("0");
  await paul.locator('textarea[name="access_details"]').fill(ACCESS);
  await paul.getByRole("button", { name: "Enregistrer et voir l'aperçu" }).click();
  await expect(paul).toHaveURL(/etape=apercu/);

  // The preview: the public layout, for the team only, never indexed.
  const preview = await paul.context().newPage();
  await preview.goto(`/events/apercu/${editorPath.split("/").pop()}`);
  await expect(preview.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(preview.getByText(ACCESS)).toHaveCount(0);
  await preview.close();

  await paul.getByRole("link", { name: "Passer à la publication" }).click();
  await paul.getByRole("button", { name: "Publier l'événement" }).click();
  await expect(paul.getByText("Publié : l'événement est dans l'agenda")).toBeVisible();
  eventPath = (await paul.getByRole("link", { name: "En ligne" }).first().getAttribute("href")) ?? "";
  expect(eventPath).toMatch(/^\/events\/match-de-demonstration-exemple-e2e/);
});

test("§100 visitors find it in the agenda, the calendar and on the association's page", async ({ browser }) => {
  const visitor = await personIn(browser, null);
  await visitor.goto("/events");
  await expect(visitor.getByRole("link", { name: TITLE })).toBeVisible();
  await visitor.goto(`/events/calendrier?vue=semaine&jour=${DAY}`);
  await expect(visitor.getByRole("link", { name: new RegExp(TITLE.replace(/[()]/g, ".")) })).toBeVisible();
  await visitor.goto(`/associations/${ASSO}`);
  await expect(visitor.getByText(TITLE).first()).toBeVisible();

  await visitor.goto(eventPath);
  await expect(visitor).toHaveTitle(new RegExp(TITLE.replace(/[()]/g, ".")));
  const html = await visitor.content();
  expect(html).toContain("application/ld+json");
  expect(html).not.toContain('"offers"');
  expect(html).not.toContain(ACCESS);
  await expect(panel(visitor).getByText("2 places", { exact: true })).toBeVisible();
});

test("§101–102 two seats, a waiting list, a cancellation and an automatic promotion", async ({ browser }) => {
  const nina = await personIn(browser, "nina");
  await register(nina, /C'est fait, tu es inscrit·e/);
  await nina.reload();
  await expect(panel(nina).getByText(ACCESS)).toBeVisible();
  await nina.goto("/account/events");
  await expect(nina.getByRole("link", { name: TITLE })).toBeVisible();
  await nina.goto("/account/notifications");
  await expect(nina.getByText(`Inscription confirmée : ${TITLE}`)).toBeVisible();
  const ics = await nina.request.get(`${eventPath}/ics`);
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const calendar = await ics.text();
  expect(calendar).toContain("BEGIN:VEVENT");
  expect(calendar).not.toContain(ACCESS);

  const tom = await personIn(browser, "tom");
  await register(tom, /C'est fait, tu es inscrit·e/);
  const lea = await personIn(browser, "lea");
  await register(lea, /Tu es sur la liste d'attente, 1re/);
  await lea.reload();
  await expect(panel(lea).getByText(ACCESS)).toHaveCount(0);
  const hugo = await personIn(browser, "hugo.finance");
  await register(hugo, /Tu es sur la liste d'attente, 2e/);

  // Nina gives back her seat: Léa, first in line, gets it; Hugo moves up.
  await nina.goto(eventPath);
  await panel(nina).getByRole("button", { name: "Annuler mon inscription" }).click();
  await panel(nina).getByRole("button", { name: "Oui, annuler" }).click();
  await expect(panel(nina).getByText(/Inscription annulée/)).toBeVisible();

  await lea.goto("/account/events");
  await expect(lea.getByText(ACCESS)).toBeVisible();
  await lea.goto("/account/notifications");
  await expect(lea.getByText(`Une place s'est libérée : ${TITLE}`)).toBeVisible();
  await hugo.goto(eventPath);
  await expect(panel(hugo).getByText("1re sur la liste")).toBeVisible();
  await expect(panel(hugo).getByText("2/2", { exact: true })).toBeVisible();
});

test("§104 the team reads and exports its participants; another association reads nothing", async ({ browser }) => {
  await paul.goto(`${editorPath}/participants`);
  await expect(paul.getByText("Tom Exemple")).toBeVisible();
  await expect(paul.getByText("Léa Exemple")).toBeVisible();
  const [download] = await Promise.all([paul.waitForEvent("download"), paul.getByRole("button", { name: "Exporter (CSV)" }).click()]);
  const csv = readFileSync((await download.path()) ?? "", "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("Tom Exemple");
  expect(csv).not.toContain("@");

  const hugo = await personIn(browser, "hugo.finance");
  await hugo.goto(`${editorPath}/participants`);
  await expect(hugo.getByText("Tom Exemple")).toHaveCount(0);
  const refused = await hugo.request.post(`${editorPath}/participants/export`, {
    headers: { origin: new URL(hugo.url()).origin },
  });
  expect(refused.status()).toBe(403);
});

test("§103 the organizer cancels: the reason is shown, students are told, nothing can be booked", async ({ browser }) => {
  await paul.goto(`${editorPath}?etape=publication`);
  await paul.getByText("Annuler l'événement", { exact: true }).first().click();
  await paul.getByLabel("Raison, lue par les inscrit·es").fill(REASON);
  await paul.locator("form").getByRole("button", { name: "Annuler l'événement" }).click();
  await expect(paul.getByText(/Événement annulé\. Sa page l'indique/)).toBeVisible();

  const visitor = await personIn(browser, null);
  await visitor.goto(eventPath);
  await expect(visitor.getByRole("note").getByText("Événement annulé").first()).toBeVisible();
  await expect(visitor.getByText(REASON)).toBeVisible();

  const tom = await personIn(browser, "tom");
  await tom.goto("/account/events");
  await expect(tom.getByText("Annulés par les organisateurs")).toBeVisible();
  await tom.goto("/account/notifications");
  await expect(tom.getByText(`Annulé : ${TITLE}`)).toBeVisible();

  const nina = await personIn(browser, "nina");
  await nina.goto(eventPath);
  await expect(panel(nina).getByRole("button", { name: /^(S'inscrire|Rejoindre la liste d'attente)$/ })).toHaveCount(0);
});
