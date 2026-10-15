import { createHmac, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/** Mailpit, the local stack's mail catcher ([local_smtp] in supabase/config.toml). */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

/** A fictional student on the seeded test domain. */
export function fakeStudent(name: string): string {
  return `${name}.${randomUUID().slice(0, 8)}@student.example.test`;
}

/** The 6-digit sign-in code from the newest email sent to `email`. */
export async function readSignInCode(email: string, after: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    if (search.ok) {
      const { messages = [] } = (await search.json()) as { messages?: { ID: string; Created: string }[] };
      const fresh = messages.find((m) => Date.parse(m.Created) >= after - 2000);
      if (fresh) {
        const message = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { Text?: string; HTML?: string };
        const code = `${message.Text ?? ""} ${message.HTML ?? ""}`.match(/\b(\d{6})\b/)?.[1];
        if (code) return code;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no sign-in email for ${email}`);
}

/** Requests a code on /login and types it. Leaves the page wherever sign-in redirects. */
export async function signInWithEmail(page: Page, email: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Ton adresse e-mail de l'école").fill(email);
  const sentAfter = Date.now();
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText("Regarde ta boîte de l'école.")).toBeVisible();
  const code = await readSignInCode(email, sentAfter);
  await page.getByLabel("Code reçu par e-mail").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as authenticator apps compute it. */
export function totp(base32Secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32Secret.replace(/[\s=]/g, "").toUpperCase();
  let bits = "";
  for (const ch of clean) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

/** A TOTP code with at least 5 s left in its window. */
export async function freshTotp(secret: string): Promise<string> {
  const left = 30 - ((Date.now() / 1000) % 30);
  if (left < 5) await new Promise((resolve) => setTimeout(resolve, (left + 0.5) * 1000));
  return totp(secret);
}

/** The local stack refuses a second code to the same address within 60 s ([auth.email] max_frequency). */
export async function waitForResendWindow(since: number) {
  const wait = 61_000 - (Date.now() - since);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** A tiny valid PNG (1×1, pink) for the avatar upload. */
export const PINK_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4+5/hPwAHggJ/PIcCZQAAAABJRU5ErkJggg==",
  "base64",
);
