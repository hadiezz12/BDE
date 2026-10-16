// Unit tests for the pure auth helpers. Run with `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, withNext } from "./next-path.ts";
import { AUTH_MESSAGES, classifyAuthError, parseAuthProblem } from "./messages.ts";
import { isOwnAvatarPath, validateProfileInput } from "./profile-input.ts";
import { isTestAccountEmail, TEST_ACCOUNT_DOMAIN, testAccountsEnabled } from "./test-accounts.ts";

test("safeNextPath keeps internal destinations", () => {
  assert.equal(safeNextPath("/account"), "/account");
  assert.equal(safeNextPath("/recruitment/finance-2027?tab=postes#faq"), "/recruitment/finance-2027?tab=postes#faq");
  assert.equal(safeNextPath(["/events/wei", "/ignored"]), "/events/wei");
});

test("safeNextPath refuses open redirects and loops", () => {
  for (const bad of [
    "https://evil.example/steal",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "account",
    "/login",
    "/login/verification?next=/account",
    "/auth/callback?code=x",
    "/account\u0000",
    "/account\nSet-Cookie: x",
    "",
    null,
    undefined,
    `/${"a".repeat(600)}`,
  ]) {
    assert.equal(safeNextPath(bad), null, String(bad));
  }
});

test("withNext only carries safe destinations", () => {
  assert.equal(withNext("/login", "/account/profile"), "/login?next=%2Faccount%2Fprofile");
  assert.equal(withNext("/login", "https://evil.example"), "/login");
  assert.equal(withNext("/login", null), "/login");
});

test("classifyAuthError maps Supabase errors to messages students understand", () => {
  assert.equal(classifyAuthError({ message: "signup_email_not_eligible", status: 403 }), "not_eligible");
  assert.equal(classifyAuthError({ code: "otp_expired", message: "Token has expired or is invalid" }), "code_invalid");
  assert.equal(classifyAuthError({ code: "over_email_send_rate_limit" }), "rate_limited");
  assert.equal(classifyAuthError({ status: 429 }), "rate_limited");
  assert.equal(classifyAuthError({ code: "mfa_verification_failed" }), "mfa_invalid");
  assert.equal(classifyAuthError({ code: "insufficient_aal" }), "mfa_required");
  assert.equal(classifyAuthError({ code: "flow_state_expired" }), "link_invalid");
  assert.equal(classifyAuthError({ status: 503 }), "unavailable");
  assert.equal(classifyAuthError({ message: "TypeError: fetch failed" }), "unavailable");
  assert.equal(classifyAuthError({ code: "something_new" }), "unknown");
  assert.equal(classifyAuthError(null), "unknown");
});

test("no message leaks technical words", () => {
  for (const text of Object.values(AUTH_MESSAGES)) {
    assert.doesNotMatch(text, /supabase|oauth|jwt|pkce|token|hook|aal/i, text);
  }
});

test("parseAuthProblem accepts only known problems", () => {
  assert.equal(parseAuthProblem("link_invalid"), "link_invalid");
  assert.equal(parseAuthProblem("<script>"), null);
  assert.equal(parseAuthProblem(undefined), null);
});

const form = (values) => ({ get: (name) => (name in values ? values[name] : null) });

test("validateProfileInput cleans and accepts a normal profile", () => {
  const result = validateProfileInput(
    form({ firstName: "  Alice ", lastName: "Exemple", displayName: "", program: " Programme   Grande École ", studyYear: "2" }),
  );
  assert.deepEqual(result, {
    ok: true,
    values: { firstName: "Alice", lastName: "Exemple", displayName: null, program: "Programme Grande École", studyYear: 2 },
  });
});

test("validateProfileInput reports each invalid field", () => {
  const result = validateProfileInput(
    form({ firstName: "", lastName: "x".repeat(61), displayName: "ok\u0007", studyYear: "12" }),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["displayName", "firstName", "lastName", "studyYear"]);
});

test("validateProfileInput ignores fields it does not know (no id from the browser)", () => {
  const result = validateProfileInput(form({ firstName: "A", lastName: "B", id: "someone-else", role: "admin" }));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.values).sort(), ["displayName", "firstName", "lastName", "program", "studyYear"]);
});

test("isOwnAvatarPath accepts only the user's own folder and generated names", () => {
  const me = "11111111-1111-4111-8111-111111111111";
  assert.equal(isOwnAvatarPath(`${me}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`, me), true);
  assert.equal(isOwnAvatarPath(`22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`, me), false);
  assert.equal(isOwnAvatarPath(`${me}/../other/x.webp`, me), false);
  assert.equal(isOwnAvatarPath(`${me}/mon-cv.html`, me), false);
});

test("sniffImage trusts the bytes, not the file name", async () => {
  const { sniffImage } = await import("./profile-input.ts");
  const bytes = (...values) => new Uint8Array(values);
  const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
  assert.equal(sniffImage(webp), "webp");
  assert.equal(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), "png");
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), "jpg");
  assert.equal(sniffImage(new Uint8Array(Buffer.from("<html><script>alert(1)</script>"))), null);
  assert.equal(sniffImage(bytes(0x4d, 0x5a, 0x90, 0x00)), null); // an .exe
  assert.equal(sniffImage(bytes()), null);
});

test("test accounts stay off unless AUTH_TEST_ACCOUNTS is exactly 'on'", () => {
  assert.equal(testAccountsEnabled({}), false);
  for (const value of ["", "1", "true", "ON", "yes", " on"]) assert.equal(testAccountsEnabled({ AUTH_TEST_ACCOUNTS: value }), false, value);
  assert.equal(testAccountsEnabled({ AUTH_TEST_ACCOUNTS: "on" }), true);
});

test("only the reserved fictional domain can use the test-account sign-in", () => {
  assert.equal(TEST_ACCOUNT_DOMAIN, "comptes.example.test");
  for (const ok of ["membre@comptes.example.test", "president-bde@comptes.example.test", "e2e.membre@comptes.example.test"]) {
    assert.equal(isTestAccountEmail(ok), true, ok);
  }
  for (const bad of [
    "prenom.nom@grenoble-em.com",
    "someone@gmail.com",
    "alice@student.example.test",
    "membre@comptes.example.test.evil.com",
    "membre@evil-comptes.example.test",
    "membre@sub.comptes.example.test",
    "Membre@comptes.example.test",
    "@comptes.example.test",
    "a b@comptes.example.test",
    "membre@comptes.example.test@gmail.com",
    "",
  ]) {
    assert.equal(isTestAccountEmail(bad), false, bad);
  }
});
