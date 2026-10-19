import { expect, test } from "@playwright/test";
import { fakeStudent, freshTotp, PINK_PIXEL_PNG, signInWithEmail, waitForResendWindow } from "./helpers";

/**
 * Phase 3 end-to-end: the brief's final verification scenario, on the local
 * stack (Supabase Auth + Mailpit) with fictional students only.
 */

test("a visitor browses without an account and /account asks to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Paris by night");
  await page.goto("/associations");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/events/wei");
  await expect(page.getByRole("heading", { level: 1, name: "Le WEI" })).toBeVisible();

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
});

test("an address outside the school domains cannot create an account", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Ton adresse e-mail de l'école").fill(`someone.${Date.now()}@gmail.com`);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText("Utilise ton adresse e-mail de l'école")).toBeVisible();
  await expect(page.getByLabel("Code reçu par e-mail")).toHaveCount(0);
});

test("a wrong sign-in code is refused with a clear message", async ({ page }) => {
  const email = fakeStudent("marc");
  await page.goto("/login");
  await page.getByLabel("Ton adresse e-mail de l'école").fill(email);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText("Regarde ta boîte de l'école.")).toBeVisible();
  await page.getByLabel("Code reçu par e-mail").fill("000000");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByText("Ce code n'est pas le bon ou il a expiré.")).toBeVisible();
});

test("an external ?next= is ignored after sign-in", async ({ page }) => {
  const email = fakeStudent("lina");
  await signInWithEmail(page, email, "/login?next=https%3A%2F%2Fevil.example%2Fsteal");
  await expect(page).toHaveURL(/\/account\/onboarding/);
  expect(page.url()).not.toContain("evil.example");
});

test("a student signs up, onboards, edits their profile, turns on MFA, and still manages nothing", async ({ page }) => {
  const email = fakeStudent("alice");

  // 4–9. Account → sign in with a school address → first-visit form.
  await page.goto("/account/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fprofile/);
  const firstCodeAt = Date.now();
  await signInWithEmail(page, email, page.url().replace(/^https?:\/\/[^/]+/, ""));
  await expect(page).toHaveURL(/\/account\/onboarding\?next=%2Faccount%2Fprofile/);
  await page.getByLabel("Prénom").fill("Alice");
  await page.getByLabel("Nom", { exact: true }).fill("Exemple");
  await page.getByRole("button", { name: "C'est parti" }).click();

  // 10–12. Back where she was going; her name in the header; edit the profile.
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: "Profil" })).toBeVisible();
  // Edit from a settled page: right after the redirect the route may still be
  // re-rendering, faster than anyone types but not faster than a robot.
  await page.goto("/account/profile");
  const displayName = page.getByLabel("Nom affiché");
  await displayName.fill("Alice E.");
  await page.getByLabel("Année").selectOption("2");
  await expect(displayName).toHaveValue("Alice E.");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Enregistré.")).toBeVisible();
  // The form now shows what the server saved…
  await expect(displayName).toHaveValue("Alice E.");
  // …and so does a fresh page.
  await page.reload();
  await expect(displayName).toHaveValue("Alice E.");

  // Avatar: own folder, private bucket, shown through a signed URL.
  await page.locator('input[type="file"]').setInputFiles({ name: "moi.png", mimeType: "image/png", buffer: PINK_PIXEL_PNG });
  // Asserting on the field's status line shows its error message if the upload fails.
  const avatarStatus = page.getByText("JPEG, PNG ou WebP, 2 Mo maximum.").locator("xpath=../following-sibling::p[@role='status']");
  await expect(avatarStatus).toHaveText("Photo enregistrée.");
  await expect(page.getByRole("button", { name: "Changer la photo" })).toBeVisible();

  // 14. Turn on two-factor authentication.
  await page.goto("/account/security");
  await expect(page.getByText("Désactivée")).toBeVisible();
  await page.getByRole("button", { name: "Configurer une application" }).click();
  const secret = (await page.locator("p.select-all").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByLabel("Entre le code à 6 chiffres", { exact: false }).fill("000000");
  await page.getByRole("button", { name: "Activer" }).click();
  await expect(page.getByText("Ce code ne correspond pas.", { exact: false })).toBeVisible();
  await page.getByLabel("Entre le code à 6 chiffres", { exact: false }).fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Activer" }).click();
  await expect(page.getByText("C'est activé.")).toBeVisible();

  // 15. Sign out.
  await page.getByRole("button", { name: "Me déconnecter", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?signed-out=1/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);

  // 16–19. Sign back in: the second factor is required, a wrong code is refused, the right one opens the account.
  await waitForResendWindow(firstCodeAt);
  await signInWithEmail(page, email, "/login?next=%2Faccount");
  await expect(page).toHaveURL(/\/login\/verification\?next=%2Faccount/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\/verification/);
  await page.getByLabel("Code de ton application d'authentification").fill("000000");
  await page.getByRole("button", { name: "Terminer la connexion" }).click();
  await expect(page.getByText("Ce code ne correspond pas.", { exact: false })).toBeVisible();
  await page.getByLabel("Code de ton application d'authentification").fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Terminer la connexion" }).click();

  // Returning student: no onboarding again.
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alice E.");

  // aal2: removing the factor is allowed in this session.
  await page.goto("/account/security");
  await expect(page.getByText("Activée", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirer la double authentification" })).toBeEnabled();

  // 20–21. Public site while signed in; still no association or BDE privilege.
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Gérer/ })).toHaveCount(0);
  await page.goto("/manage");
  await expect(page.getByRole("heading", { name: "Tu ne fais partie d'aucune équipe d'asso pour l'instant." })).toBeVisible();
  // The BDE's workspace exists, and is closed to a student outside its team.
  await page.goto("/manage/very-pink-club/events");
  await expect(page.getByRole("heading", { name: "Tu ne fais pas partie de l'équipe de Very Pink Club." })).toBeVisible();
});
