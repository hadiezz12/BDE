import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getOrganizationTeam, getPermissionCatalog } from "@/lib/governance/queries";
import { myPositionKeys } from "@/lib/governance/team";
import { OFFICE_LABEL } from "@/lib/governance/labels";
import { archivePosition, updatePosition } from "@/app/actions/governance";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { PermissionPicker } from "@/components/manage/governance/PermissionPicker";
import { MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";

type Params = Promise<{ asso: string; position: string }>;

export const metadata: Metadata = { title: "Modifier un poste" };

/**
 * /manage/[asso]/roles/[position] — rename a position, change its rights
 * (within the editor's own rights), or retire it. A protected office keeps
 * its rights; only its name and description can change here.
 */
export default async function ManageRolePage({ params }: { params: Params }) {
  const { asso, position } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const { organization, can } = ctx;
  if (!can("positions.manage")) return <SectionDenied section="roles" ctx={ctx} />;

  const [team, catalog] = await Promise.all([getOrganizationTeam(organization.id), getPermissionCatalog()]);
  if (!team.ok) return <SectionDenied section="roles" ctx={ctx} code={team.code} />;
  const p = team.data.positions.find((x) => x.id === position);
  if (!p) notFound();

  const ceiling = myPositionKeys(team.data);
  const beyond = p.permissions.filter((k) => !ceiling.includes(k)).length;
  const writable = !ctx.workspace.readOnly;

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={organization.shortName ?? organization.name}
        title={p.title}
        description={
          <p>
            {p.holders ? `${plural(p.holders, "personne occupe", "personnes occupent")} ce poste : ` : "Personne n'occupe ce poste pour l'instant. "}
            {p.holders ? "ses droits changent pour elles dès l'enregistrement." : null}
          </p>
        }
        actions={
          <ButtonLink href={routes.manageRoles(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
            Postes
          </ButtonLink>
        }
      />
      {!writable && <ReadOnlyNotice reason={organization.status === "archived" ? "organization_archived" : "organization_suspended"} />}
      {writable && ctx.aal !== "aal2" && <MfaNotice what="Modifier un poste" />}
      {p.office && (
        <Notice tone="info" icon="lock" title={`${OFFICE_LABEL[p.office]} : poste protégé`}>
          <p>
            Ses droits sont fixés et il ne change de main que par une passation (Gouvernance). Tu peux seulement modifier son
            nom affiché et sa description.
          </p>
        </Notice>
      )}

      <ManageSection title="Nom et droits">
        <ActionForm
          action={updatePosition}
          hidden={{ position_id: p.id, permissions_fixed: p.office ? "1" : undefined }}
          submitLabel="Enregistrer"
          className="rounded-md border border-line bg-raised px-4 py-5 sm:px-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom du poste">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="title" required maxLength={80} defaultValue={p.title} />}
            </Field>
            <Field label="Description" optional>
              {({ id, describedBy }) => (
                <Textarea id={id} aria-describedby={describedBy} name="description" maxLength={300} className="min-h-12" defaultValue={p.description ?? ""} />
              )}
            </Field>
          </div>
          {!p.office && (
            <>
              {beyond > 0 && (
                <p className="type-small text-subtle">
                  {plural(beyond, "droit")} de ce poste dépasse(nt) les tiens&nbsp;: tu ne peux pas les retirer, ils restent tels quels.
                </p>
              )}
              <PermissionPicker catalog={catalog} selected={p.permissions} ceiling={ceiling} />
            </>
          )}
        </ActionForm>
      </ManageSection>

      {writable && !p.office && (
        <ManageSection title="Retirer ce poste">
          <Disclosure summary="Retirer ce poste" icon="close" tone="danger">
            <ActionForm action={archivePosition} hidden={{ position_id: p.id, organization_slug: organization.slug }} submitLabel="Retirer le poste" variant="danger">
              <p className="type-small text-muted">
                Les mandats en cours sur ce poste s&apos;arrêtent maintenant
                {p.holders ? ` (${plural(p.holders, "personne")})` : ""}. Le poste reste dans l&apos;historique.
              </p>
              <Field label="Raison">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" required minLength={3} maxLength={500} />}
              </Field>
            </ActionForm>
          </Disclosure>
        </ManageSection>
      )}
    </div>
  );
}
