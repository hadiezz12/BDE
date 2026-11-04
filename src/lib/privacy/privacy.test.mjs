// Unit tests of the privacy words and the draft notice (Phase 14): every
// request kind, status and history step of the database has words; the
// form builder's flagged themes are the database's own list; the counts of
// "Mes données" are those the database returns; the draft notice is
// well-formed for the database's validator and carries no placeholder, no
// invented contact and no claim of compliance.
// Run with `npm run test:unit` (Node's built-in runner strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA_COUNT_LABEL,
  FORM_SENSITIVE_TERM,
  REQUEST_EVENT_LABEL,
  REQUEST_KIND_LABEL,
  REQUEST_KINDS,
  REQUEST_STATUS,
  dueDayIso,
} from "./labels.ts";
import { DRAFT_VERSION, NOTICE_SECTIONS, PENDING_FACTS } from "./notice.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(root, "supabase/migrations");
const migrations = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n"))
  .join("\n");

/** The values of a check constraint, from its last definition. */
function checkList(constraint) {
  const at = migrations.lastIndexOf(constraint);
  assert.ok(at >= 0, constraint);
  const block = migrations.slice(at, migrations.indexOf("))", at));
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const sorted = (a) => [...a].sort();

test("every request kind, status and history step has words", () => {
  assert.deepEqual(sorted(Object.keys(REQUEST_KIND_LABEL)), sorted(checkList("constraint privacy_requests_kind_check")));
  assert.deepEqual(sorted(REQUEST_KINDS.map((k) => k.key)), sorted(checkList("constraint privacy_requests_kind_check")));
  assert.deepEqual(sorted(Object.keys(REQUEST_STATUS)), sorted(checkList("constraint privacy_requests_status_check")));
  assert.deepEqual(sorted(Object.keys(REQUEST_EVENT_LABEL)), sorted(checkList("constraint privacy_request_events_action_check")));
});

test("the requests that need an explanation are the same here and in the database", () => {
  const body = migrations.slice(migrations.lastIndexOf("create or replace function public.submit_privacy_request"));
  const kinds = [...body.slice(0, body.indexOf("$$;", body.indexOf("$$") + 2)).matchAll(/p_kind in \(([^)]+)\) and char_length/g)]
    .flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
  assert.deepEqual(sorted(REQUEST_KINDS.filter((k) => k.needsDetails).map((k) => k.key)), sorted(kinds));
});

test("the form builder's flagged themes are the database's own list", () => {
  const body = migrations.slice(migrations.lastIndexOf("create or replace function private.form_sensitive_terms"));
  const terms = [...body.slice(0, body.indexOf("$$;", body.indexOf("$$") + 2)).matchAll(/^\s*\('([a-z_]+)', '/gm)].map((m) => m[1]);
  assert.ok(terms.length >= 10);
  assert.deepEqual(sorted(Object.keys(FORM_SENSITIVE_TERM)), sorted(terms));
});

test("Mes données counts what the database counts", () => {
  const body = migrations.slice(migrations.lastIndexOf("create or replace function private.personal_data_counts"));
  const keys = [...body.slice(0, body.indexOf("$$;", body.indexOf("$$") + 2)).matchAll(/^\s*'([a-z_]+)', /gm)].map((m) => m[1]);
  assert.deepEqual(sorted(Object.keys(DATA_COUNT_LABEL)), sorted(keys.filter((k) => k !== "photo")));
});

test("the draft notice passes the database's validator", () => {
  assert.ok(NOTICE_SECTIONS.length >= 1 && NOTICE_SECTIONS.length <= 40);
  for (const s of NOTICE_SECTIONS) {
    assert.ok(s.heading.length >= 1 && s.heading.length <= 120, s.heading);
    assert.ok(s.paragraphs.length >= 1 && s.paragraphs.length <= 30, s.heading);
    for (const p of s.paragraphs) assert.ok(p.length >= 1 && p.length <= 3000, p.slice(0, 40));
  }
  assert.match(DRAFT_VERSION, /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/);
});

test("the notice states no placeholder, invented contact or compliance claim", () => {
  const all = NOTICE_SECTIONS.flatMap((s) => [s.heading, ...s.paragraphs]).join("\n");
  assert.doesNotMatch(all, /\[|\]|TODO|XXX|INSERT|lorem/i, "no placeholder");
  assert.doesNotMatch(all, /@/, "no e-mail address (none was given)");
  assert.doesNotMatch(all, /\+33|0[1-9]( ?\d{2}){4}/, "no phone number");
  assert.doesNotMatch(all, /conforme|certifi|100 ?%/i, "no compliance or certification claim");
  // What is missing is said, item by item.
  assert.ok(PENDING_FACTS.length >= 5);
  for (const key of ["controller", "contact", "dpo", "bases", "retention", "hosting"]) {
    assert.ok(PENDING_FACTS.some((f) => f.key === key), key);
  }
});

test("the due day shown is the last day of the month allowed, not the next midnight", () => {
  // Stored: the start of 1 March (Paris) for a request received on 31 January.
  assert.equal(dueDayIso("2027-02-28T23:00:00.000Z").slice(0, 10), "2027-02-28");
});
