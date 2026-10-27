// Unit tests of the continuity words (Phase 11): every key the migrations
// know has its words, every alert says something specific, and the schema
// version the operations page compares with is the last migration.
// Run with `npm run test:unit` (Node's built-in runner strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BACKUP_KIND,
  ISSUE_KIND,
  JOB_INFO,
  JOB_WORDS,
  RECORD_HINT,
  RECORD_WORDS,
  RETENTION_HOUSEKEEPING,
  RETENTION_POLICY,
  SECURITY_CHECK,
  YEAR_AUTO_CHECK,
  YEAR_MANUAL_CHECK,
} from "./labels.ts";
import { LATEST_MIGRATION } from "./schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const S = path.join(root, "supabase/functions/_shared/notifications/");
const { notificationText, notificationPath } = await import(`file://${S.replace(/\\/g, "/")}catalog.ts`);
const files = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
const migrations = files.map((f) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8").replace(/\r\n/g, "\n")).join("\n");

/** The quoted keys of a `check (column in (...))` constraint, from its last definition. */
function checkList(constraint) {
  const at = migrations.lastIndexOf(constraint);
  assert.ok(at >= 0, `${constraint} was found`);
  const block = migrations.slice(at, migrations.indexOf("))", at));
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const sorted = (xs) => [...new Set(xs)].sort();

/** The body of a function, from its last definition to its closing $$. */
function body(signature) {
  const at = migrations.lastIndexOf(`create or replace ${signature}`);
  assert.ok(at >= 0, `${signature} was found`);
  return migrations.slice(at, migrations.indexOf("\n$$;", at));
}

test("every recurring job has a name, a description and a frequency", () => {
  const block = migrations.split("insert into public.scheduled_jobs (job_key, area, schedule, expected_every, critical, retryable, sort_order) values")[1];
  const jobs = [...block.slice(0, block.indexOf(";\n")).matchAll(/^\s*\('([a-z-]+)',/gm)].map((m) => m[1]);
  assert.equal(jobs.length, 10);
  assert.deepEqual(sorted(Object.keys(JOB_WORDS)), sorted(jobs));
  assert.deepEqual(sorted(Object.keys(JOB_INFO)), sorted(jobs));
  // The dispatcher runs exactly the catalog's jobs.
  const dispatched = [...body("function private.execute_job").matchAll(/when '([a-z-]+)' then/g)].map((m) => m[1]);
  assert.deepEqual(sorted(dispatched), sorted(jobs));
});

test("every governance issue, register line, backup check and retention policy has words", () => {
  assert.deepEqual(sorted(Object.keys(ISSUE_KIND)), sorted(checkList("constraint governance_issues_kind_check")));
  const records = checkList("constraint institutional_records_record_key_check");
  assert.deepEqual(sorted(Object.keys(RECORD_WORDS)), sorted(records));
  assert.deepEqual(sorted(Object.keys(RECORD_HINT)), sorted(records));
  assert.deepEqual(sorted(Object.keys(BACKUP_KIND)), sorted(checkList("constraint backup_verifications_kind_check")));
  assert.deepEqual(sorted(Object.keys(RETENTION_POLICY)), sorted(checkList("constraint retention_policies_policy_key_check")));
  const housekeeping = [...body("function private.retention_housekeeping").matchAll(/'key', '([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(housekeeping.length >= 8);
  for (const key of housekeeping) assert.ok(key in RETENTION_HOUSEKEEPING, key);
});

test("every check of the year's preparation and of the security self-check has words", () => {
  const keys = [...body("function private.academic_year_manual_checks").split("as $$")[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(Object.keys(YEAR_MANUAL_CHECK), keys, "same keys, same order");
  for (const fn of ["function private.academic_year_auto_checks", "function private.academic_year_platform_checks"]) {
    for (const [, key] of body(fn).matchAll(/'key', '([a-z_]+)'/g)) assert.ok(key in YEAR_AUTO_CHECK, key);
  }
  for (const office of ["bde_president", "bde_vice_president"]) assert.ok(`${office}_next` in YEAR_AUTO_CHECK);
  for (const [, key] of body("function public.security_health").matchAll(/'key', '([a-z_]+)'/g)) assert.ok(key in SECURITY_CHECK, key);
});

test("every alert that can be sent says something specific and leads to the right page", () => {
  const payloads = {
    bde_office_vacant: { office: "bde_vice_president" },
    association_president_vacant: { organization: "Asso test (exemple)" },
    succession_missing: { office: "association_president", ends_at: "2027-08-31T21:59:00Z" },
    transition_pending: { candidates_pending: 1, missing_approvals: ["bde_vice_president"], expires_at: "2027-06-01T10:00:00Z" },
    approver_missing: { count: 2 },
    reviewer_access_expiring: { count: 1, campaign: "Recrutement test (exemple)", ends_at: "2027-03-01T10:00:00Z" },
    guardian_missing: {},
    guardian_mfa_missing: {},
    officer_mfa_missing: {},
    job_unhealthy: { job: "governance-health", health: "late", last_succeeded_at: "2027-01-01T10:00:00Z" },
    renewal_due: { record: "domain", renewal_on: "2027-05-01" },
  };
  const fallback = notificationText("governance_issue_alert", { issue: "unknown" }).title;
  for (const issue of Object.keys(ISSUE_KIND)) {
    if (issue === "suspended_with_pending") continue; // information only: never sent
    const text = notificationText("governance_issue_alert", { organization: "Asso test (exemple)", ...payloads[issue], issue });
    assert.notEqual(text.title, fallback, issue);
    assert.ok(text.body.length > 20, issue);
  }
  assert.match(notificationText("governance_issue_alert", { ...payloads.transition_pending, issue: "transition_pending" }).body,
    /acceptation.*vice-présidence/);
  const ref = (target) => ({ kind: "governance_issue_alert", payload: { target, organization_slug: "asso-test" } });
  assert.equal(notificationPath(ref("association")), "/manage/asso-test/continuite");
  assert.equal(notificationPath(ref("platform")), "/manage/plateforme/continuite");
  assert.equal(notificationPath(ref("guardian")), "/manage/continuite");
  assert.equal(notificationPath(ref("self")), "/account/security");
  assert.equal(notificationPath(ref("operations")), "/manage/plateforme/continuite/operations");
  assert.equal(notificationPath({ kind: "governance_issue_alert", payload: { target: "association", organization_slug: "../x" } }), "/manage");
  assert.match(notificationText("platform_health_report", { week: "2026-W44", successions_missing: 1, backups_verified: 0 }).body, /1 succession à prévoir/);
  assert.match(notificationText("platform_health_report", { week: "2026-W44" }).body, /Rien à signaler/);
});

test("the schema version the operations page compares with is the last migration", () => {
  assert.equal(LATEST_MIGRATION, files.at(-1).slice(0, 14));
});
