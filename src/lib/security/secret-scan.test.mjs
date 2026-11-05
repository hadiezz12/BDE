import { test } from "node:test";
import assert from "node:assert/strict";
import { findSecrets } from "../../../scripts/secret-scan.mjs";

// Every value below is built at run time and fake: this file itself holds no secret-shaped text.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "supabase", ref: "fake" })}.${"s".repeat(43)}`;
const kinds = (text) => findSecrets(text).map((f) => f.what);

test("the scanner finds privileged credentials", () => {
  assert.deepEqual(kinds(`key = "${"sb_secret_" + "x".repeat(32)}"`), ["Supabase secret key"]);
  assert.deepEqual(kinds(`SUPABASE_SERVICE_ROLE_KEY=${jwt("service_role")}`), ["JWT"]);
  assert.deepEqual(kinds(`${"-----BEGIN"} PRIVATE KEY-----\nAAAA`), ["private key"]);
  assert.deepEqual(kinds(`DATABASE_URL=${"postgres" + "ql"}://postgres:${"p".repeat(12)}@db.example.test:5432/postgres`), ["database URL with a password"]);
  assert.deepEqual(kinds(`${"xkeysib-"}${"a".repeat(64)}-${"B".repeat(16)}`), ["Brevo API key"]);
  assert.deepEqual(kinds(`${"AKIA"}${"A".repeat(16)}`), ["AWS access key"]);
});

test("public values pass: the publishable key, an anon token, a URL without a password, prefix checks in code", () => {
  assert.deepEqual(kinds(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${"sb_publishable_" + "y".repeat(30)}`), []);
  assert.deepEqual(kinds(`anon = "${jwt("anon")}"`), []);
  assert.deepEqual(kinds(`${"postgres"}://localhost:5432/vpc_check`), []);
  assert.deepEqual(kinds(`if (key.startsWith("sb_secret_")) return true;`), []);
});
