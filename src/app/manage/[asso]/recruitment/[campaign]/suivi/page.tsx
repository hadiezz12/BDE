import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDayShort, formatTime, plural } from "@/lib/format";
import { getCampaignBoard } from "@/lib/recruitment/review-data";
import { APPROVAL_POLICY_LABEL, POWER_LABEL, ROLE_PRESETS, SCOPE_LABEL } from "@/lib/recruitment/review";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { Notice } from "@/components/manage/governance/Notices";
import { loadReviewFrame, ReviewDenied, ReviewHeader, ReviewUnavailable } from "@/components/manage/review/ReviewFrame";

type Params = Promise<{ asso: string; campaign: string }>;

export const metadata: Metadata = { title: "Suivi du recrutement" };

const when = (iso: string | null) => (iso ? `${formatDayShort(iso)} ${formatTime(iso)}` : "—");

/**
 * /manage/[asso]/recruitment/[campaign]/suivi — where the review of one
 * recruitment stands. public.recruitment_campaign_board counts only the
 * applications the person may open (their appointment's scope, or the
 * association's keys), so two people of the same committee can see
 * different numbers. Counts, never a name: the list is one tab away.
 */
export default async function ReviewBoardPage({ params }: { params: Params }) {
  const { asso, campaign } = await params;
  const frame = await loadReviewFrame(asso, campaign, "suivi");
  if (!frame.ok) return frame.node;
  const { access, campaignId, has } = frame;
  if (!has("view")) return <ReviewDenied asso={asso} access={access} what="Le suivi des candidatures" />;
  const board = await getCampaignBoard(campaignId);
  if (!board.ok) return <ReviewUnavailable asso={asso} message={governanceErrorMessage(board.code)} />;
  const { campaign: c, counts, positions, mine, member, rubric } = board.data;
  const list = routes.manageApplications(asso, campaignId);
  const active = counts.received - counts.withdrawn;

  return (
    <div className="flex flex-col gap-10">
      <ReviewHeader
        asso={asso}
        access={access}
        description={
          <p>
            Où en est la sélection : les candidatures que tu peux ouvrir, leurs évaluations, les entretiens et les décisions. Rien
            de tout cela n&apos;est visible des candidat·es, qui voient seulement « envoyée », « en cours d&apos;examen », puis ce qui
            leur est annoncé.
          </p>
        }
        actions={
          <ButtonLink href={list} icon="arrow-right">
            Les candidatures
          </ButtonLink>
        }
      />

      {member && (
        <ManageSection title="Ta nomination">
          <dl className="grid gap-x-8 gap-y-2 type-small sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-muted">Rôle</dt>
            <dd className="font-semibold">{ROLE_PRESETS[member.role].label}</dd>
            <dt className="text-muted">Périmètre</dt>
            <dd className="font-semibold">{SCOPE_LABEL[member.scope]}</dd>
            <dt className="text-muted">Jusqu&apos;au</dt>
            <dd className="font-semibold">{formatDayShort(member.ends_at)}</dd>
            <dt className="text-muted">Ce que tu peux faire</dt>
            <dd>{board.data.powers.map((p) => POWER_LABEL[p]).join(" · ")}</dd>
          </dl>
        </ManageSection>
      )}

      {(mine.assigned > 0 || mine.drafts > 0) && (
        <Notice
          tone={mine.assigned > mine.reviewed ? "warn" : "info"}
          icon="list"
          title={
            mine.assigned > mine.reviewed
              ? `${plural(mine.assigned - mine.reviewed, "candidature t'attend", "candidatures t'attendent")}`
              : "Tu as évalué tout ce qui t'a été confié"
          }
          action={
            <ButtonLink href={`${list}?evaluation=mine_todo`} size="sm" variant="secondary" icon="arrow-right">
              Mes évaluations
            </ButtonLink>
          }
        >
          <p>
            {plural(mine.assigned, "candidature confiée", "candidatures confiées")}, {mine.reviewed} évaluée{mine.reviewed > 1 ? "s" : ""}
            {mine.drafts > 0 ? `, ${plural(mine.drafts, "brouillon")} pas encore soumis` : ""}.
          </p>
        </Notice>
      )}

      {counts.received === 0 ? (
        <ManageEmpty as="h2" icon="users" title="Aucune candidature à ouvrir pour l'instant">
          <p>
            {c.state === "open" || c.state === "upcoming"
              ? "Les candidatures envoyées apparaîtront ici, dans la limite de ce qui t'est ouvert."
              : "Ce recrutement n'a reçu aucune candidature que tu puisses ouvrir."}
          </p>
        </ManageEmpty>
      ) : (
        <ManageSection title="Les candidatures" description={`Date limite : ${when(c.closes_at)}.`}>
          <StatGroup label="Où en sont les candidatures" columns={4}>
            <StatTile label="Envoyées" value={active} comparison={counts.withdrawn ? `${counts.withdrawn} retirée${counts.withdrawn > 1 ? "s" : ""} par la personne` : undefined} />
            <StatTile label="À examiner" value={counts.new + counts.under_review} comparison={`${counts.new} nouvelle${counts.new > 1 ? "s" : ""}`} tone="accent" />
            <StatTile label="Présélectionnées" value={counts.shortlisted} />
            <StatTile label="En entretien" value={counts.interview} comparison={`${counts.interviews_scheduled} entretien${counts.interviews_scheduled > 1 ? "s" : ""} prévu${counts.interviews_scheduled > 1 ? "s" : ""}`} />
          </StatGroup>
          <StatGroup label="Décisions" columns={3} className="mt-3">
            <StatTile label="Proposées, à valider" value={counts.decision_pending} tone={counts.decision_pending ? "accent" : "neutral"} />
            <StatTile label="Validées, pas annoncées" value={counts.finalized} />
            <StatTile label="Annoncées" value={counts.released} tone={counts.released ? "ok" : "neutral"} />
          </StatGroup>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 type-small font-semibold">
            <li>
              <Link className="underline underline-offset-2" href={`${list}?evaluation=none`}>
                Pas encore confiées
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-2" href={`${list}?evaluation=partial`}>
                Évaluations incomplètes
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-2" href={`${list}?etape=shortlisted`}>
                Présélectionnées
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-2" href={`${list}?etape=decision_pending`}>
                Décisions à valider
              </Link>
            </li>
          </ul>
        </ManageSection>
      )}

      {positions.length > 0 && counts.received > 0 && (
        <ManageSection title="Par poste" count={positions.length}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse type-small">
              <caption className="sr-only">Évaluations par poste</caption>
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">Poste</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Places</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Candidatures</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Pas confiées</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">En attente</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Incomplètes</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Complètes</th>
                  <th scope="col" className="py-2 font-semibold">Propositions</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-2.5 pr-4 text-left font-semibold">
                      <Link href={`${list}?poste=${p.id}`} className="hover:underline">
                        {p.title}
                      </Link>
                      {p.retired && <span className="ml-2 font-normal text-subtle">(retiré)</span>}
                    </th>
                    <td className="py-2.5 pr-4">{p.openings ?? "—"}</td>
                    <td className="py-2.5 pr-4">{p.total}</td>
                    <td className="py-2.5 pr-4">{p.not_assigned}</td>
                    <td className="py-2.5 pr-4">{p.awaiting}</td>
                    <td className="py-2.5 pr-4">{p.partial}</td>
                    <td className="py-2.5 pr-4">{p.complete}</td>
                    <td className="py-2.5">
                      {p.offers}
                      {p.openings !== null && p.offers > p.openings && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-warn">
                          <Icon name="alert" size={14} /> au-delà des places
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ManageSection>
      )}

      <ManageSection title="Les règles de ce recrutement">
        <dl className="grid gap-x-8 gap-y-2 type-small sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-muted">Évaluations par candidature</dt>
          <dd className="font-semibold">
            {c.required_reviews === 0 ? "Aucune exigée" : `${c.required_reviews} au moins avant une décision (sauf exception motivée)`}
          </dd>
          <dt className="text-muted">Validation des décisions</dt>
          <dd className="font-semibold">{APPROVAL_POLICY_LABEL[c.approval_policy]}</dd>
          <dt className="text-muted">Grille d&apos;évaluation</dt>
          <dd className="font-semibold">
            {rubric ? `Version ${rubric.number}, ${plural(rubric.criteria, "critère")}` : "Pas encore publiée : les évaluations se font sans notes, avec un avis et un commentaire."}
          </dd>
        </dl>
        {has("committee") && (
          <p className="type-small">
            <Link href={routes.manageCommittee(asso, campaignId)} className="font-semibold underline underline-offset-2">
              Modifier le comité, la grille et les règles
            </Link>
          </p>
        )}
        <p className="flex items-start gap-2 type-small text-muted">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          Les notes aident à comparer ; elles ne décident jamais. Chaque décision est proposée et validée par des personnes, avec
          leur nom dans l&apos;historique.
        </p>
      </ManageSection>
    </div>
  );
}
