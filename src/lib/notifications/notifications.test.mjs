import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Phase 10: the notification centre's shared layer (supabase/functions/_shared/notifications),
 * used by the site and the notifications-worker Edge Function. Pure modules, no network.
 */

const S = "../../../supabase/functions/_shared/notifications/";
const { ALL_KINDS, notificationText, notificationPath, notificationAction, notificationReason } = await import(`${S}catalog.ts`);
const { renderNotificationEmail, escapeHtml } = await import(`${S}email.ts`);
const { brevoTransport, captureTransport, classifyBrevoResponse, parseAddress, retryAfterSeconds } = await import(`${S}transport.ts`);
const { runWorker, siteFrom } = await import(`${S}worker.ts`);
const { samplePayload, SAMPLE_UNSUBSCRIBE } = await import(`${S}samples.ts`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8"))
  .join("\n");

const site = new URL("https://site.example.test");
const TOKEN = "a".repeat(64);

/* ---- The catalog ------------------------------------------------------------------------------ */

test("the site has words for exactly the kinds the database catalog lists", () => {
  // Every insert into the catalog (Phase 10, then the kinds later phases add).
  const blocks = migrations.split("insert into public.notification_types (key, topic, importance, email, confidential, description) values").slice(1);
  assert.ok(blocks.length > 0, "the catalog insert was found");
  const kinds = blocks.flatMap((block) => [...block.slice(0, block.indexOf(";\n")).matchAll(/^\s*\('([a-z_]+)',/gm)].map((m) => m[1]));
  assert.ok(kinds.length > 50, `the catalog was read (${kinds.length})`);
  assert.deepEqual([...kinds].sort(), [...ALL_KINDS].sort());
});

test("every kind says something, leads to a page of the site and explains why it was sent", () => {
  for (const kind of ALL_KINDS) {
    const payload = samplePayload(kind, Date.UTC(2026, 10, 2, 9));
    const text = notificationText(kind, payload);
    assert.ok(text.title.length > 3 && text.title !== "Notification", kind);
    const where = notificationPath({ kind, payload, application_id: "0d000000-0000-4000-8000-000000000001", organization: { slug: "asso-test-exemple" } });
    assert.match(where, /^\/[a-z0-9/-]*$/, `${kind} → ${where}`);
    assert.ok(!where.includes("//") && !where.includes(".."), kind);
    assert.ok(notificationAction(kind).length > 2, kind);
    assert.ok(notificationReason(kind).length > 5, kind);
  }
});

test("a destination is rebuilt from validated values, never taken from a payload as is", () => {
  const base = { payload: {}, organization: null };
  assert.equal(notificationPath({ ...base, kind: "event_reminder", payload: { slug: "../../admin" } }), "/account/events");
  assert.equal(notificationPath({ ...base, kind: "campus_announcement", payload: { link: "https://evil.example.test/x" } }), "/account/notifications");
  assert.equal(notificationPath({ ...base, kind: "campus_announcement", payload: { link: "/events/soiree-test" } }), "/events/soiree-test");
  assert.equal(notificationPath({ ...base, kind: "followed_announcement", payload: { link: "/manage/x" } }), "/account/notifications");
  assert.equal(notificationPath({ ...base, kind: "application_submitted", application_id: "x' or 1=1" }), "/account/applications");
  assert.equal(
    notificationPath({ ...base, kind: "content_review_done", payload: { post_id: "not-a-uuid" }, organization: { slug: "asso-test" } }),
    "/manage/asso-test/content",
  );
  assert.equal(notificationPath({ ...base, kind: "recruitment_mention", payload: { link: "/manage/../../etc" } }), "/manage/evaluations");
  assert.equal(notificationPath({ ...base, kind: "account_mfa_disabled" }), "/account/security");
  assert.equal(notificationPath({ ...base, kind: "unknown_kind" }), "/account/notifications");
});

/* ---- E-mails ---------------------------------------------------------------------------------- */

test("an e-mail escapes every value and carries the unsubscribe headers only when it can be turned off", () => {
  const optional = renderNotificationEmail({
    kind: "campus_announcement",
    payload: { title: "<img src=x onerror=alert(1)>", body: "Texte & \"guillemets\"", link: "/events/soiree-test" },
    name: "Léa Exemple",
    site,
    essential: false,
    confidential: false,
    unsubscribe: TOKEN,
  });
  assert.ok(!optional.html.includes("<img"), "no raw markup");
  assert.ok(optional.html.includes("&lt;img"));
  assert.ok(optional.text.startsWith("Bonjour Léa,"));
  assert.ok(optional.html.includes("https://site.example.test/events/soiree-test"));
  assert.equal(optional.headers["List-Unsubscribe"], `<https://site.example.test/api/notifications/unsubscribe?t=${TOKEN}>`);
  assert.equal(optional.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(optional.html.includes("/account/notifications/reglages"));

  const essential = renderNotificationEmail({ kind: "event_cancelled", payload: { title: "Soirée (exemple)" }, name: null, site, essential: true, confidential: false, unsubscribe: TOKEN });
  assert.deepEqual(essential.headers, {}, "an essential message has no unsubscribe link");
  assert.match(essential.text, /qu'on ne peut pas désactiver/);

  const forged = renderNotificationEmail({ kind: "campus_announcement", payload: {}, name: null, site, essential: false, confidential: false, unsubscribe: "abc\"><script>" });
  assert.deepEqual(forged.headers, {}, "a malformed token is never written");
  const noSite = renderNotificationEmail({ kind: "campus_announcement", payload: {}, name: null, site: null, essential: false, confidential: false, unsubscribe: TOKEN });
  assert.ok(!noSite.html.includes("href="), "no site address: no link at all");
  assert.equal(escapeHtml("<a href='x'>"), "&lt;a href=&#39;x&#39;&gt;");
});

test("a confidential e-mail keeps its subject neutral and its details on the site", () => {
  const payload = { title: "Recrutement test", position: "Trésorerie", organization: "Asso test", reference: "K7Q2M9XA", message: "Mot privé" };
  const offer = renderNotificationEmail({
    kind: "recruitment_offer", payload, name: "Tom Exemple", site, essential: true, confidential: true, importance: "important",
    application_id: "0d000000-0000-4000-8000-000000000001",
  });
  assert.equal(offer.subject, "Du nouveau sur ta candidature");
  const refusal = renderNotificationEmail({
    kind: "recruitment_rejected", payload, name: "Tom Exemple", site, essential: true, confidential: true, importance: "normal",
    application_id: "0d000000-0000-4000-8000-000000000001",
  });
  assert.ok(!offer.html.includes("Important"), "no importance mark on a confidential e-mail");
  assert.equal(offer.text, refusal.text, "an offer and a refusal read the same in the inbox");
  assert.equal(offer.html, refusal.html);
  for (const secret of ["Trésorerie", "K7Q2M9XA", "Mot privé", "proposition"]) {
    assert.ok(!offer.text.toLowerCase().includes(secret.toLowerCase()), `no "${secret}" in the inbox`);
  }
  assert.ok(offer.html.includes("https://site.example.test/account/applications/0d000000-0000-4000-8000-000000000001"));
  const team = renderNotificationEmail({ kind: "recruitment_mention", payload: { ...payload, by_name: "Compte démo" }, name: null, site, essential: false, confidential: true });
  assert.equal(team.subject, "Recrutement : du nouveau dans ton espace de gestion");
  assert.ok(!team.text.includes("K7Q2M9XA"));
});

/* ---- Transport -------------------------------------------------------------------------------- */

test("Brevo's answers become the outcomes the database records", () => {
  assert.deepEqual(classifyBrevoResponse(201, { messageId: "<x@relay>" }, null), { outcome: "provider_accepted", messageId: "<x@relay>" });
  assert.deepEqual(classifyBrevoResponse(400, { message: "email is not valid in to" }, null), { outcome: "failed_permanent", error: "invalid_address" });
  assert.deepEqual(classifyBrevoResponse(400, { message: "sender is not valid" }, null), { outcome: "failed_permanent", error: "refused" });
  assert.deepEqual(classifyBrevoResponse(401, null, null), { outcome: "failed_retryable", error: "transport_auth" });
  assert.deepEqual(classifyBrevoResponse(402, null, null), { outcome: "failed_retryable", error: "transport_quota" });
  assert.deepEqual(classifyBrevoResponse(429, null, "120"), { outcome: "failed_retryable", error: "rate_limited", retryAfter: 120 });
  assert.deepEqual(classifyBrevoResponse(503, null, null), { outcome: "failed_retryable", error: "transport_down" });
  assert.equal(retryAfterSeconds("999999"), 6 * 3600, "capped at six hours");
  assert.equal(retryAfterSeconds(new Date(Date.now() + 90_000).toUTCString()) > 60, true);
  assert.equal(retryAfterSeconds("soon"), null);
});

test("the Brevo transport sends our key, never logs, and tells a lost answer from a refused connection", async () => {
  const mail = {
    id: 7,
    key: "0d000000-0000-4000-8000-0000000000cc",
    to: { email: "compte@example.test", name: "Compte démo" },
    from: { email: "bde@example.test", name: "Very Pink Club" },
    replyTo: null,
    rendered: { subject: "S", text: "T", html: "<p>H</p>", headers: { "List-Unsubscribe": "<https://site.example.test/u>" } },
  };
  let sent;
  const ok = brevoTransport({
    apiKey: "test-key",
    fetch: async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ messageId: "<m@relay>" }), { status: 201 });
    },
  });
  assert.deepEqual(await ok.send(mail), { outcome: "provider_accepted", messageId: "<m@relay>" });
  assert.equal(sent.init.headers["api-key"], "test-key");
  assert.equal(sent.body.headers["X-Mailin-custom"], mail.key);
  assert.equal(sent.body.headers["List-Unsubscribe"], "<https://site.example.test/u>");
  assert.deepEqual(sent.body.to, [{ email: "compte@example.test", name: "Compte démo" }]);

  const timeout = brevoTransport({ apiKey: "k", fetch: async () => { throw new DOMException("timed out", "TimeoutError"); } });
  assert.deepEqual(await timeout.send(mail), { outcome: "outcome_unknown", error: "timeout" });
  const refused = brevoTransport({ apiKey: "k", fetch: async () => { throw new TypeError("fetch failed"); } });
  assert.deepEqual(await refused.send(mail), { outcome: "failed_retryable", error: "transport_unreachable" });
});

test("addresses and the site's address are validated before use", () => {
  assert.deepEqual(parseAddress("Very Pink Club <bde@example.test>"), { email: "bde@example.test", name: "Very Pink Club" });
  assert.deepEqual(parseAddress("bde@example.test", "VPC"), { email: "bde@example.test", name: "VPC" });
  assert.equal(parseAddress("not an address"), null);
  assert.equal(parseAddress("a@b.c, d@e.f"), null);
  assert.equal(siteFrom("https://verypinkclub.example.test")?.origin, "https://verypinkclub.example.test");
  assert.equal(siteFrom("http://localhost:3020")?.origin, "http://localhost:3020");
  assert.equal(siteFrom("http://evil.example.test"), null, "plain http only for a local address");
  assert.equal(siteFrom("javascript:alert(1)"), null);
});

/* ---- The worker ------------------------------------------------------------------------------- */

function fakeDb(config, queue) {
  const calls = { claims: 0, completed: [], captured: [], runs: [], finished: [] };
  return {
    calls,
    async config() {
      return config;
    },
    async startRun(mode) {
      calls.runs.push(mode);
      return 1;
    },
    async finishRun(id, report) {
      calls.finished.push(report);
    },
    async claim(limit) {
      calls.claims += 1;
      return queue.splice(0, limit);
    },
    async complete(id, provider, result) {
      calls.completed.push({ id, provider, result });
      return result.outcome === "outcome_unknown" ? "failed_retryable" : result.outcome;
    },
    async capture(id, email) {
      calls.captured.push({ id, subject: email.subject });
    },
  };
}

const delivery = (id, extra = {}) => ({
  id,
  key: `0d000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  kind: "event_reminder",
  topic: "event_reminders",
  essential: false,
  confidential: false,
  importance: "normal",
  payload: { title: "Soirée (exemple)", slug: "soiree-exemple" },
  event_id: null,
  application_id: null,
  resource_type: null,
  resource_id: null,
  organization: null,
  email: "compte@example.test",
  name: "Compte démo",
  attempt: 1,
  unsubscribe: TOKEN,
  ...extra,
});

test("off: the worker claims nothing and records no run", async () => {
  const db = fakeDb({ mode: "off", email_from: null, reply_to: null, site_url: null }, [delivery(1)]);
  const report = await runWorker(db);
  assert.equal(report.claimed, 0);
  assert.equal(db.calls.claims, 0);
  assert.deepEqual(db.calls.runs, []);
});

test("capture: every claimed message is rendered and stored, then reported accepted", async () => {
  const db = fakeDb({ mode: "capture", email_from: null, reply_to: null, site_url: "http://localhost:3020" }, [delivery(1), delivery(2), delivery(3)]);
  const report = await runWorker(db, { batchSize: 2 });
  assert.equal(report.claimed, 3);
  assert.equal(report.accepted, 3);
  assert.deepEqual(db.calls.captured.map((c) => c.id), [1, 2, 3]);
  assert.ok(db.calls.completed.every((c) => c.provider === "capture" && c.result.outcome === "provider_accepted"));
  assert.equal(db.calls.finished.length, 1, "the run is recorded once");
});

test("live without a key or a complete configuration: nothing is claimed, the run says why", async () => {
  const noKey = fakeDb({ mode: "live", email_from: "VPC <bde@example.test>", reply_to: null, site_url: "https://site.example.test" }, [delivery(1)]);
  assert.equal((await runWorker(noKey)).error, "transport_not_configured");
  assert.equal(noKey.calls.claims, 0);
  const noSender = fakeDb({ mode: "live", email_from: null, reply_to: null, site_url: "https://site.example.test" }, [delivery(1)]);
  assert.equal((await runWorker(noSender, { brevoKey: "k" })).error, "config_incomplete");
  assert.equal(noSender.calls.claims, 0);
});

test("a transport that throws leaves an unknown outcome (retried later, never lost)", async () => {
  const db = fakeDb({ mode: "live", email_from: "VPC <bde@example.test>", reply_to: null, site_url: "https://site.example.test" }, [delivery(1)]);
  const transport = { name: "brevo", send: async () => { throw new Error("boom"); } };
  const report = await runWorker(db, { transport });
  assert.equal(db.calls.completed[0].result.outcome, "outcome_unknown");
  assert.equal(report.failed, 1);
});

test("the time budget stops claiming new batches", async () => {
  let clock = 0;
  const queue = Array.from({ length: 30 }, (_, i) => delivery(i + 1));
  const db = fakeDb({ mode: "capture", email_from: null, reply_to: null, site_url: null }, queue);
  const original = db.claim;
  db.claim = async (limit) => {
    clock += 6_000;
    return original(limit);
  };
  const report = await runWorker(db, { batchSize: 5, budgetMs: 15_000, now: () => clock });
  assert.equal(report.claimed, 15, "three batches in the budget, the rest waits for the next run");
});

test("the template preview uses obviously fictional values", () => {
  const p = samplePayload("campus_announcement");
  assert.match(String(p.title), /exemple/);
  assert.match(String(p.organization), /exemple/);
  assert.equal(SAMPLE_UNSUBSCRIBE, "0".repeat(64));
  assert.ok(captureTransport(async () => {}).name === "capture");
});
