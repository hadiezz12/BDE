import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 15 — the browser-side security policy on the production build (the
 * CI runs `next start`): every page carries a Content-Security-Policy whose
 * script nonce changes with each response, Next's scripts run under it (the
 * page works), and nothing on the public, account and management pages —
 * the rich-text editor included — is refused by it. The other headers come
 * with it. Fictional seed accounts only.
 */

const SEED_PASSWORD = "seed-local-password-2026";

test.describe.configure({ mode: "serial" });

async function signInAs(page: Page, local: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse du compte test").fill(`${local}@comptes.example.test`);
  await page.getByLabel("Mot de passe du compte test").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrer avec le compte test" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Collects every CSP violation the browser reports on the pages visited. */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const fromConsole: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to (execute|load|connect|apply)/i.test(m.text())) fromConsole.push(m.text());
  });
  return async (path: string) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const seen = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp ?? []);
    expect([...seen, ...fromConsole], `CSP violations on ${path}`).toEqual([]);
  };
}

const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1] ?? null;

test("every page has a script policy with a fresh nonce, and the other security headers", async ({ request }) => {
  const a = await request.get("/");
  const b = await request.get("/");
  const csp = a.headers()["content-security-policy"];
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(nonceOf(csp)).toBeTruthy();
  expect(nonceOf(b.headers()["content-security-policy"])).not.toBe(nonceOf(csp));
  const h = a.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("SAMEORIGIN");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=31536000");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-powered-by"]).toBeUndefined();
  // Personal pages are never stored by a shared cache, even on the way to the sign-in page.
  const account = await request.get("/account", { maxRedirects: 0 });
  expect(account.headers()["cache-control"] ?? "").toMatch(/private|no-store/);
});

test("Next's scripts carry the nonce and the page works under the policy", async ({ page, request }) => {
  // Every script tag the server sends carries this response's nonce ('strict-dynamic' then
  // lets those scripts load Next's other chunks, which need none).
  for (const path of ["/", "/events", "/associations/exemple-finance"]) {
    const res = await request.get(path);
    const nonce = nonceOf(res.headers()["content-security-policy"]);
    const tags = (await res.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(tags.length, `scripts on ${path}`).toBeGreaterThan(0);
    expect(tags.filter((t) => !/type="application\/ld\+json"/.test(t) && !t.includes(`nonce="${nonce}"`)), path).toEqual([]);
  }
  await page.goto("/");
  // JavaScript runs: the theme switch reacts.
  await page.getByRole("button", { name: "Mode clair" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("no public page breaks the policy", async ({ page }) => {
  const visit = await watchViolations(page);
  for (const path of ["/", "/associations", "/associations/exemple-finance", "/events", "/events/calendrier", "/recruitment", "/campus", "/search?q=finance", "/privacy", "/vss", "/login"]) {
    await visit(path);
  }
});

test("no account or management page breaks it either, editor included", async ({ page }) => {
  const visit = await watchViolations(page);
  await signInAs(page, "julie.finance");
  for (const path of [
    "/account",
    "/account/notifications",
    "/account/privacy",
    "/manage",
    "/manage/exemple-finance",
    "/manage/exemple-finance/analytics",
    // The page preview frames the site itself (frame-src 'self').
    "/associations/exemple-finance/apercu?vue=telephone",
  ]) {
    await visit(path);
  }
  await visit("/manage/exemple-finance/content");
  const post = await page
    .locator('a[href^="/manage/exemple-finance/content/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")).find((h) => /\/content\/[0-9a-f-]{36}$/.test(h ?? "")));
  expect(post, "a Finance post to open in the editor").toBeTruthy();
  await visit(post!);
  // The editor (ProseMirror) only becomes editable once its script has run.
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
  const late = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp ?? []);
  expect(late).toEqual([]);
});
