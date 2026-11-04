import { test } from "node:test";
import assert from "node:assert/strict";
import { contentSecurityPolicy, newNonce, supabaseConnectSources } from "./csp.ts";

const directives = (policy) => Object.fromEntries(policy.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

test("scripts run only with the request's nonce", () => {
  const nonce = newNonce();
  const d = directives(contentSecurityPolicy({ nonce, supabaseUrl: "https://abc.supabase.co" }));
  assert.deepEqual(d["script-src"], ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
  assert.ok(!d["script-src"].includes("'unsafe-inline'"));
  assert.ok(!d["script-src"].includes("'unsafe-eval'"), "no eval in production");
});

test("development only adds eval for React's debugging", () => {
  const d = directives(contentSecurityPolicy({ nonce: newNonce(), development: true }));
  assert.ok(d["script-src"].includes("'unsafe-eval'"));
});

test("the browser may talk to the site and to its own Supabase project only", () => {
  const d = directives(contentSecurityPolicy({ nonce: newNonce(), supabaseUrl: "https://abc.supabase.co" }));
  assert.deepEqual(d["connect-src"], ["'self'", "https://abc.supabase.co", "wss://abc.supabase.co"]);
  const local = directives(contentSecurityPolicy({ nonce: newNonce(), supabaseUrl: "http://127.0.0.1:54321" }));
  assert.deepEqual(local["connect-src"], ["'self'", "http://127.0.0.1:54321", "ws://127.0.0.1:54321"]);
  assert.deepEqual(supabaseConnectSources("javascript:alert(1)"), []);
  assert.deepEqual(supabaseConnectSources("not a url"), []);
  assert.deepEqual(supabaseConnectSources(undefined), []);
});

test("no plugin, no outside frame, no base or form hijack", () => {
  const d = directives(contentSecurityPolicy({ nonce: newNonce() }));
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["frame-src"], ["'self'"], "the page preview frames the site itself, nothing else");
  assert.deepEqual(d["frame-ancestors"], ["'self'"]);
  assert.deepEqual(d["base-uri"], ["'self'"]);
  assert.deepEqual(d["form-action"], ["'self'"]);
  assert.deepEqual(d["img-src"], ["'self'", "data:", "blob:"]);
});

test("nonces are fresh and well formed; a malformed one is refused", () => {
  const seen = new Set(Array.from({ length: 200 }, () => newNonce()));
  assert.equal(seen.size, 200);
  for (const n of seen) assert.match(n, /^[A-Za-z0-9+/=]{24}$/);
  assert.throws(() => contentSecurityPolicy({ nonce: "'; script-src *" }));
});
