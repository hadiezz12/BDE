import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { getDecisionBoard } from "@/lib/recruitment/review-data";
import { APPROVAL_POLICY_LABEL, OFFER_STATUS_LABEL, OUTCOME_SHORT, type DecisionBoard, type Power } from "@/lib/recruitment/review";
import { cancelScheduledRelease, orderWaitlist, releaseDecisions } from "@/app/actions/recruitment-review";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { loadReviewFrame, ReviewDenied, ReviewHeader, ReviewUnavailable } from "@/components/manage/review/ReviewFrame";
import { at } from "@/components/manage/review/ApplicationPanels";

type Params = Promise<{ asso: string; campaign: string }>;

export const metadata: Metadata = { title: "Décisions" };

type Row = DecisionBoard["decisions"][number];

/**
 * /manage/[asso]/recruitment/[campaign]/decisions — the decisions of a
 * recruitment, from proposal to announcement. Proposed decisions wait for
 * the approvals the campaign's policy requires (each one checked, with the
 * places left, under the position's lock); validated decisions stay internal
 * until someone with the "release" power announces them, now or at a set
 * time, in one go. Nothing here is decided by a score.
 */
export default async function DecisionsPage({ params }: { params: Params }) {
  const { asso, campaign } = await params;
  const frame = await loadReviewFrame(asso, campaign, "decisions");
  if (!frame.ok) return frame.node;
  const { ctx, access, campaignId, has } = frame;
  if (!(["propose", "approve", "release", "view_team"] as Power[]).some(has)) {
    return <ReviewDenied asso={asso} access={access} what="Le suivi des décisions" />;
  }
  const board = await getDecisionBoard(campaignId);
  if (!board.ok) return <ReviewUnavailable asso={asso} message={governanceErrorMessage(board.code)} />;
  const { campaign: c, positions, decisions, ready, president_name } = board.data;
  const readOnly = readOnlyReason(ctx);
  const writable = !readOnly && !access.archived;
  const aal2 = ctx.aal === "aal2";
  const proposed = decisions.filter((d) => d.status === "proposed");
  const finalized = decisions.filter((d) => d.status === "finalized");
  const released = decisions.filter((d) => d.status === "released");
  const releasable = finalized.filter((d) => d.can_release && d.application_status === "submitted");
  const waitlist = decisions.filter((d) => d.outcome === "waitlist" && d.application_status === "submitted");
  const link = (d: { application_id: string }) => routes.manageApplication(asso, campaignId, d.application_id);

  return (
    <div className="flex flex-col gap-10">
      <ReviewHeader
        asso={asso}
        access={access}
        description={
          <p>
            Une décision est proposée, validée ({APPROVAL_POLICY_LABEL[c.approval_policy].toLowerCase()}
            {c.approval_policy === "president" && president_name ? `, présidence : ${president_name}` : ""}), puis annoncée. Avant
            l&apos;annonce, la personne voit seulement « en cours d&apos;examen ».
          </p>
        }
      />
      <div className="flex flex-col gap-3 empty:hidden">
        {readOnly && <ReadOnlyNotice reason={readOnly} />}
        {(has("approve") || has("release")) && !aal2 && <MfaNotice what="Valider ou annoncer des décisions" />}
      </div>

      <ManageSection title="Places par poste">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse type-small">
            <caption className="sr-only">Propositions et places par poste</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">Poste</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Places</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Propositions en cours ou acceptées</th>
                <th scope="col" className="py-2 font-semibold">Acceptées</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="py-2.5 pr-4 text-left font-semibold">{p.title}</th>
                  <td className="py-2.5 pr-4">{p.openings ?? "Non fixé"}</td>
                  <td className={p.openings !== null && p.offers > p.openings ? "py-2.5 pr-4 font-bold text-warn" : "py-2.5 pr-4"}>{p.offers}</td>
                  <td className="py-2.5">{p.accepted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ManageSection>

      {ready && ready.length > 0 && (
        <ManageSection title="Évaluées, sans décision" count={ready.length} description="Assez d'évaluations pour proposer une décision : elle se propose depuis la candidature.">
          <ul className="flex flex-col border-y border-line">
            {ready.map((r) => (
              <li key={r.application_id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 last:border-b-0">
                <span>
                  <Link href={link(r)} className="font-bold hover:underline">
                    {r.name}
                  </Link>
                  <span className="type-small text-muted"> · {r.position}</span>
                </span>
                <span className="type-meta text-subtle">{plural(r.reviews, "évaluation")}</span>
              </li>
            ))}
          </ul>
        </ManageSection>
      )}

      <ManageSection title="À valider" count={proposed.length}>
        {proposed.length === 0 ? (
          <p className="type-small text-muted">Aucune décision n&apos;attend de validation.</p>
        ) : (
          <DecisionList rows={proposed} link={link} required={c.required_reviews} />
        )}
      </ManageSection>

      <ManageSection title="Validées, pas encore annoncées" count={finalized.length}>
        {finalized.length === 0 ? (
          <p className="type-small text-muted">Aucune.</p>
        ) : writable && releasable.length > 0 ? (
          <ActionForm action={releaseDecisions} submitLabel={aal2 ? "Annoncer les décisions cochées" : "Annoncer (double authentification requise)"}>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-[0.95rem] font-bold">Lesquelles annoncer</legend>
              {finalized.map((d) =>
                releasable.includes(d) ? (
                  <Checkbox
                    key={d.id}
                    name="decision_ids"
                    value={d.id}
                    label={`${d.name} · ${OUTCOME_SHORT[d.outcome]} · ${d.position.title}`}
                    description={d.release_scheduled_at ? `Annonce programmée le ${at(d.release_scheduled_at)}` : undefined}
                  />
                ) : (
                  <p key={d.id} className="type-small text-muted">
                    {d.name} · {OUTCOME_SHORT[d.outcome]} (pas dans ta nomination ou retirée)
                  </p>
                ),
              )}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Réponse aux propositions attendue avant le" optional hint="Pour les personnes retenues. Vide : pas de date limite.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="expires_date" />}
              </Field>
              <Field label="à" hint="Heure de Paris.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="time" name="expires_time" defaultValue="18:00" />}
              </Field>
              <Field label="Annoncer plus tard, le" optional hint="Vide : tout de suite. Les annonces programmées partent à l'heure dite (à 5 minutes près).">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="at_date" />}
              </Field>
              <Field label="à" hint="Heure de Paris.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="time" name="at_time" defaultValue="18:00" />}
              </Field>
            </div>
          </ActionForm>
        ) : (
          <DecisionList rows={finalized} link={link} required={c.required_reviews} />
        )}
        {writable &&
          finalized
            .filter((d) => d.release_scheduled_at && d.can_release)
            .map((d) => (
              <ActionForm
                key={d.id}
                action={cancelScheduledRelease}
                hidden={{ decision_id: d.id }}
                submitLabel={`Déprogrammer l'annonce pour ${d.name}`}
                variant="ghost"
                size="sm"
                inline
              />
            ))}
      </ManageSection>

      <ManageSection title="Annoncées" count={released.length}>
        {released.length === 0 ? (
          <ManageEmpty icon="mail" title="Aucune décision annoncée">
            <p>Une fois annoncée, la décision apparaît dans l&apos;espace de la personne, avec la réponse attendue si elle est retenue.</p>
          </ManageEmpty>
        ) : (
          <DecisionList rows={released} link={link} required={c.required_reviews} />
        )}
      </ManageSection>

      {waitlist.length > 1 && has("propose") && writable && (
        <ManageSection title="Ordre de la liste d'attente" count={waitlist.length}>
          <Notice tone="info" icon="info" title="L'ordre aide l'équipe, il ne décide rien">
            <p>
              Si une place se libère, rien ne se fait tout seul : quelqu&apos;un propose de retenir la personne suivante, et la décision se
              valide comme les autres.
            </p>
          </Notice>
          <ActionForm action={orderWaitlist} hidden={{ campaign_id: campaignId }} submitLabel="Enregistrer l'ordre" className="max-w-xl">
            <ol className="flex flex-col gap-2">
              {[...waitlist]
                .sort((a, b) => (a.waitlist_rank ?? 999) - (b.waitlist_rank ?? 999))
                .map((d, i) => (
                  <li key={d.id} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      name={`rank_${d.id}`}
                      defaultValue={d.waitlist_rank ?? i + 1}
                      aria-label={`Rang de ${d.name}`}
                      className="min-h-10"
                    />
                    <span className="type-small">
                      <span className="font-semibold">{d.name}</span> · {d.position.title}
                    </span>
                  </li>
                ))}
            </ol>
          </ActionForm>
        </ManageSection>
      )}
    </div>
  );
}

function DecisionList({ rows, link, required }: { rows: Row[]; link: (d: Row) => string; required: number }) {
  return (
    <ul className="flex flex-col border-y border-line">
      {rows.map((d) => (
        <li key={d.id} className="grid gap-x-6 gap-y-1 border-b border-line py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Link href={link(d)} className="font-bold hover:underline">
                {d.name}
              </Link>
              <StatusBadge tone={d.outcome === "offer" ? "ok" : d.outcome === "waitlist" ? "info" : "neutral"}>{OUTCOME_SHORT[d.outcome]}</StatusBadge>
              {d.application_status === "withdrawn" && <StatusBadge tone="neutral">Retirée par la personne</StatusBadge>}
            </span>
            <span className="type-small text-muted">
              {d.position.title} · {d.reference} · {d.reviews}/{required} évaluation{required > 1 ? "s" : ""}
              {d.waitlist_rank !== null && d.outcome === "waitlist" ? ` · rang ${d.waitlist_rank}` : ""}
            </span>
          </div>
          <div className="flex flex-col gap-1 type-small md:items-end">
            {d.status === "proposed" && (
              <span className="text-muted">
                Proposée {at(d.proposed_at)}
                {d.proposed_by_name ? ` par ${d.proposed_by_name}` : ""} · {plural(d.approvals, "approbation")}
                {d.approved_by_me ? " (dont la tienne)" : ""}
              </span>
            )}
            {d.status === "finalized" && <span className="text-muted">Validée {d.finalized_at ? at(d.finalized_at) : ""}</span>}
            {d.status === "released" && (
              <span className="text-muted">
                Annoncée {d.released_at ? at(d.released_at) : ""}
                {d.offer ? ` · ${OFFER_STATUS_LABEL[d.offer.status]}` : ""}
                {d.offer?.status === "pending" && d.offer.expires_at ? ` (avant le ${at(d.offer.expires_at)})` : ""}
                {d.offer?.onboarding ? " · invitée dans l'équipe" : ""}
              </span>
            )}
            {d.status === "proposed" && d.can_approve && !d.approved_by_me && (
              <Link href={link(d)} className="font-semibold underline underline-offset-2">
                Relire et valider
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
