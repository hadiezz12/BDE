// Unit tests for the governance words: refusal messages and date helpers.
// Run with `npm run test:unit` (Node's built-in runner strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GOVERNANCE_MESSAGES, governanceErrorCode, governanceErrorMessage } from "./messages.ts";
import { academicYearEnd, academicYearLabel, defaultMandateEnd, endOfParisDay, startOfParisDay, toDateInput, AUDIT_ACTION_LABEL } from "./labels.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  // Phase 4 onwards: the governance migrations.
  .filter((f) => f.endsWith(".sql") && f >= "20261019")
  .map((f) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8"))
  .join("\n");

// Raised only by table guards and postgres-only procedures: an RPC never lets
// them reach a person, so they fall back to the generic sentence on purpose.
const INTERNAL = new Set([
  "organization_kind_immutable",
  "organization_identity_immutable",
  "position_identity_immutable",
  "membership_identity_immutable",
  "assignment_identity_immutable",
  "assignment_closed",
  "assignment_cannot_be_extended",
  "audit_records_are_append_only",
  "bde_cannot_be_deleted",
  "bootstrap_invalid",
  "bootstrap_already_done",
  "office_does_not_match_organization",
]);

test("every refusal the database can raise has French words (or is internal on purpose)", () => {
  const raised = new Set([...migrations.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(raised.size > 40, "the migrations were read");
  const missing = [...raised].filter((code) => !(code in GOVERNANCE_MESSAGES) && !INTERNAL.has(code));
  assert.deepEqual(missing, []);
});

test("raised codes map to their own sentence", () => {
  for (const code of ["office_occupied", "mfa_required", "permission_ceiling", "invitation_expired"]) {
    assert.equal(governanceErrorCode({ code: "P0001", message: code }), code);
  }
  assert.match(governanceErrorMessage("mfa_required"), /double authentification/);
});

test("constraint errors become sentences, never Postgres text", () => {
  assert.equal(governanceErrorCode({ code: "23P01", message: 'conflicting key value violates exclusion constraint "x"' }), "assignment_overlap");
  assert.equal(governanceErrorCode({ code: "23505", message: "duplicate key" }), "conflict");
  assert.equal(governanceErrorCode({ code: "42501", message: "permission denied for function x" }), "insufficient_permission");
  assert.equal(governanceErrorCode({ code: "P0001", message: "something_new" }), "unexpected");
  assert.equal(governanceErrorCode({ code: "", message: "TypeError: fetch failed" }), "unavailable");
  assert.equal(governanceErrorCode(null), "unexpected");
  for (const text of Object.values(GOVERNANCE_MESSAGES)) {
    assert.doesNotMatch(text, /constraint|violates|SQL|P0001|uuid/i);
  }
});

const CATEGORIES = new Set(["organization", "team", "roles", "delegation", "leadership", "recovery", "bootstrap", "profile", "media", "catalog", "content", "moderation", "events"]);

test("every audited action has a sentence", () => {
  // Call shape: (actor, authority, action, category, …). The authority may be
  // a CASE expression and the action too, so read the string literals in
  // order: the actions are the snake_case ones before the category.
  const actions = new Set();
  for (const call of migrations.split("private.log_governance_event(").slice(1)) {
    const found = [];
    for (const [, compared, literal] of call.slice(0, call.indexOf(");")).matchAll(/(=\s*)?'([a-z_]+)'/g)) {
      if (compared) continue; // a CASE condition, not a value
      if (literal.includes("_")) found.push(literal);
      else if (CATEGORIES.has(literal) && found.length) break;
    }
    found.forEach((a) => actions.add(a));
  }
  assert.ok(actions.size > 20, `the audit calls were read (${actions.size})`);
  const missing = [...actions].filter((a) => !(a in AUDIT_ACTION_LABEL));
  assert.deepEqual(missing, []);
});

test("the default mandate ends on the next 31 August, 23:59 in Paris", () => {
  assert.equal(academicYearEnd(new Date("2026-10-19T10:00:00Z")).toISOString(), "2027-08-31T21:59:00.000Z");
  assert.equal(academicYearEnd(new Date("2027-03-01T10:00:00Z")).toISOString(), "2027-08-31T21:59:00.000Z");
  assert.equal(academicYearEnd(new Date("2027-09-02T10:00:00Z")).toISOString(), "2028-08-31T21:59:00.000Z");
  assert.equal(academicYearLabel(new Date("2027-08-31T21:59:00Z")), "2026–2027");
  assert.equal(academicYearLabel(new Date("2026-10-19T10:00:00Z")), "2026–2027");
  // A form opened in mid-August suggests the next academic year, still within 13 months.
  assert.equal(defaultMandateEnd(new Date("2027-08-10T10:00:00Z")).toISOString(), "2028-08-31T21:59:00.000Z");
  assert.equal(defaultMandateEnd(new Date("2027-03-01T10:00:00Z")).toISOString(), "2027-08-31T21:59:00.000Z");
});

test("date inputs are read as Paris days, summer and winter", () => {
  assert.equal(endOfParisDay("2027-08-31"), "2027-08-31T21:59:00.000Z");
  assert.equal(endOfParisDay("2027-01-15"), "2027-01-15T22:59:00.000Z");
  assert.equal(startOfParisDay("2027-01-15"), "2027-01-14T23:00:00.000Z");
  assert.equal(startOfParisDay("2027-07-01"), "2027-06-30T22:00:00.000Z");
  assert.equal(endOfParisDay("31/08/2027"), null);
  assert.equal(toDateInput(new Date("2027-08-31T21:59:00Z")), "2027-08-31");
});
