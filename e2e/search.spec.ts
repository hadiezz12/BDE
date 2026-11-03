import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 12, brief §95–100: the campus search, the quick search, saved items
 * and the front page's spotlights, through the interface, on the local stack
 * (fictional accounts and seed content only).
 *   A visitor searches "finance" and finds the association, its events,
 *   recruitment and article; tabs keep the query in the URL; markup and SQL
 *   typed in the box stay text. The ⌘K dialog asks the database as one
 *   types and opens a result. Tom saves Finance, finds it in his saved
 *   items after a reload, and removes it; Léa never sees his list. The seed
 *   puts Finance "à l'honneur" (supabase/seed.sql), and the front page says so.
 * The database tests (search.test.sql) prove every visibility rule; this
 * proves the screens follow them.
 */

// The seed's LOCAL-ONLY password (supabase/seed.sql): fictional accounts on the CI stack.
const SEED_PASSWORD = "seed-local-password-2026";

async function signInAs(page: Page, local: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse du compte test").fill(`${local}@comptes.example.test`);
  await page.getByLabel("Mot de passe du compte test").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrer avec le compte test" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("a visitor searches the whole campus, by type, with the query kept in the URL", async ({ page }) => {
  await page.goto("/search?q=finance");
  await expect(page.getByRole("heading", { level: 2, name: /résultats? pour « finance »/ })).toBeVisible();
  const results = page.locator("main");
  await expect(results.getByRole("link", { name: /^Finance \(exemple\)/ })).toHaveAttribute("href", "/associations/exemple-finance");
  await expect(results.getByRole("link", { name: /Atelier finance \(exemple\)/ })).toBeVisible();
  // Every result leads to a page of the site.
  for (const href of await results.locator("ul a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
    expect(href.startsWith("/")).toBe(true);
  }

  const tabs = page.getByRole("navigation", { name: "Type de résultats" });
  await tabs.getByRole("link", { name: /Événements/ }).click();
  await expect(page).toHaveURL(/\/search\?q=finance&type=evenements$/);
  await expect(tabs.getByRole("link", { name: /Événements/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /Atelier finance \(exemple\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Finance \(exemple\)/ })).toHaveCount(0);

  // Results pages are never indexed.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("malformed and malicious input is handled as text", async ({ page }) => {
  let dialogs = 0;
  page.on("dialog", async (d) => {
    dialogs += 1;
    await d.dismiss();
  });
  await page.goto(`/search?q=${encodeURIComponent("<script>alert(1)</script>")}`);
  await expect(page.getByText("Rien pour « <script>alert(1)</script> »")).toBeVisible();
  expect(await page.locator("main script").count()).toBe(0);
  await page.goto(`/search?q=${encodeURIComponent("'); drop table posts; --")}`);
  await expect(page.getByText(/Rien pour/)).toBeVisible();
  await page.goto("/search?q=x");
  await expect(page.getByText("Encore une lettre.")).toBeVisible();
  await page.goto("/search?type=drop&quand=demain&page=-4");
  await expect(page.getByRole("heading", { level: 1, name: "Recherche" })).toBeVisible();
  expect(dialogs).toBe(0);
});

test("the quick search asks the database as one types and opens the result", async ({ page }) => {
  await page.goto("/events");
  await page.keyboard.press("Control+k");
  const box = page.getByRole("combobox");
  await expect(box).toBeFocused();
  await box.pressSequentially("finance", { delay: 30 });
  const option = page.getByRole("option", { name: /^Finance \(exemple\)/ });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/associations\/exemple-finance$/);
});

test.describe("saved items", () => {
  test.skip(!process.env.E2E_TEST_ACCOUNT_PASSWORD, "needs the local stack with test-account sign-in (CI e2e job)");

  test("a student saves an association, finds it after a reload, removes it; nobody else sees it", async ({ page, browser }) => {
    await signInAs(page, "tom");
    await page.goto("/associations/exemple-finance");
    const save = page.getByRole("button", { name: "Enregistrer", exact: true });
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Asso enregistrée dans tes enregistrements.")).toBeVisible();

    await page.goto("/account/saved");
    await expect(page.getByRole("link", { name: /^Finance \(exemple\)/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: /^Finance \(exemple\)/ })).toBeVisible();
    // Saving is not joining: the association's page does not say he is a member.
    await page.goto("/associations/exemple-finance");
    await expect(page.getByText("Tu en fais partie")).toHaveCount(0);

    const other = await (await browser.newContext()).newPage();
    await signInAs(other, "lea");
    await other.goto("/account/saved");
    await expect(other.getByText("Rien d'enregistré pour l'instant.")).toBeVisible();
    await expect(other.getByRole("link", { name: /^Finance \(exemple\)/ })).toHaveCount(0);
    await other.context().close();

    await page.goto("/account/saved");
    await page.getByRole("button", { name: "Enregistrer", pressed: true }).first().click();
    await expect(page.getByRole("link", { name: /^Finance \(exemple\)/ })).toHaveCount(0);
  });

  test("a visitor is offered to sign in to save", async ({ page }) => {
    await page.goto("/associations/exemple-finance");
    await expect(page.getByRole("link", { name: "Se connecter pour enregistrer" })).toHaveAttribute(
      "href",
      "/login?next=%2Fassociations%2Fexemple-finance",
    );
  });
});

test("the front page shows the association the BDE put à l'honneur", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Trouve ta bande" }).getByText("À l'honneur")).toBeVisible();
});
