import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";

/**
 * Phase 15 — the browser-side security policy on the production build (the
 * CI runs `next start`): every page carries a Content-Security-Policy whose
 * script nonce changes with each response, Next's scripts run under it (the
 * page works), and nothing on the public, account and management pages —
 * the rich-text editor included — is refused by it. The other headers come
 * with it. And a session copied before signing out stops working at once
 * (Phase 15, D10). Fictional seed accounts only.
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

test("no account page breaks it either", async ({ page }) => {
  // Nina never gets a second factor in the suite. The management pages, the page preview and the
  // editor are checked for violations by e2e/accessibility.spec.ts, which runs first.
  const visit = await watchViolations(page);
  await signInAs(page, "nina");
  for (const path of ["/account", "/account/notifications", "/account/privacy", "/account/applications", "/account/saved", "/manage"]) {
    await visit(path);
  }
});

/** The access token inside the Supabase session cookie (possibly split and base64-encoded). */
function accessToken(cookies: Cookie[]): string {
  const parts = cookies.filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  let raw = parts.map((c) => c.value).join("");
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
  return (JSON.parse(raw) as { access_token: string }).access_token;
}

/** The project's public URL and publishable key, as the CI wrote them for the app. */
function publicSupabase() {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}

test("a session copied before signing out stops working at once (site and API)", async ({ page, context, browser, baseURL }) => {
  await signInAs(page, "nina");
  const copied = await context.cookies();
  const token = accessToken(copied);
  const { url, key } = publicSupabase();
  const rpc = (bearer: string) =>
    fetch(`${url}/rest/v1/rpc/my_privacy_overview`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: "{}",
    });
  expect((await rpc(token)).status, "control: the token works before signing out").toBe(200);

  await page.getByRole("banner").getByRole("button", { name: /Nina/ }).click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Someone who copied the cookies before the sign-out.
  const thief = await browser.newContext({ baseURL });
  await thief.addCookies(copied);
  const other = await thief.newPage();
  await other.goto("/account");
  await expect(other).toHaveURL(/\/login/);
  const exported = await other.request.post("/account/privacy/export", { headers: { origin: new URL(baseURL!).origin } });
  expect(exported.status(), "the personal-data export").toBe(401);
  const direct = await rpc(token);
  expect(direct.ok, "the database API with the old access token").toBe(false);
  expect(await direct.text()).toContain("not_authenticated");
  await thief.close();
});
