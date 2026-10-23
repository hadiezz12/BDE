import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { fakeStudent, freshTotp, signInWithEmail, solidPng } from "./helpers";

/**
 * Phase 6, brief §104–107: an article from the first keystroke to the campus
 * fil and back, through the interface, on the local stack (fictional
 * accounts of supabase/seed.sql only).
 *   "Finance (exemple)" asks for a review before every publication and signs
 *   its articles. Lucas (Communication: writes, edits, publishes) writes an
 *   article with a cover, finds his draft again after closing his browser,
 *   previews it on computer and phone and sends it for review; Julie (the
 *   president, who approves) approves that exact version; Lucas publishes
 *   it; a visitor reads it on the fil, on Finance's page and at its own
 *   address, signed by Lucas. An edit of the live article stays private:
 *   Emma, from another association, and visitors never reach it. Approved,
 *   the edit is scheduled, then the schedule cancelled. A student reports
 *   the article, the BDE hides it (Finance sees why and cannot put it back
 *   online), then restores it; at last the approved edit replaces the
 *   online version and the history keeps both.
 *
 * Specs share one database and run in file order. Publishing, scheduling,
 * reviewing and moderating need the second factor, and a test account that
 * has one signs in through a second step these helpers do not take:
 * pages.spec.ts turned it on for Marc (its secret ended with that run), so
 * the moderator here is Alice, BDE president, who holds the same
 * moderation right. Lucas, Julie and Alice turn it on below; no earlier spec
 * does it for them. governance.spec.ts hands Sports' presidency from Emma to
 * Paul: Emma stays in Sports' team, never in Finance's, which is all §107
 * needs. The database tests prove each rule; this proves the screens follow
 * them.
 */

// The seed's LOCAL-ONLY password (supabase/seed.sql): fictional accounts on the CI stack.
const SEED_PASSWORD = "seed-local-password-2026";

const ASSO = "exemple-finance";
const ASSO_NAME = "Finance (exemple)";
const TITLE = "Atelier de lecture de bilans (exemple e2e)";
const INTRO = "Introduction fictive écrite par le test de bout en bout.";
const INTRO_2 = "Introduction corrigée par le test de bout en bout, privée jusqu'à sa publication.";
const PARAGRAPH = "Premier paragraphe fictif, tapé dans l'éditeur par le test.";
const SUBHEAD = "Un intertitre du test";
const BOLD = "passage en gras du test";
const COVER_ALT = "Aplat bleu fictif envoyé par le test";
const REPORTER = "Sacha";
const REPORT_DETAILS = "Signalement fictif envoyé par le test de bout en bout.";
const HIDE_REASON = "Masquage fictif décidé par le test de bout en bout.";
const RESTORE_REASON = "Rétablissement fictif décidé par le test de bout en bout.";

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

/** The editor shows its text and its "Publication" column side by side from xl: the team gets a wide window. */
const EDITOR: BrowserContextOptions = { viewport: { width: 1440, height: 900 } };

let contexts: BrowserContext[] = [];
let lucas: Page;
let julie: Page;
let alice: Page;
let visitor: Page;

/** Where the article lives, once known: its editor, its private preview, its public address. */
let editorPath = "";
let previewPath = "";
let articlePath = "";

async function newPage(browser: Browser, options?: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext(options);
  contexts.push(context);
  return context.newPage();
}

/** Closes the person's browser, cookies and all. */
async function closeBrowser(page: Page) {
  const context = page.context();
  contexts = contexts.filter((c) => c !== context);
  await context.close();
}

test.beforeAll(async ({ browser }) => {
  visitor = await newPage(browser);
});

test.afterAll(async () => {
  for (const c of contexts) await c.close();
  contexts = [];
});

/**
 * Autosave has everything: the server confirmed a save during this visit
 * (the screen readers' status line), and the status beside the formatting
 * bar is back to "Enregistré à …" (nothing typed is waiting).
 */
async function expectSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^Enregistré à \d{2}:\d{2}\.$/ })).toBeAttached();
  const bar = page.getByRole("toolbar", { name: "Mise en forme du texte" }).locator("xpath=..");
  await expect(bar.getByText(/^Enregistré à \d{2}:\d{2}$/)).toBeVisible();
}

/** The article's line in "À traiter", and its row in the table, on the content desk. */
const deskTask = (page: Page) => page.getByRole("listitem").filter({ hasText: TITLE });
const deskRow = (page: Page) => page.getByRole("row").filter({ hasText: TITLE });

/** The article itself (public page and private preview alike), without the lists around it. */
const articleOf = (page: Page) => page.locator('article[aria-labelledby="titre-article"]');

/** A link to the article in a list: the fil, the association's page. */
const linkTo = (page: Page) => page.getByRole("link", { name: TITLE, exact: true });

/** The date `days` after today in Paris (yyyy-mm-dd), as the schedule form takes it. */
function parisDate(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** "samedi 24 octobre": a Paris date as the site writes it in a schedule. */
function dayInWords(day: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

test("§104 author: Lucas writes an article with a cover, finds his draft again and previews it", async ({ browser }) => {
  lucas = await newPage(browser, EDITOR);
  await signInAs(lucas, "lucas.finance");
  await lucas.goto(`/manage/${ASSO}/content`);
  await expect(lucas.getByText("Relecture obligatoire avant publication")).toBeVisible();
  await lucas.getByRole("link", { name: "Nouvel article" }).click();
  await expect(lucas).toHaveURL(new RegExp(`/manage/${ASSO}/content/new$`));
  await lucas.getByRole("radio", { name: /^Article/ }).check({ force: true });
  await lucas.getByRole("textbox", { name: "Titre" }).fill(TITLE);
  await lucas.getByRole("button", { name: "Ouvrir le brouillon" }).click();
  await expect(lucas).toHaveURL(new RegExp(`/manage/${ASSO}/content/[0-9a-f-]{36}$`));
  editorPath = new URL(lucas.url()).pathname;
  previewPath = `/campus/apercu/${editorPath.split("/").pop()}`;
  await expect(lucas.getByRole("textbox", { name: "Titre", exact: true })).toHaveValue(TITLE);

  // A cover, sent from the editor to the association's library.
  await lucas.getByRole("button", { name: "Choisir une image" }).click();
  const picker = lucas.getByRole("dialog", { name: "Image de couverture" });
  await picker.getByLabel("Description de l'image").fill(COVER_ALT);
  await picker
    .locator('input[type="file"]')
    .setInputFiles({ name: "couverture.png", mimeType: "image/png", buffer: solidPng(1600, 1000, [30, 80, 190]) });
  await expect(picker).toBeHidden();
  await expect(lucas.getByText(COVER_ALT)).toBeVisible();

  // The introduction, then the text, with a subhead and bold from the formatting bar.
  await lucas.getByRole("textbox", { name: "Introduction", exact: true }).fill(INTRO);
  const text = lucas.getByRole("textbox", { name: "Texte de l'article" });
  const tools = lucas.getByRole("toolbar", { name: "Mise en forme du texte" });
  await text.click();
  await lucas.keyboard.type(PARAGRAPH);
  await lucas.keyboard.press("Enter");
  await tools.getByRole("button", { name: "Intertitre", exact: true }).click();
  await lucas.keyboard.type(SUBHEAD);
  await lucas.keyboard.press("Enter");
  await lucas.keyboard.type("Puis un ");
  await tools.getByRole("button", { name: "Gras", exact: true }).click();
  await lucas.keyboard.type(BOLD);
  await tools.getByRole("button", { name: "Gras", exact: true }).click();
  await lucas.keyboard.type(", et la fin du texte.");
  await expect(text.locator("h2")).toHaveText(SUBHEAD);
  await expect(text.locator("strong")).toHaveText(BOLD);
  await expectSaved(lucas);

  // A draft is nobody else's business.
  await visitor.goto("/campus");
  await expect(linkTo(visitor)).toHaveCount(0);

  // Lucas closes his browser; signed in again, he finds the draft as he left it.
  await closeBrowser(lucas);
  lucas = await newPage(browser, EDITOR);
  await signInAs(lucas, "lucas.finance");
  await lucas.goto(`/manage/${ASSO}/content?vue=brouillons`);
  await expect(deskRow(lucas)).toContainText("Brouillon");
  await deskRow(lucas).getByRole("link", { name: TITLE, exact: true }).click();
  await expect(lucas).toHaveURL(new RegExp(`${editorPath}$`));
  await expect(lucas.getByRole("textbox", { name: "Introduction", exact: true })).toHaveValue(INTRO);
  const saved = lucas.getByRole("textbox", { name: "Texte de l'article" });
  await expect(saved).toContainText(PARAGRAPH);
  await expect(saved.locator("h2")).toHaveText(SUBHEAD);
  await expect(saved.locator("strong")).toHaveText(BOLD);
  await expect(lucas.getByText(COVER_ALT)).toBeVisible();

  // The private preview, as students will read it: on a computer, then framed at phone width.
  const opening = lucas.context().waitForEvent("page");
  await lucas.getByRole("link", { name: "Aperçu ordinateur" }).click();
  const preview = await opening;
  await expect(preview).toHaveURL(new RegExp(`${previewPath}$`));
  await expect(preview.getByText("Aperçu · version n°1 · brouillon")).toBeVisible();
  const draft = articleOf(preview);
  await expect(draft.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(draft.getByText(INTRO)).toBeVisible();
  await expect(draft.getByText(PARAGRAPH)).toBeVisible();
  await expect(draft.getByRole("heading", { level: 2, name: SUBHEAD, exact: true })).toBeVisible();
  await expect(draft.locator("strong", { hasText: BOLD })).toBeVisible();
  // Draft images come from the private preview route only.
  await expect(draft.locator('[data-media-slot="post-cover"] img')).toHaveAttribute("src", /^\/media\/apercu\/associations\//);

  await preview.getByRole("navigation", { name: "Taille de l'aperçu" }).getByRole("link", { name: "Téléphone" }).click();
  await expect(preview).toHaveURL(/vue=telephone/);
  await expect(preview.frameLocator("iframe").getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await preview.close();
});

test("§104 author: Lucas sends it for review, Julie approves that exact version, Lucas publishes it", async ({ browser }) => {
  const send = lucas.getByRole("button", { name: "Envoyer en relecture" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(lucas.getByText("Version n°1 en relecture")).toBeVisible();
  // Lucas may publish, not approve: in review, nothing goes online.
  await expect(lucas.getByRole("button", { name: "Approuver", exact: true })).toHaveCount(0);
  await expect(lucas.getByRole("button", { name: /^Publier/ })).toHaveCount(0);

  // Julie finds it waiting for her on Finance's desk.
  julie = await newPage(browser, EDITOR);
  await signInAs(julie, "julie.finance");
  await enrollTotp(julie);
  await julie.goto(`/manage/${ASSO}/content`);
  await expect(deskTask(julie)).toContainText("À relire");
  await deskTask(julie).getByRole("link", { name: TITLE, exact: true }).click();
  await expect(julie).toHaveURL(new RegExp(`${editorPath}$`));
  await expect(julie.getByText("Version n°1 en relecture")).toBeVisible();
  await julie.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(julie.getByText("Version n°1 approuvée")).toBeVisible();

  // Lucas, with his second factor, publishes the approved version.
  await enrollTotp(lucas);
  await lucas.goto(editorPath);
  await expect(lucas.getByText("Version n°1 approuvée")).toBeVisible();
  await expect(lucas.getByText(/Approuvée par Julie Exemple/)).toBeVisible();
  await lucas.getByRole("button", { name: "Publier maintenant", exact: true }).click();
  await expect(lucas.getByText("Version n°1 en ligne")).toBeVisible();
  const online = lucas.getByRole("link", { name: "Voir en ligne", exact: true });
  await expect(online).toHaveAttribute("href", /^\/campus\/[a-z0-9-]+$/);
  articlePath = (await online.getAttribute("href")) ?? "";
});

test("§104 author: a visitor finds it on the fil, on Finance's page and at its own address, signed by Lucas", async () => {
  const v = visitor;
  await v.goto("/campus");
  await expect(linkTo(v).first()).toHaveAttribute("href", articlePath);
  await v.goto(`/associations/${ASSO}`);
  await expect(linkTo(v).first()).toHaveAttribute("href", articlePath);

  await linkTo(v).first().click();
  await expect(v).toHaveURL(new RegExp(`${articlePath}$`));
  const article = articleOf(v);
  await expect(article.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(article.getByText(INTRO)).toBeVisible();
  await expect(article.getByText(PARAGRAPH)).toBeVisible();
  await expect(article.getByRole("heading", { level: 2, name: SUBHEAD, exact: true })).toBeVisible();
  await expect(article.locator("strong", { hasText: BOLD })).toBeVisible();
  // Finance signs its articles: the author is named.
  await expect(article.getByText(/^Par Lucas Exemple$/)).toBeVisible();
  // Published images are served by the site, never by a storage URL.
  await expect(article.locator('[data-media-slot="post-cover"] img')).toHaveAttribute("src", /url=%2Fmedia%2Fassociations%2F/);
  // Reporting is for signed-in students.
  await expect(article.getByRole("link", { name: "Connecte-toi pour signaler" })).toBeVisible();
});

test("§104 author: an edit of the live article stays private", async () => {
  await lucas.goto(editorPath);
  await expect(lucas.getByText("Version n°1 en ligne")).toBeVisible();
  await lucas.getByRole("button", { name: "Modifier", exact: true }).click();
  await lucas.getByRole("textbox", { name: "Introduction", exact: true }).fill(INTRO_2);
  await expectSaved(lucas);
  // The first change started version n°2; n°1 stays online meanwhile.
  await expect(lucas.getByText(/ · version n°2$/)).toBeVisible();
  await expect(lucas.getByText("En ligne · modifications en cours").first()).toBeVisible();

  await visitor.goto(articlePath);
  await expect(visitor.getByText(INTRO)).toBeVisible();
  await expect(visitor.getByText(INTRO_2)).toHaveCount(0);
});

test("§107 cross-organization: another association's team, and visitors, never reach Finance's drafts", async ({ browser }) => {
  const emma = await newPage(browser);
  await signInAs(emma, "emma.sports");
  const outside = emma.getByRole("heading", { name: `Tu ne fais pas partie de l'équipe de ${ASSO_NAME}.` });
  await emma.goto(`/manage/${ASSO}/content`);
  await expect(outside).toBeVisible();
  await emma.goto(editorPath);
  await expect(outside).toBeVisible();
  await expect(emma.getByText(INTRO_2)).toHaveCount(0);
  await emma.goto(previewPath);
  await expect(emma.getByRole("heading", { name: "Aperçu réservé à l'équipe de l'asso" })).toBeVisible();
  await expect(emma.getByText(INTRO_2)).toHaveCount(0);
  // Published, the article is everyone's to read; the draft still is not.
  await emma.goto(articlePath);
  await expect(articleOf(emma).getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(emma.getByText(INTRO_2)).toHaveCount(0);

  await visitor.goto(previewPath);
  await expect(visitor).toHaveURL(/\/login\?next=%2Fcampus%2Fapercu%2F/);
  await visitor.goto(editorPath);
  await expect(visitor.getByRole("heading", { name: `Connecte-toi pour gérer ${ASSO_NAME}.` })).toBeVisible();
  await expect(visitor.getByText(INTRO_2)).toHaveCount(0);
});

test("§105 schedule: an approved edit, scheduled, waits on the desk until the schedule is cancelled", async () => {
  await lucas.goto(editorPath);
  const send = lucas.getByRole("button", { name: "Envoyer en relecture" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(lucas.getByText("Version n°2 en relecture")).toBeVisible();

  await julie.goto(`/manage/${ASSO}/content`);
  await expect(deskTask(julie)).toContainText("À relire");
  await deskTask(julie).getByRole("link", { name: TITLE, exact: true }).click();
  await expect(julie.getByText("Version n°2 en relecture")).toBeVisible();
  await julie.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(julie.getByText("Version n°2 approuvée")).toBeVisible();

  // Tomorrow at 9:00, Paris time (the worker is not waited for: the schedule is cancelled first).
  // The stored instant comes back as the same Paris day and time.
  const day = parisDate(1);
  const when = `${dayInWords(day)} à 09:00`;
  await lucas.goto(editorPath);
  await expect(lucas.getByText("Version n°2 approuvée")).toBeVisible();
  const schedule = lucas.locator("details").filter({ hasText: "Programmer la publication" });
  await schedule.locator("summary").click();
  await schedule.getByLabel("Jour").fill(day);
  await schedule.getByLabel("Heure").fill("09:00");
  await expect(schedule.getByText(`Mise en ligne prévue le ${when}.`)).toBeVisible();
  await schedule.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(lucas.getByText(`Programmé · ${when}`, { exact: true }).first()).toBeVisible();

  // The desk lists it with the scheduled posts; online, nothing changes before the time.
  await lucas.goto(`/manage/${ASSO}/content?vue=programmes`);
  await expect(deskRow(lucas)).toContainText(`Programmé · ${when}`);
  await expect(deskRow(lucas)).toContainText("La version en ligne reste visible d'ici là");
  await visitor.goto(articlePath);
  await expect(visitor.getByText(INTRO)).toBeVisible();
  await expect(visitor.getByText(INTRO_2)).toHaveCount(0);

  // Cancelled: nothing is published, the version stays approved.
  await deskRow(lucas).getByRole("link", { name: TITLE, exact: true }).click();
  await expect(lucas).toHaveURL(new RegExp(`${editorPath}$`));
  await lucas.getByRole("button", { name: "Annuler la programmation" }).click();
  await expect(lucas.getByText("Approuvé, pas encore publié").first()).toBeVisible();
  await lucas.goto(`/manage/${ASSO}/content?vue=programmes`);
  await expect(deskRow(lucas)).toHaveCount(0);
});

test("§106 moderation: a student reports the article, the BDE hides it, Finance cannot put it back", async ({ browser }) => {
  // A student with a new account reports it.
  const student = await newPage(browser);
  await signInWithEmail(student, fakeStudent("signalement"));
  await expect(student).toHaveURL(/\/account\/onboarding/);
  await student.getByLabel("Prénom").fill(REPORTER);
  await student.getByLabel("Nom", { exact: true }).fill("Exemple");
  await student.getByRole("button", { name: "C'est parti" }).click();
  await expect(student).toHaveURL(/\/account$/);

  await student.goto(articlePath);
  await student.getByRole("button", { name: "Signaler", exact: true }).click();
  const report = student.getByRole("dialog", { name: "Signaler cet article" });
  await report.getByRole("radio", { name: "Information trompeuse ou dangereuse" }).check();
  await report.getByLabel("Précisions").fill(REPORT_DETAILS);
  await report.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(report.getByText("Merci, c'est envoyé.", { exact: false })).toBeVisible();

  // The BDE sees the report, its reason and details, never who sent it, and hides the article.
  alice = await newPage(browser);
  await signInAs(alice, "alice.bde");
  await enrollTotp(alice);
  await alice.goto("/manage/plateforme/moderation");
  const reported = alice.getByRole("article").filter({ has: alice.getByRole("heading", { name: TITLE, exact: true }) });
  await expect(reported).toContainText("Information trompeuse ou dangereuse");
  await expect(reported).toContainText(REPORT_DETAILS);
  await expect(alice.getByText(REPORTER)).toHaveCount(0);

  const hide = reported.locator("details").filter({ hasText: "Masquer l'article" });
  await hide.locator("summary").click();
  await hide.getByLabel("Raison").fill(HIDE_REASON);
  await hide.locator("form").getByRole("button", { name: "Masquer l'article" }).click();
  await expect(reported).toHaveCount(0);
  await alice.goto("/manage/plateforme/moderation?vue=masques");
  const hidden = alice.getByRole("article").filter({ has: alice.getByRole("heading", { name: TITLE, exact: true }) });
  await expect(hidden).toContainText(HIDE_REASON);

  // Gone from the site: its address, the fil, Finance's page.
  await visitor.goto(articlePath);
  await expect(visitor.getByRole("heading", { level: 1, name: "Ce papier n'est jamais sorti de l'imprimerie." })).toBeVisible();
  await visitor.goto("/campus");
  await expect(visitor.getByRole("link", { name: "Rentrée de l'asso Finance (exemple)", exact: true }).first()).toBeVisible();
  await expect(linkTo(visitor)).toHaveCount(0);
  await visitor.goto(`/associations/${ASSO}`);
  await expect(visitor.getByRole("heading", { level: 1, name: ASSO_NAME })).toBeVisible();
  await expect(linkTo(visitor)).toHaveCount(0);

  // Finance sees why, and has no way to publish it again (its edit is approved, yet no button).
  await lucas.goto(`/manage/${ASSO}/content`);
  await expect(deskTask(lucas)).toContainText("Masqué par le BDE");
  await expect(deskTask(lucas)).toContainText(HIDE_REASON);
  await deskTask(lucas).getByRole("link", { name: TITLE, exact: true }).click();
  await expect(lucas.getByText("Masqué par la modération du BDE", { exact: true })).toBeVisible();
  await expect(lucas.getByText(HIDE_REASON)).toBeVisible();
  await expect(lucas.getByRole("button", { name: /^Publier/ })).toHaveCount(0);
  await expect(lucas.getByText("Programmer la publication")).toHaveCount(0);
});

test("§106 moderation: the BDE restores it, its history keeps both decisions, visitors read it again", async () => {
  await alice.goto("/manage/plateforme/moderation?vue=masques");
  const hidden = alice.getByRole("article").filter({ has: alice.getByRole("heading", { name: TITLE, exact: true }) });
  const restore = hidden.locator("details").filter({ hasText: "Rétablir l'article" });
  await restore.locator("summary").click();
  await restore.getByLabel("Raison").fill(RESTORE_REASON);
  await restore.locator("form").getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(hidden).toHaveCount(0);

  await alice.goto("/manage/plateforme/moderation?vue=historique");
  await expect(alice.getByText(HIDE_REASON)).toBeVisible();
  await expect(alice.getByText(RESTORE_REASON)).toBeVisible();

  // Back as Finance left it: version n°1 online, the approved edit still waiting.
  await visitor.goto(articlePath);
  await expect(articleOf(visitor).getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(visitor.getByText(INTRO)).toBeVisible();
  await visitor.goto("/campus");
  await expect(linkTo(visitor).first()).toBeVisible();
});

test("§104 author: the approved edit replaces the online version, and the history keeps both", async () => {
  await lucas.goto(editorPath);
  await expect(lucas.getByText("Version n°2 approuvée")).toBeVisible();
  await lucas.getByRole("button", { name: "Publier cette version", exact: true }).click();
  await expect(lucas.getByText("Version n°2 en ligne")).toBeVisible();

  await visitor.goto(articlePath);
  await expect(visitor.getByText(INTRO_2)).toBeVisible();
  await expect(visitor.getByText(INTRO)).toHaveCount(0);

  await lucas.getByRole("link", { name: "Historique", exact: true }).click();
  await expect(lucas).toHaveURL(new RegExp(`${editorPath}/historique$`));
  await expect(lucas.getByRole("heading", { name: "Version n°2", exact: true })).toBeVisible();
  await expect(lucas.getByRole("heading", { name: "Version n°1", exact: true })).toBeVisible();
  await expect(lucas.getByText(/a approuvé la version n°2\./)).toBeVisible();
  await expect(lucas.getByText(/a approuvé la version n°1\./)).toBeVisible();
});
