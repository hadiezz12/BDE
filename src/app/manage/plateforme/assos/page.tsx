import type { Metadata } from "next";
import { formatDateLong, plural } from "@/lib/format";
import { ACCENTS, ACCENT_KEYS } from "@/lib/accents";
import { ASSOCIATION_CATEGORY_LABEL } from "@/lib/format";
import { getPlatformOrganizations } from "@/lib/governance/queries";
import { getMyAccess } from "@/lib/governance/access";
import { defaultMandateEnd, ORGANIZATION_STATUS_LABEL, toDateInput, TRANSITION_KIND_LABEL } from "@/lib/governance/labels";
import type { PlatformOrganization } from "@/lib/governance/types";
import {
  createOrganization,
  endOfficeMandate,
  proposeAssociationAppointment,
  setOrganizationStatus,
} from "@/app/actions/governance";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { Notice } from "@/components/manage/governance/Notices";

type Search = Promise<{ cree?: string }>;

export const metadata: Metadata = { title: "Assos" };

/** Status changes the database accepts (public.set_organization_status). */
const NEXT_STATUS: Record<PlatformOrganization["status"], { value: string; label: string }[]> = {
  setup: [
    { value: "active", label: "Active (visible du public)" },
    { value: "archived", label: "Archivée (retirée)" },
  ],
  active: [
    { value: "suspended", label: "Suspendue (lecture seule pour son équipe)" },
    { value: "archived", label: "Archivée (retirée)" },
  ],
  suspended: [
    { value: "active", label: "Active (visible du public)" },
    { value: "archived", label: "Archivée (retirée)" },
  ],
  archived: [{ value: "active", label: "Active (de nouveau)" }],
};

const STATUS_TONE: Record<PlatformOrganization["status"], StatusTone> = {
  active: "ok",
  setup: "info",
  suspended: "warn",
  archived: "neutral",
};

/**
 * /manage/plateforme/assos — every organization: create one (it starts "en
 * préparation", invisible to the public, with an empty presidency), publish,
 * suspend or archive it, name a president when there is none, or end a
 * presidency in an emergency. Each action is a database function checking
 * the BDE platform rights, a second factor and (for emergencies) a reason.
 */
export default async function PlatformOrganizationsPage({ searchParams }: { searchParams: Search }) {
  const { cree } = await searchParams;
  const [list, access] = await Promise.all([getPlatformOrganizations(), getMyAccess()]);
  if (!list.ok) {
    return (
      <Notice tone="danger" icon="alert" title="La liste des assos n'a pas pu être chargée.">
        <p>Réessaie dans un instant.</p>
      </Notice>
    );
  }
  const can = (key: string) => Boolean(access?.platform.includes(key));
  const associations = list.data.filter((o) => o.kind === "association");

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Assos"
        description={
          <p>
            Une asso créée ici démarre en préparation&nbsp;: invisible du public, avec une présidence vide. Nomme sa présidence, puis
            rends-la active quand elle est prête.
          </p>
        }
      />
      {cree && <Notice tone="info" icon="check" title={`Asso créée (${cree}). Prochaine étape : nommer sa présidence.`} />}

      {can("platform.organizations.manage") && (
        <ManageSection title="Créer une asso">
          <Disclosure summary="Nouvelle asso" icon="plus" tone="primary">
            <ActionForm action={createOrganization} submitLabel="Créer l'asso">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nom">
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="name" required maxLength={120} />}
                </Field>
                <Field label="Nom court" optional hint="Pour les espaces étroits.">
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="short_name" maxLength={24} />}
                </Field>
                <Field label="Adresse de la page" hint="Lettres minuscules, chiffres et tirets : /associations/…">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} spellCheck={false} />
                  )}
                </Field>
                <Field label="Catégorie">
                  {({ id, describedBy }) => (
                    <Select id={id} aria-describedby={describedBy} name="category" defaultValue="autre">
                      {Object.entries(ASSOCIATION_CATEGORY_LABEL)
                        .filter(([key]) => key !== "bde")
                        .map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
                <Field label="Couleur">
                  {({ id, describedBy }) => (
                    <Select id={id} aria-describedby={describedBy} name="accent" defaultValue="rose">
                      {ACCENT_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {ACCENTS[key].label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Phrase d'accroche" optional>
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="tagline" maxLength={160} />}
                </Field>
              </div>
            </ActionForm>
          </Disclosure>
        </ManageSection>
      )}

      <ManageSection title="Toutes les assos" count={associations.length}>
        {associations.length ? (
          <ul className="flex flex-col gap-3">
            {associations.map((o) => (
              <li key={o.id} id={`asso-${o.slug}`} data-accent={o.accent} className="scroll-mt-24 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <AssociationLogo association={{ name: o.name, shortName: o.short_name ?? undefined, accent: o.accent }} size={40} />
                    <div className="min-w-0">
                      {/* No link into the workspace: leading the BDE gives no access to an association's own space. */}
                      <h3 className="type-card">{o.name}</h3>
                      <p className="type-meta text-subtle">
                        /{o.slug} · {plural(o.members, "membre")}
                        {o.open_transition && <> · {TRANSITION_KIND_LABEL[o.open_transition]} en cours</>}
                      </p>
                    </div>
                  </div>
                  <StatusBadge tone={STATUS_TONE[o.status]}>{ORGANIZATION_STATUS_LABEL[o.status]}</StatusBadge>
                </div>
                <p className="mt-3 type-small">
                  {o.president ? (
                    <>
                      Présidence&nbsp;: <span className="font-semibold">{o.president.name}</span>, jusqu&apos;au {formatDateLong(o.president.ends_at)}
                    </>
                  ) : (
                    <span className="font-semibold text-danger">Sans présidence</span>
                  )}
                </p>
                {o.status_reason && <p className="type-meta text-subtle">Motif du statut&nbsp;: {o.status_reason}</p>}

                <div className="mt-4 flex flex-col gap-2">
                    {o.status !== "archived" && !o.president && !o.open_transition && can("platform.associations.intervene") && (
                      <Disclosure summary="Nommer une présidence" icon="user" tone="primary">
                        <ActionForm action={proposeAssociationAppointment} hidden={{ organization_id: o.id }} submitLabel="Proposer" resetOnDone>
                          <p className="type-small text-muted">
                            La personne doit avoir un compte. Elle accepte depuis son espace (Invitations), avec la double authentification.
                          </p>
                          <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Adresse e-mail">
                              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" name="candidate_email" required autoComplete="off" spellCheck={false} />}
                            </Field>
                            <Field label="Fin du mandat" hint="13 mois au plus.">
                              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" required defaultValue={toDateInput(defaultMandateEnd())} />}
                            </Field>
                          </div>
                          <Field label="Raison" hint="Elle reste dans l'historique.">
                            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" required minLength={3} maxLength={500} className="min-h-20" placeholder="Ex : élection du nouveau bureau" />}
                          </Field>
                        </ActionForm>
                      </Disclosure>
                    )}
                    {o.status !== "archived" && o.president && can("platform.associations.intervene") && (
                      <Disclosure summary="Mettre fin à la présidence (urgence)" icon="alert" tone="danger">
                        <ActionForm action={endOfficeMandate} hidden={{ assignment_id: o.president.assignment_id }} submitLabel="Mettre fin au mandat" variant="danger">
                          <p className="type-small text-muted">
                            Pour un compte compromis, un abandon de poste ou une décision du BDE. Le poste devient vacant tout de suite&nbsp;;
                            nomme ensuite une nouvelle présidence.
                          </p>
                          <Field label="Raison" hint="Obligatoire, gardée dans l'historique.">
                            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" required minLength={3} maxLength={500} className="min-h-20" />}
                          </Field>
                        </ActionForm>
                      </Disclosure>
                    )}
                    {can("platform.organizations.manage") && (
                      <Disclosure summary="Changer le statut" icon="sliders">
                        <ActionForm action={setOrganizationStatus} hidden={{ organization_id: o.id }} submitLabel="Appliquer">
                          <Field label="Nouveau statut">
                            {({ id, describedBy }) => (
                              <Select id={id} aria-describedby={describedBy} name="status" defaultValue={NEXT_STATUS[o.status][0].value}>
                                {NEXT_STATUS[o.status].map((n) => (
                                  <option key={n.value} value={n.value}>
                                    {n.label}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                          <Field label="Raison" optional hint="Obligatoire pour suspendre ou archiver. Suspendre ou archiver annule les invitations en attente.">
                            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" maxLength={500} />}
                          </Field>
                        </ActionForm>
                      </Disclosure>
                    )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ManageEmpty icon="users" title="Aucune asso pour l'instant">
            <p>Crée la première asso ci-dessus. Elle restera en préparation tant que tu ne l&apos;as pas rendue active.</p>
          </ManageEmpty>
        )}
      </ManageSection>
    </div>
  );
}
