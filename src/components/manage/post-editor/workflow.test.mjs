// Unit tests for what the post editor offers to whom (workflow.ts): the same
// rules as the publishing functions of
// supabase/migrations/20261021092414_create_post_functions.sql, which check
// everything again. Run with `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isComplete, planWorkflow, previewHref } from "./workflow.ts";
import { postStage, SCHEDULE_ERROR_LABEL } from "../../../lib/posts/model.ts";

const POST = "11111111-1111-4111-8111-111111111111";
const V1 = "22222222-2222-4222-8222-222222222222";
const V2 = "33333333-3333-4333-8333-333333333333";

const NONE = { edit: false, approve: false, review_this: false, publish: false, upload: false, delete: false };
const AUTHOR = { ...NONE, edit: true, upload: true, delete: true };
const PUBLISHER = { ...NONE, edit: true, publish: true, upload: true, delete: true };
const APPROVER = { ...NONE, approve: true, review_this: true };

/** A post as public.post_editor describes it, with only what the rules read. */
function input({
  status = "draft",
  number = 1,
  can = AUTHOR,
  reviewMode = "approval",
  org = { status: "active", page_public: true },
  complete = true,
  post = {},
  history,
} = {}) {
  const working = { id: number === 1 ? V1 : V2, number, status };
  const p = {
    publication: "unpublished",
    published: null,
    schedule: null,
    hidden: null,
    slug: null,
    is_public: false,
    pinned: false,
    first_published_at: null,
    working,
    ...post,
  };
  return {
    stage: postStage(p),
    post: p,
    working,
    history: history ?? [working],
    reviewMode,
    organization: org,
    can,
    complete,
  };
}

test("an author without the publish right sends a complete draft for review", () => {
  const plan = planWorkflow(input());
  assert.equal(plan.submit, true);
  assert.equal(plan.publish, false);
  assert.equal(plan.schedule, false);
  assert.equal(plan.blocker, null);
  assert.equal(plan.delete, true);
  assert.match(plan.next, /envoie-le en relecture/);
});

test("approval mode: a publisher's own draft is not published directly", () => {
  const plan = planWorkflow(input({ can: PUBLISHER }));
  assert.equal(plan.publish, false);
  assert.equal(plan.schedule, false);
  assert.equal(plan.blocker, "approval_required");
  assert.equal(plan.submit, true);
});

test("direct mode: a publisher publishes or schedules the current draft, no review step", () => {
  const plan = planWorkflow(input({ can: PUBLISHER, reviewMode: "direct" }));
  assert.equal(plan.publish, true);
  assert.equal(plan.schedule, true);
  assert.equal(plan.submit, false);
  assert.equal(plan.blocker, null);
  assert.match(plan.next, /publie-le tout de suite ou programme-le/);
});

test("direct mode: an author without the publish right still sends for review", () => {
  const plan = planWorkflow(input({ reviewMode: "direct" }));
  assert.equal(plan.submit, true);
  assert.equal(plan.publish, false);
});

test("the association's page offline: no publication now, scheduling stays possible", () => {
  for (const org of [
    { status: "active", page_public: false },
    { status: "setup", page_public: false },
  ]) {
    const plan = planWorkflow(input({ can: PUBLISHER, reviewMode: "direct", org }));
    assert.equal(plan.publish, false);
    assert.equal(plan.schedule, true);
    assert.equal(plan.blocker, "page_not_public");
  }
});

test("a suspended or archived association neither publishes nor schedules", () => {
  for (const status of ["suspended", "archived"]) {
    const plan = planWorkflow(input({ can: PUBLISHER, reviewMode: "direct", org: { status, page_public: true } }));
    assert.equal(plan.publish, false);
    assert.equal(plan.schedule, false);
    assert.equal(plan.blocker, "organization_inactive");
  }
});

test("an incomplete text is neither published nor scheduled", () => {
  const plan = planWorkflow(input({ can: PUBLISHER, reviewMode: "direct", complete: false }));
  assert.equal(plan.publish, false);
  assert.equal(plan.schedule, false);
  assert.equal(plan.blocker, "incomplete");
});

test("a submitted version: reviewed by someone else, never by its writer, withdrawn by an editor", () => {
  const open = planWorkflow(input({ status: "submitted", can: APPROVER }));
  assert.equal(open.review, "open");
  assert.match(open.next, /À toi de relire/);

  const self = planWorkflow(input({ status: "submitted", can: { ...APPROVER, edit: true, review_this: false } }));
  assert.equal(self.review, "self");
  assert.equal(self.withdraw, true);

  const publisher = planWorkflow(input({ status: "submitted", can: PUBLISHER, reviewMode: "direct" }));
  assert.equal(publisher.publish, false, "a submission is never published directly, whatever the policy");
  assert.equal(publisher.blocker, "in_review");
  assert.equal(publisher.submit, false);
});

test("changes requested: no publication until a corrected version is sent again", () => {
  const plan = planWorkflow(input({ status: "changes_requested", can: PUBLISHER }));
  assert.equal(plan.publish, false);
  assert.equal(plan.submit, false);
  assert.equal(plan.blocker, "changes_requested");
});

test("an approved version is published or scheduled by a publisher", () => {
  const plan = planWorkflow(input({ status: "approved", can: PUBLISHER }));
  assert.equal(plan.publish, true);
  assert.equal(plan.schedule, true);
  const approverOnly = planWorkflow(input({ status: "approved", can: APPROVER }));
  assert.equal(approverOnly.publish, false);
  assert.equal(approverOnly.blocker, null);
});

test("hidden by moderation: nothing puts it back online", () => {
  const plan = planWorkflow(
    input({
      status: "approved",
      can: PUBLISHER,
      post: {
        publication: "archived",
        published: { id: V1, number: 1, title: "x" },
        slug: "x",
        first_published_at: "2026-10-01T10:00:00Z",
        hidden: { at: "2026-10-02T10:00:00Z", reason: "Raison" },
      },
    }),
  );
  assert.equal(plan.publish, false);
  assert.equal(plan.schedule, false);
  assert.equal(plan.online.unarchive, false);
  assert.equal(plan.online.pin, false);
  assert.equal(plan.online.unpublish, true, "taking it off the site stays possible");
});

test("the live version: what to do with an article online", () => {
  const live = {
    publication: "published",
    published: { id: V1, number: 1, title: "x" },
    slug: "un-article",
    is_public: true,
    first_published_at: "2026-10-01T10:00:00Z",
  };
  const plan = planWorkflow(input({ status: "approved", can: PUBLISHER, post: live }));
  assert.equal(plan.publish, false, "the version online is not published again");
  assert.equal(plan.blocker, null);
  assert.deepEqual(plan.online, { view: true, unpublish: true, archive: true, unarchive: false, pin: true, slug: true });
  assert.equal(plan.delete, true, "can.delete comes from the database (false once published)");

  const author = planWorkflow(input({ status: "approved", can: AUTHOR, post: live }));
  assert.deepEqual(author.online, { view: true, unpublish: false, archive: false, unarchive: false, pin: false, slug: false });
});

test("a pinned post can always be unpinned", () => {
  const plan = planWorkflow(
    input({
      status: "approved",
      can: PUBLISHER,
      post: { publication: "published", published: { id: V1, number: 1, title: "x" }, slug: "x", pinned: true, hidden: { at: "2026-10-02T10:00:00Z", reason: "Raison" } },
    }),
  );
  assert.equal(plan.online.pin, true);
});

test("a scheduled version: publish earlier, reschedule, cancel; the working one is not scheduled twice", () => {
  const scheduled = { at: "2026-10-24T16:00:00Z", status: "pending", error: null, attempts: 0, revision: 1 };
  const plan = planWorkflow(input({ status: "approved", can: PUBLISHER, post: { schedule: scheduled } }));
  assert.equal(plan.publish, false);
  assert.equal(plan.schedule, false);
  assert.equal(plan.scheduled.isWorking, true);
  assert.equal(plan.scheduled.revisionId, V1);
  assert.equal(plan.scheduled.publishNow, true);
  assert.equal(plan.scheduled.reschedule, true);
  assert.equal(plan.scheduled.cancel, true);
  assert.match(plan.next, /Publication automatique le samedi 24 octobre à 18:00/);

  // A newer draft beside the scheduled version (direct mode): it can be published or scheduled in its place.
  const v1 = { id: V1, number: 1, status: "approved" };
  const v2 = { id: V2, number: 2, status: "draft" };
  const newer = planWorkflow(
    input({ number: 2, can: PUBLISHER, reviewMode: "direct", post: { schedule: scheduled }, history: [v2, v1] }),
  );
  assert.equal(newer.scheduled.isWorking, false);
  assert.equal(newer.publish, true);
  assert.equal(newer.schedule, true);
});

test("a failed schedule says why, in words", () => {
  const failed = { at: "2026-10-24T16:00:00Z", status: "failed", error: "page_not_public", attempts: 2, revision: 1 };
  const plan = planWorkflow(input({ status: "approved", can: PUBLISHER, post: { schedule: failed } }));
  assert.equal(plan.scheduled.failed, true);
  assert.equal(plan.scheduled.error, SCHEDULE_ERROR_LABEL.page_not_public);
  assert.match(plan.next, /n'a pas eu lieu/);

  const unknown = planWorkflow(input({ status: "approved", can: AUTHOR, post: { schedule: { ...failed, error: "nope" } } }));
  assert.equal(unknown.scheduled.error, SCHEDULE_ERROR_LABEL.unexpected);
  assert.equal(unknown.scheduled.cancel, false);
  assert.match(unknown.next, /Préviens une personne qui peut publier/);
});

test("completeness: a title of three characters, and an introduction or a text", () => {
  assert.equal(isComplete("Gala", "", "Le texte"), true);
  assert.equal(isComplete("Gala", "Une intro", ""), true);
  assert.equal(isComplete("Ga", "Une intro", "Le texte"), false);
  assert.equal(isComplete("  Gala  ", "  ", " "), false);
});

test("preview links: the working version, a given version, at phone width", () => {
  assert.equal(previewHref(POST, undefined, false), `/campus/apercu/${POST}`);
  assert.equal(previewHref(POST, undefined, true), `/campus/apercu/${POST}?vue=telephone`);
  assert.equal(previewHref(POST, V1, true), `/campus/apercu/${POST}?version=${V1}&vue=telephone`);
});
