import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { studyYearLabel } from "@/lib/auth/profile-input";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { getApplicationDetail } from "@/lib/recruitment/review-data";
import { teamState } from "@/lib/recruitment/review";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { loadReviewFrame, ReviewDenied, ReviewUnavailable } from "@/components/manage/review/ReviewFrame";
import {
  AnswersPanel,
  ClarificationsPanel,
  DecisionPanel,
  DiscussionPanel,
  HistoryPanel,
  InterviewsPanel,
  ReviewsPanel,
  TeamSide,
  at,
} from "@/components/manage/review/ApplicationPanels";

type Params = Promise<{ asso: string; campaign: string; application: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The candidate's name never goes into the tab title (history, shared screens).
export const metadata: Metadata = { title: "Candidature" };

/**
 * /manage/[asso]/recruitment/[campaign]/candidatures/[application] — one
 * application, for the recruitment team. public.recruitment_application
 * checks the person may open it (scope, conflicts, not a fellow candidate,
 * not their own), records the opening, and returns only what their powers
 * allow: files only with "documents", the others' reviews and the
 * discussion only with "view_team", the access log only with "committee".
 * The answers are shown against the form version they were filled on.
 */
export default async function ApplicationPage({ params }: { params: Params }) {
  const { asso, campaign, application } = await params;
  const frame = await loadReviewFrame(asso, campaign, "candidatures");
  if (!frame.ok) return frame.node;
  const { ctx, access, campaignId, has } = frame;
  if (!has("view")) return <ReviewDenied asso={asso} access={access} what="La lecture des candidatures" />;
  if (!UUID.test(application)) return <ReviewUnavailable asso={asso} message={governanceErrorMessage("application_not_found")} />;
  const detail = await getApplicationDetail(application.toLowerCase());
  if (!detail.ok) return <ReviewUnavailable asso={asso} message={governanceErrorMessage(detail.code)} />;
  const d = detail.data;
  if (d.campaign.id !== campaignId) redirect(routes.manageApplication(d.campaign.organization.slug, d.campaign.id, d.application.id));

  const readOnly = readOnlyReason(ctx);
  const writable = !readOnly && !access.archived;
  const aal2 = ctx.aal === "aal2";
  const c = d.candidate;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.display_name || d.application.reference;
  const withdrawn = d.application.status === "withdrawn";
  const decision = [...d.decisions].reverse().find((x) => x.status === "proposed" || x.status === "finalized" || x.status === "released") ?? null;
  const state = teamState({
    status: d.application.status,
    stage: d.pipeline?.stage ?? "new",
    decision: decision ? { id: decision.id, status: decision.status, outcome: decision.outcome } : null,
  });
  const decides = d.can.approve || d.can.release;

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Fil d'Ariane" className="type-small">
        <Link href={routes.manageApplications(asso, campaignId)} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
          <Icon name="arrow-left" size={14} />
          {access.title.trim() || "Recrutement"} · candidatures
        </Link>
      </nav>
      <ManagePageHeader
        kicker={`${d.position.title} · ${d.application.reference}`}
        title={name}
        description={
          <p>
            {[c.program, c.study_year ? studyYearLabel(c.study_year) : null].filter(Boolean).join(" · ") || "Programme non renseigné"}
          </p>
        }
        meta={
          <>
            <StatusBadge tone={withdrawn ? "neutral" : decision?.status === "released" ? "ok" : "info"}>{state}</StatusBadge>
            <span>Envoyée le {at(d.application.submitted_at)}</span>
            {d.application.withdrawn_at && <span>Retirée le {at(d.application.withdrawn_at)}</span>}
          </>
        }
      />
      <div className="flex flex-col gap-3">
        {readOnly && <ReadOnlyNotice reason={readOnly} />}
        {decides && !aal2 && <MfaNotice what="Valider, annoncer ou retirer une décision" />}
        {withdrawn && (
          <Notice tone="info" icon="info" title="Candidature retirée par la personne">
            <p>Ses réponses et ses fichiers ne sont plus consultables ; plus rien ne peut être décidé. L&apos;historique reste.</p>
          </Notice>
        )}
        <Notice tone="info" icon="lock" title="Confidentiel">
          <p>
            Cette page est notée dans l&apos;historique des accès. Ne copie pas les réponses ou les fichiers ailleurs (messageries,
            documents partagés, outils d&apos;IA) : tout se fait ici.
          </p>
        </Notice>
      </div>

      <div className="grid gap-x-10 gap-y-12 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-12 lg:col-span-8">
          <AnswersPanel d={d} />
          <ClarificationsPanel d={d} writable={writable} />
          <ReviewsPanel d={d} writable={writable} />
          <InterviewsPanel d={d} writable={writable} />
          <DiscussionPanel d={d} writable={writable} />
          <HistoryPanel d={d} />
        </div>
        <aside className="flex flex-col gap-10 lg:col-span-4 lg:self-start">
          <DecisionPanel d={d} writable={writable} aal2={aal2} />
          <TeamSide d={d} writable={writable} />
        </aside>
      </div>
    </div>
  );
}
