import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";

/**
 * Phase 15 — accessibility on the production build with the seed data.
 *
 * Automated: axe-core with the WCAG 2.0, 2.1 and 2.2 A/AA rules on public,
 * phone, light-theme, candidate and officer pages (form builder and editor
 * included); a page passes only with no violation at all. Automated rules
 * cover part of WCAG only (docs/qa/accessibility.md lists what was checked by
 * hand). Then what axe cannot see: the skip link, the search dialog with the
 * keyboard alone, reflow at 320 px, reduced motion. Fictional seed accounts.
 */

const SEED_PASSWORD = "seed-local-password-2026";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe.configure({ mode: "serial" });

async function signInAs(page: Page, local: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse du compte test").fill(`${local}@comptes.example.test`);
  await page.getByLabel("Mot de passe du compte test").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrer avec le compte test" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.beforeEach(async ({ page }) => {
  // The pages scanned here are also checked against the Content-Security-Policy (e2e/security.spec.ts).
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
});

async function expectAccessible(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // Contrast is measured at rest: let one-off animations (the neon power-on) finish first.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  // Mail previews are sandboxed frames without scripts: axe cannot enter them (their words are checked by the mail tests).
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude("iframe[sandbox]").analyze();
  const found = violations.map((v) => `${v.id} [${v.impact}] ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(found, `accessibility violations on ${path}`).toEqual([]);
  const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  expect(csp, `Content-Security-Policy violations on ${path}`).toEqual([]);
}

/** The first link under a prefix that ends with an id (a campaign, an event, a post). */
async function firstIdLink(page: Page, prefix: string) {
  return page.locator(`a[href^="${prefix}"]`).evaluateAll(
    (as, pre) =>
      as
        .map((a) => a.getAttribute("href") ?? "")
        .find((h) => h.startsWith(pre) && /^[0-9a-f-]{36}$/.test(h.slice(pre.length))),
    prefix,
  );
}

const PUBLIC = [
  "/",
  "/associations",
  "/associations/exemple-finance",
  "/events",
  "/events/calendrier",
  "/recruitment",
  "/campus",
  "/search?q=finance",
  "/privacy",
  "/cookies",
  "/legal",
  "/vss",
  "/login",
];

test("public pages have no automated accessibility violation", async ({ page }) => {
  for (const path of PUBLIC) await expectAccessible(page, path);
});

test("in the light theme too", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "vpc-theme", value: "light", url: baseURL! }]);
  for (const path of ["/", "/associations/exemple-finance", "/events", "/recruitment", "/login"]) await expectAccessible(page, path);
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  test("the main public pages", async ({ page }) => {
    for (const path of ["/", "/events", "/recruitment", "/associations/exemple-finance", "/login"]) await expectAccessible(page, path);
  });
});

test("a student's own pages", async ({ page }) => {
  await signInAs(page, "nina");
  for (const path of [
    "/account",
    "/account/profile",
    "/account/events",
    "/account/applications",
    "/account/saved",
    "/account/notifications",
    "/account/notifications/reglages",
    "/account/privacy",
    "/account/security",
  ]) {
    await expectAccessible(page, path);
  }
  await page.goto("/account/applications");
  const app = await firstIdLink(page, "/account/applications/");
  if (app) await expectAccessible(page, app);
});

test("an association president's workspace, form builder and page preview", async ({ page }) => {
  await signInAs(page, "julie.finance");
  for (const path of [
    "/manage",
    "/manage/exemple-finance",
    "/manage/exemple-finance/team",
    "/manage/exemple-finance/content",
    "/manage/exemple-finance/events",
    "/manage/exemple-finance/recruitment",
    "/manage/exemple-finance/analytics",
    "/manage/exemple-finance/settings",
    "/manage/exemple-finance/communication",
  ]) {
    await expectAccessible(page, path);
  }
  await page.goto("/manage/exemple-finance/recruitment");
  const campaign = await firstIdLink(page, "/manage/exemple-finance/recruitment/");
  expect(campaign, "a Finance campaign").toBeTruthy();
  for (const step of ["", "?etape=postes", "?etape=formulaire", "?etape=publication"]) await expectAccessible(page, campaign + step);
  await page.goto("/manage/exemple-finance/events");
  const event = await firstIdLink(page, "/manage/exemple-finance/events/");
  expect(event, "a Finance event").toBeTruthy();
  for (const step of ["", "?etape=lieu", "?etape=inscriptions"]) await expectAccessible(page, event + step);
  // The page preview frames the site itself (frame-src 'self').
  await expectAccessible(page, "/associations/exemple-finance/apercu?vue=telephone");
});

test("the rich-text editor, opened by the author of a draft", async ({ page }) => {
  // In the seed, the only Finance draft is Lucas's (the others are submitted, approved or
  // scheduled: frozen, read-only). Lucas has no second factor yet when this file runs.
  await signInAs(page, "lucas.finance");
  await page.goto("/manage/exemple-finance/content");
  const posts = await page.locator('a[href^="/manage/exemple-finance/content/"]').evaluateAll((as) => [
    ...new Set(as.map((a) => a.getAttribute("href") ?? "").filter((h) => /\/content\/[0-9a-f-]{36}$/.test(h))),
  ]);
  expect(posts.length, "Finance posts listed for Lucas").toBeGreaterThan(0);
  let editable: string | null = null;
  for (const href of posts) {
    await page.goto(href);
    // ProseMirror only becomes editable once its script has run under the policy: wait for it
    // (isVisible() would answer at once, before hydration).
    const live = await page
      .locator('[contenteditable="true"]')
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (live) {
      editable = href;
      break;
    }
  }
  expect(editable, "Lucas's draft open in the editor").toBeTruthy();
  await expectAccessible(page, editable!);
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
});

test("the keyboard alone: skip link, then the search dialog opens, traps and gives focus back", async ({ page }) => {
  await page.goto("/events");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#contenu$/);

  const opener = page.getByRole("button", { name: /Rechercher/ }).first();
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Recherche" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("finance");
  // The page behind is inert: tabbing never lands on it (focus may leave to the browser's own
  // interface, which WCAG 2.1.2 requires to stay possible).
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((d) => d.contains(document.activeElement) || document.activeElement === document.body);
    expect(inside, "focus never reaches the page behind the dialog").toBe(true);
  }
  // As in any search field, a first Escape empties it; the next one closes the dialog.
  await dialog.getByRole("combobox").focus();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("combobox")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("content reflows at 320 px without sideways scrolling (WCAG 1.4.10)", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  for (const path of ["/", "/events", "/events/calendrier", "/recruitment", "/associations", "/associations/exemple-finance", "/campus", "/login", "/privacy"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { overflow, culprits } = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const name = (el: Element) => {
        const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className.split(" ").slice(0, 6).join(".") : "";
        return `${el.tagName.toLowerCase()}.${cls} «${(el.textContent ?? "").trim().slice(0, 30)}»`;
      };
      const all = [...document.querySelectorAll<HTMLElement>("body *")];
      // Elements whose own content is wider than them without clipping it (this also catches
      // pseudo-elements, through their parent); the innermost ones are the cause.
      const wide = all.filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.clientWidth > 0);
      const innermost = wide.filter((el) => !wide.some((o) => o !== el && el.contains(o)));
      // And anything whose box passes the right edge of the page.
      const past = all.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > width + 1;
      });
      const culprits = [
        ...innermost.slice(0, 4).map((el) => `${name(el)} content ${el.scrollWidth}px in ${el.clientWidth}px`),
        ...past.slice(-3).map((el) => `${name(el)} right=${Math.round(el.getBoundingClientRect().right)}`),
      ];
      return { overflow: document.documentElement.scrollWidth - width, culprits };
    });
    // Soft: one run reports every page, with what sticks out.
    expect.soft(overflow, `horizontal overflow on ${path}: ${culprits.join(" ; ")}`).toBeLessThanOrEqual(1);
  }
  await context.close();
});

test("reduced motion stops the moving strips, and they stay reachable", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const tracks = page.locator(".marquee-track");
  const n = await tracks.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) {
    const style = await tracks.nth(i).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { duration: parseFloat(cs.animationDuration), count: cs.animationIterationCount };
    });
    expect(style.duration).toBeLessThan(0.01);
    expect(style.count).toBe("1");
  }
  // Mail previews are sandboxed frames without scripts: axe cannot enter them (their words are checked by the mail tests).
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude("iframe[sandbox]").analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await context.close();
});
