import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { formatDateLong } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getOrganizationContinuity, type HandoverItem } from "@/lib/continuity/data";
import { HANDOVER_AREA, OFFICE_WORDS, SUCCESSION_STATE } from "@/lib/continuity/labels";
import { TRANSITION_KIND_LABEL } from "@/lib/governance/labels";
import { setHandoverItem } from "@/app/actions/continuity";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { Notice } from "@/components/manage/governance/Notices";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { IssueList } from "@/components/continuity/ContinuityBlocks";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Passation" };

function metric(item: HandoverItem): string | null {
  if (item.metric === null || item.metric === undefined) return null;
  if (typeof item.metric === "object") {
    const state = (item.metric as { state?: string }).state;
    return state ? (SUCCESSION_STATE[state] ?? SUCCESSION_STATE.none).label : null;
  }
  return `En ce moment : ${item.metric}`;
}

/**
 * /manage/[asso]/continuite — the association's own continuity: its
 * presidency and what follows it, what ends soon, the work in progress
 * (counts only, never an applicant), the points the hourly check found, and
 * the handover checklist, each area ticked by the people who hold its key.
 * A handover never moves a password or an access: rights pass through
 * positions and appointments only.
 */
export default async function ManageHandoverPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const c = await getOrganizationContinuity(ctx.organization.id);
  if (!c) return <SectionDenied section="continuity" ctx={ctx} />;
  const state = SUCCESSION_STATE[c.succession.state] ?? SUCCESSION_STATE.none;
  const areas = [...new Set(c.handover.map((h) => h.area))];
  const doneCount = c.handover.filter((h) => h.done).length;

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={ctx.organization.shortName ?? ctx.organization.name}
        title="Passation"
        description={
          <p>
            Ce qu&apos;il faut pour que l&apos;asso continue quand l&apos;équipe change. Chaque personne garde son propre compte&nbsp;: les
            droits passent par les postes et les nominations, jamais par un mot de passe.
            {c.year && ` Année ${c.year.label}.`}
          </p>
        }
      />

      <ManageSection
        title="Présidence"
        action={
          c.can.succession ? (
            <ButtonLink href={routes.manageGovernance(asso)} size="sm" variant="secondary" icon="arrow-right">
              Gouvernance
            </ButtonLink>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3 rounded-md border border-line bg-raised px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <span className="font-semibold">{c.president ? c.president.name : "Personne"}</span>
              {c.president && (
                <span className="type-small text-muted">
                  {c.president.is_me ? " (toi)" : ""} · jusqu&apos;au {formatDateLong(c.president.ends_at)}
                </span>
              )}
            </span>
            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
          </div>
          {c.successor && (
            <p className="type-small">
              {c.successor.renewal ? "Mandat renouvelé." : `Ensuite : ${c.successor.name}, à partir du ${formatDateLong(c.president?.ends_at ?? "")}.`}
            </p>
          )}
          {c.transition && (
            <div className="flex flex-col gap-1 type-small">
              <p>
                {TRANSITION_KIND_LABEL[c.transition.kind as keyof typeof TRANSITION_KIND_LABEL] ?? c.transition.kind} en cours · effet le{" "}
                {formatDateLong(c.transition.effective_at)} · expire le {formatDateLong(c.transition.expires_at)} sans réponse.
              </p>
              <ul className="flex flex-wrap gap-x-4">
                {c.transition.candidates.map((p) => (
                  <li key={p.office}>
                    {OFFICE_WORDS[p.office] ?? p.office}&nbsp;: {p.name} ·{" "}
                    {p.accepted === true ? "a accepté" : p.accepted === false ? "a refusé" : "n'a pas encore répondu"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!c.successor && !c.transition && c.president && c.can.succession && (
            <p className="type-small text-muted">
              Propose ta succession depuis Gouvernance&nbsp;: la personne choisie accepte avec son propre compte, et son mandat commence
              à la date prévue. Tu gardes tes droits jusque-là.
            </p>
          )}
        </div>
      </ManageSection>

      <StatGroup label="En cours">
        <StatTile label="Mandats qui finissent dans 30 jours" value={c.counts.officers_expiring} />
        <StatTile label="Articles à relire" value={c.counts.pending_posts} />
        <StatTile label="Publications programmées" value={c.counts.scheduled_posts} />
        <StatTile label="Événements à venir" value={c.counts.upcoming_events} />
        <StatTile label="Recrutements" value={c.counts.active_campaigns} />
      </StatGroup>

      {c.officers_expiring && c.officers_expiring.length > 0 && (
        <ManageSection title="Mandats qui finissent bientôt" count={c.officers_expiring.length}>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
            {c.officers_expiring.map((o, k) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  <span className="font-semibold">{o.name}</span>
                  <span className="type-small text-muted"> · {o.position}</span>
                </span>
                <span className="type-small">{formatDateLong(o.ends_at)}</span>
              </li>
            ))}
          </ul>
        </ManageSection>
      )}

      {c.issues.length > 0 && (
        <ManageSection title="Points à régler" count={c.issues.length}>
          <IssueList issues={c.issues} target="association" empty="" />
        </ManageSection>
      )}

      <ManageSection title="Liste de passation" count={doneCount} description={`${doneCount} point${doneCount > 1 ? "s" : ""} fait${doneCount > 1 ? "s" : ""} sur ${c.handover.length}. Chaque domaine se coche par les personnes qui en ont la responsabilité.`}>
        {c.handover.length === 0 ? (
          <Notice title="La liste n'a pas pu être chargée." />
        ) : (
          <div className="flex flex-col gap-8">
            {areas.map((area) => (
              <div key={area} className="flex flex-col gap-3">
                <h3 className="type-label text-muted">{HANDOVER_AREA[area] ?? area}</h3>
                <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
                  {c.handover
                    .filter((h) => h.area === area)
                    .map((h) => (
                      <li key={h.key} className="flex flex-col gap-2 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{h.label}</span>
                          <StatusBadge tone={h.done ? "ok" : "neutral"}>{h.done ? "Fait" : "À faire"}</StatusBadge>
                        </div>
                        {h.help && <p className="type-small text-muted">{h.help}</p>}
                        <p className="flex flex-wrap gap-x-4 gap-y-1 type-small">
                          {metric(h) && <span>{metric(h)}</span>}
                          {h.assignee_name && <span>Pris en charge par {h.assignee_name}</span>}
                          {h.note && <span className="text-muted">« {h.note} »</span>}
                        </p>
                        {h.can_edit && (
                          <Disclosure summary="Mettre à jour" icon="edit">
                            <ActionForm action={setHandoverItem} hidden={{ organization_id: c.organization.id, item: h.key, slug: asso }} submitLabel="Enregistrer">
                              <Checkbox name="done" value="1" defaultChecked={h.done} label="C'est fait" />
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Qui s'en charge" optional>
                                  {({ id, describedBy }) => (
                                    <Select id={id} aria-describedby={describedBy} name="assignee" defaultValue={h.assignee_id ?? ""}>
                                      <option value="">Personne en particulier</option>
                                      {(c.members ?? []).map((m) => (
                                        <option key={m.user_id} value={m.user_id}>
                                          {m.name}
                                        </option>
                                      ))}
                                    </Select>
                                  )}
                                </Field>
                                <Field label="Note" optional>
                                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="note" maxLength={500} defaultValue={h.note ?? undefined} />}
                                </Field>
                              </div>
                            </ActionForm>
                          </Disclosure>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </ManageSection>
    </div>
  );
}
