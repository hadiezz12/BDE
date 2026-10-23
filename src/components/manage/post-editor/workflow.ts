/**
 * What the post editor offers, to whom, and what it says will happen next.
 * The same rules as the publishing functions
 * (supabase/migrations/20261021092414_create_post_functions.sql), read from
 * the person's rights, the association's editorial policy and the post's
 * state, so a button only shows when the database would accept it — the
 * database checks everything again anyway. Pure module (relative imports
 * only): the unit tests load it with plain Node.
 */

import type { EditorialSettings, PostEditor, RevisionInfo } from "../../../lib/posts/editor";
import type { PostStage, PostSummary, RevisionStatus } from "../../../lib/posts/model.ts";
import { SCHEDULE_ERROR_LABEL } from "../../../lib/posts/model.ts";
import { formatScheduled } from "../../../lib/posts/schedule.ts";
import { routes } from "../../../lib/routes.ts";

export interface WorkflowInput {
  stage: PostStage;
  post: Pick<PostSummary, "publication" | "published" | "schedule" | "hidden" | "slug" | "is_public" | "pinned">;
  working: Pick<RevisionInfo, "id" | "number" | "status">;
  history: Pick<RevisionInfo, "id" | "number" | "status">[];
  reviewMode: EditorialSettings["review_mode"];
  organization: Pick<PostEditor["organization"], "status" | "page_public">;
  can: PostEditor["can"];
  /** The saved content has what publication needs: a title (3 characters) and an introduction or text. */
  complete: boolean;
}

/**
 * Why the working version cannot be put online by this person right now.
 * page_not_public also covers an association still in setup: both can be
 * scheduled, and go out only if the page is online when the time comes.
 */
export type PublishBlocker =
  | "hidden"
  | "in_review"
  | "changes_requested"
  | "approval_required"
  | "incomplete"
  | "organization_inactive"
  | "page_not_public";

export interface ScheduledPlan {
  at: string;
  failed: boolean;
  /** The failure, in words (null while pending). */
  error: string | null;
  attempts: number;
  revisionNumber: number;
  /** Null when the scheduled version is no longer in the history (never expected). */
  revisionId: string | null;
  /** The scheduled version is the one being edited. */
  isWorking: boolean;
  cancel: boolean;
  reschedule: boolean;
  /** Put the scheduled version online now, earlier than planned. */
  publishNow: boolean;
}

export interface WorkflowPlan {
  /** One sentence: what happens next, for this person. */
  next: string;
  submit: boolean;
  withdraw: boolean;
  /** "open": this person reviews; "self": they may approve but wrote or sent this version. */
  review: "open" | "self" | null;
  /** Put the working version online now. */
  publish: boolean;
  /** Schedule the working version. */
  schedule: boolean;
  /** For a publisher: why publish / schedule are missing or partial (null: nothing in the way). */
  blocker: PublishBlocker | null;
  scheduled: ScheduledPlan | null;
  online: { view: boolean; unpublish: boolean; archive: boolean; unarchive: boolean; pin: boolean; slug: boolean };
  delete: boolean;
}

/** Title and words enough to be sent or published (private.publication_blocker: post_incomplete). */
export function isComplete(title: string, intro: string, bodyText: string): boolean {
  return title.trim().length >= 3 && (intro.trim().length > 0 || bodyText.trim().length > 0);
}

function nextStep(input: WorkflowInput, plan: Omit<WorkflowPlan, "next">): string {
  const { stage, post, can, reviewMode } = input;
  const draftNext =
    can.publish && reviewMode === "direct"
      ? "Quand c'est prêt, publie-le tout de suite ou programme-le : dans ton asso, les personnes qui publient n'ont pas besoin d'une relecture."
      : can.edit
        ? "Quand le texte est prêt, envoie-le en relecture : une personne qui peut approuver le relira avant la publication."
        : "Brouillon en cours d'écriture par l'équipe.";

  switch (stage) {
    case "hidden":
      return "Le BDE a masqué cet article : personne ne le voit, et rien de ce que fait l'asso ne le remet en ligne. Écris au BDE si tu penses que c'est une erreur.";
    case "failed": {
      const why = plan.scheduled?.error ?? SCHEDULE_ERROR_LABEL.unexpected;
      return can.publish
        ? `La publication programmée n'a pas eu lieu : ${why}. Règle le problème, puis reprogramme-la ou annule-la.`
        : `La publication programmée n'a pas eu lieu : ${why}. Préviens une personne qui peut publier.`;
    }
    case "scheduled":
      return `Publication automatique le ${formatScheduled(post.schedule!.at)}. ${
        post.publication === "published" ? "La version en ligne reste visible jusque-là." : "Rien n'est en ligne avant."
      }`;
    case "review":
      if (plan.review === "open") return "À toi de relire : approuve cette version exacte, ou demande des modifications avec une note.";
      if (plan.review === "self") return "Tu as écrit ou envoyé cette version : une autre personne qui peut approuver doit la relire.";
      return can.edit
        ? "En attente de relecture. Tu peux la retirer pour la modifier ; sinon, une personne qui peut approuver va la relire."
        : "En attente de relecture par une personne qui peut approuver.";
    case "changes":
      return can.edit
        ? "Des modifications ont été demandées : clique sur « Modifier », corrige, puis renvoie le texte en relecture."
        : "Des modifications ont été demandées à l'équipe.";
    case "approved":
      return can.publish
        ? "Approuvé : tu peux le publier maintenant ou le programmer."
        : "Approuvé : une personne qui peut publier va le mettre en ligne ou le programmer.";
    case "live":
      return can.edit
        ? "En ligne. Pour corriger, clique sur « Modifier » : tes changements restent un brouillon jusqu'à la prochaine publication."
        : "En ligne.";
    case "live_draft":
      return `La version n°${post.published?.number} reste en ligne pendant que vous travaillez sur celle-ci. ${draftNext}`;
    case "archived":
      return "Archivé : il n'apparaît plus dans le fil ni sur la page de l'asso, mais son lien marche toujours.";
    case "offline":
      return can.publish
        ? "Retiré du site : plus personne ne le voit. Publie-le à nouveau pour le remettre en ligne."
        : "Retiré du site : plus personne ne le voit.";
    default:
      return draftNext;
  }
}

export function planWorkflow(input: WorkflowInput): WorkflowPlan {
  const { post, working, can, organization } = input;
  const hidden = post.hidden !== null;
  const direct = input.reviewMode === "direct";
  const status: RevisionStatus = working.status;
  const workingOnline = post.published?.id === working.id && post.publication !== "unpublished";
  // private.authorize_revision: an approved version, or (direct publishing) the current draft.
  const authorizable = status === "approved" || (status === "draft" && direct);
  const scheduledRevision = post.schedule ? input.history.find((h) => h.number === post.schedule!.revision) ?? null : null;
  const scheduledIsWorking = scheduledRevision?.id === working.id;
  const canGoLiveNow = organization.status === "active" && organization.page_public;
  const closed = organization.status === "suspended" || organization.status === "archived";

  let blocker: PublishBlocker | null = null;
  if (can.publish && !workingOnline && !scheduledIsWorking) {
    if (hidden) blocker = "hidden";
    else if (status === "submitted") blocker = "in_review";
    else if (status === "changes_requested") blocker = "changes_requested";
    else if (!authorizable) blocker = "approval_required";
    else if (!input.complete) blocker = "incomplete";
    else if (closed) blocker = "organization_inactive";
    else if (!canGoLiveNow) blocker = "page_not_public";
  }
  const goesLive = can.publish && !workingOnline && !scheduledIsWorking && !hidden && authorizable && input.complete;

  const scheduled: ScheduledPlan | null = post.schedule
    ? {
        at: post.schedule.at,
        failed: post.schedule.status === "failed",
        error:
          post.schedule.status === "failed"
            ? SCHEDULE_ERROR_LABEL[post.schedule.error ?? "unexpected"] ?? SCHEDULE_ERROR_LABEL.unexpected
            : null,
        attempts: post.schedule.attempts,
        revisionNumber: post.schedule.revision,
        revisionId: scheduledRevision?.id ?? null,
        isWorking: scheduledIsWorking,
        cancel: can.publish,
        reschedule: can.publish && !hidden && scheduledRevision?.status === "approved",
        publishNow: can.publish && !hidden && scheduledRevision?.status === "approved" && canGoLiveNow,
      }
    : null;

  const plan: Omit<WorkflowPlan, "next"> = {
    submit: can.edit && status === "draft" && !(can.publish && direct),
    withdraw: can.edit && status === "submitted",
    review: status === "submitted" && can.approve ? (can.review_this ? "open" : "self") : null,
    publish: goesLive && canGoLiveNow,
    // Scheduling checks the page and the association when the time comes, not now.
    schedule: goesLive && !closed,
    blocker,
    scheduled,
    online: {
      view: post.is_public && Boolean(post.slug),
      unpublish: can.publish && post.publication !== "unpublished",
      archive: can.publish && post.publication === "published",
      unarchive: can.publish && post.publication === "archived" && !hidden,
      // Unpinning is always possible; pinning needs an article online.
      pin: can.publish && (post.pinned || (post.publication === "published" && !hidden)),
      slug: can.publish && Boolean(post.slug),
    },
    delete: can.delete,
  };
  return { ...plan, next: nextStep(input, plan) };
}

/** The private preview of a version, at computer or phone width (?vue=telephone, like the page preview). */
export function previewHref(postId: string, revisionId: string | undefined, phone: boolean): string {
  const base = routes.postPreview(postId, revisionId);
  return phone ? `${base}${base.includes("?") ? "&" : "?"}vue=telephone` : base;
}
