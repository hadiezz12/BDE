import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDayShort, plural } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { getMyRecruitmentWork } from "@/lib/recruitment/review-data";
import { campaignStage, STAGE_LABEL, STAGE_TONE } from "@/lib/recruitment/desk";
import { ROLE_PRESETS, SCOPE_LABEL, type WorkItem } from "@/lib/recruitment/review";
import type { CampaignState } from "@/lib/recruitment/model";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState } from "@/components/manage/ManageState";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";

export const metadata: Metadata = { title: "Mes évaluations" };

/**
 * /manage/evaluations — everything a person has to do in recruitment, across
 * associations: applications confided to them and not yet evaluated, their
 * interviews to come, decisions waiting for their approval. From
 * public.my_recruitment_work: only the campaigns where they hold a live
 * appointment or a reading key, counted within that access.
 */
export default async function MyReviewWorkPage() {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") {
    return (
      <ManageMain>
        <ManageGateState reason="login" />
      </ManageMain>
    );
  }
  const work = await getMyRecruitmentWork();
  const items = work.ok ? work.data : [];
  const current = items.filter((w) => !w.campaign.archived);
  const archived = items.filter((w) => w.campaign.archived);
  const todo = current.reduce((n, w) => n + w.to_review, 0);
  const approve = current.reduce((n, w) => n + (w.to_approve ?? 0), 0);

  return (
    <ManageMain>
      <div className="flex flex-col gap-10">
        <ManagePageHeader
          kicker="Recrutement"
          title="Mes évaluations"
          description={
            <p>
              Les recrutements où tu as été nommé·e, ou que ton poste te permet de lire : ce qui t&apos;attend dans chacun. Tu ne vois
              jamais les candidatures d&apos;une autre asso, ni celles d&apos;un recrutement auquel tu candidates toi-même.
            </p>
          }
          meta={
            current.length > 0 ? (
              <>
                <span>{plural(todo, "candidature à évaluer", "candidatures à évaluer")}</span>
                {approve > 0 && <span>{plural(approve, "décision à valider", "décisions à valider")}</span>}
              </>
            ) : undefined
          }
        />
        {!work.ok ? (
          <ManageEmpty as="h2" icon="alert" title="La liste ne s'est pas chargée">
            <p>{governanceErrorMessage(work.code)}</p>
          </ManageEmpty>
        ) : current.length === 0 ? (
          <ManageEmpty
            as="h2"
            icon="list"
            title="Rien à évaluer pour l'instant"
            actions={
              <ButtonLink href={routes.manage} variant="secondary" icon="arrow-left" iconPosition="start">
                Mes espaces
              </ButtonLink>
            }
          >
            <p>
              Quand une asso te nomme dans le comité d&apos;un recrutement, il apparaît ici, avec les candidatures qui te sont
              confiées.
            </p>
          </ManageEmpty>
        ) : (
          <ManageSection title="En cours" count={current.length}>
            <WorkList items={current} />
          </ManageSection>
        )}
        {archived.length > 0 && (
          <ManageSection title="Archivés" count={archived.length}>
            <WorkList items={archived} />
          </ManageSection>
        )}
      </div>
    </ManageMain>
  );
}

function WorkList({ items }: { items: WorkItem[] }) {
  return (
    <ul className="flex flex-col border-y border-line">
      {items.map((w) => {
        const stage = campaignStage({ state: w.campaign.state as CampaignState, hidden: null, archived_at: w.campaign.archived ? "archived" : null });
        const list = routes.manageApplications(w.organization.slug, w.campaign.id);
        return (
          <li key={w.campaign.id} className="grid gap-x-6 gap-y-3 border-b border-line py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="type-label text-muted">{w.organization.short_name ?? w.organization.name}</span>
                <StatusBadge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</StatusBadge>
              </span>
              <h3 className="type-card">
                <Link href={routes.manageCampaignReview(w.organization.slug, w.campaign.id)} className="hover:underline">
                  {w.campaign.title.trim() || "Recrutement sans titre"}
                </Link>
              </h3>
              <p className="type-small text-muted">
                {w.member
                  ? `${ROLE_PRESETS[w.member.role].label} · ${SCOPE_LABEL[w.member.scope].toLowerCase()} · jusqu'au ${formatDayShort(w.member.ends_at)}`
                  : "Par ton poste dans l'asso"}
              </p>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 type-small">
                {w.member && (
                  <li>
                    <span className="font-semibold">{w.to_review}</span> à évaluer sur {w.assigned} confiée{w.assigned > 1 ? "s" : ""}
                  </li>
                )}
                {w.interviews > 0 && (
                  <li>
                    <span className="font-semibold">{w.interviews}</span> entretien{w.interviews > 1 ? "s" : ""} à faire passer
                  </li>
                )}
                {w.to_approve !== null && w.to_approve > 0 && (
                  <li>
                    <span className="font-semibold">{w.to_approve}</span> décision{w.to_approve > 1 ? "s" : ""} à valider
                  </li>
                )}
                {w.submitted !== null && (
                  <li className="text-muted">{plural(w.submitted, "candidature envoyée", "candidatures envoyées")} au total</li>
                )}
              </ul>
            </div>
            <div className="flex flex-wrap items-start gap-2 md:justify-end">
              {w.to_review > 0 && (
                <ButtonLink href={`${list}?evaluation=mine_todo`} size="sm" icon="arrow-right">
                  Évaluer
                </ButtonLink>
              )}
              {w.to_approve !== null && w.to_approve > 0 && (
                <ButtonLink href={routes.manageDecisions(w.organization.slug, w.campaign.id)} size="sm" variant="secondary" icon="arrow-right">
                  Valider
                </ButtonLink>
              )}
              <ButtonLink href={list} size="sm" variant="ghost" icon="arrow-right">
                Candidatures
              </ButtonLink>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
