import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 14 — privacy on the local stack: the legal pages are public and
 * linked from every page; a visitor's browser contacts no third party and
 * keeps no cookie (hence no consent banner); a student downloads their own
 * data, files a request and follows it, and cannot reach anyone else's file
 * or the privacy officer's desk. Fictional seed accounts only.
 */

// The seed's LOCAL-ONLY password (supabase/seed.sql): fictional accounts on the CI stack.
const SEED_PASSWORD = "seed-local-password-2026";

test.describe.configure({ mode: "serial" });

async function signInAs(page: Page, local: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse du compte test").fill(`${local}@comptes.example.test`);
  await page.getByLabel("Mot de passe du compte test").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrer avec le compte test" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("the privacy notice, cookies and legal pages are public and linked from the footer", async ({ page }) => {
  for (const [name, path] of [
    ["Confidentialité", "/privacy"],
    ["Cookies", "/cookies"],
    ["Mentions légales", "/legal"],
  ] as const) {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  }
  await page.goto("/privacy");
  // Until the controller approves it, the notice says it is a draft and lists what is missing.
  await expect(page.getByText("Projet, pas encore validé")).toBeVisible();
  await expect(page.getByText(/L'entité juridique responsable du traitement/).first()).toBeVisible();
});

test("a visitor's browser talks to no third party and keeps no cookie", async ({ page, context, baseURL }) => {
  const hosts = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http")) hosts.add(u.hostname);
  });
  for (const p of ["/", "/privacy", "/events", "/associations", "/campus"]) await page.goto(p);
  const site = new URL(baseURL!).hostname;
  // The site itself, or the project's own Supabase (local stack in CI): no font, analytics or widget host.
  const others = [...hosts].filter((h) => h !== site && h !== "127.0.0.1" && h !== "localhost" && !h.endsWith(".supabase.co"));
  expect(others).toEqual([]);
  expect((await context.cookies()).map((c) => c.name)).toEqual([]);
  // No consent banner: there is nothing optional to consent to.
  await expect(page.getByRole("button", { name: /accepter|tout accepter/i })).toHaveCount(0);
});

test("a student downloads their own data, files a request and follows it", async ({ page, baseURL }) => {
  await signInAs(page, "nina");
  await page.goto("/account/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Mes données" })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Télécharger (JSON)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^mes-donnees-very-pink-club-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(data.format).toBe("vpc-personal-data/1");
  expect(data.account.email).toBe("nina@comptes.example.test");
  expect(JSON.stringify(data)).not.toContain("julie.finance@");
  expect(Array.isArray(data.not_included)).toBe(true);

  await page.getByRole("radio", { name: /Récupérer mes données dans un format réutilisable/ }).check();
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText(/Demande PR-\d{6} envoyée/)).toBeVisible();
  await page.reload();
  const mine = page.getByRole("complementary", { name: "Mes demandes" });
  await expect(mine.getByText("Récupérer mes données dans un format réutilisable")).toBeVisible();
  await expect(mine.getByText("Reçue", { exact: true })).toBeVisible();

  // The same request twice waits for the first.
  await page.getByRole("radio", { name: /Récupérer mes données dans un format réutilisable/ }).check();
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText(/Une demande du même type est déjà en cours/)).toBeVisible();

  // A file id alone opens nothing, and a download must come from the site.
  const origin = new URL(baseURL!).origin;
  const guessed = await page.request.post("/account/privacy/fichier", {
    form: { artifact_id: "00000000-0000-4000-8000-000000000000" },
    headers: { origin },
  });
  expect(guessed.status()).toBe(404);
  const crossSite = await page.request.post("/account/privacy/export");
  expect(crossSite.status()).toBe(403);

  // The privacy officer's desk stays closed to a student.
  await page.goto("/manage/donnees");
  await expect(page.getByText(/réservée à la personne chargée des demandes/)).toBeVisible();
});
