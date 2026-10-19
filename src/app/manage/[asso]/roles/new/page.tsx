import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { getManageContext } from "@/lib/data/manage";
import { getOrganizationTeam, getPermissionCatalog, getPositionTemplates } from "@/lib/governance/queries";
import { myPositionKeys } from "@/lib/governance/team";
import { createPosition } from "@/app/actions/governance";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { PermissionPicker } from "@/components/manage/governance/PermissionPicker";
import { MfaNotice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ modele?: string }>;

export const metadata: Metadata = { title: "Nouveau poste" };

/**
 * /manage/[asso]/roles/new — a position starts from a template (its rights
 * are copied once, at creation: changing templates later never rewrites an
 * existing position), then each right is adjusted. The template is chosen by
 * link (?modele=…), so the page works without JavaScript.
 */
export default async function ManageNewRolePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const { modele } = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const { organization, can } = ctx;
  if (!can("positions.manage")) return <SectionDenied section="roles" ctx={ctx} />;

  const [team, catalog, templates] = await Promise.all([
    getOrganizationTeam(organization.id),
    getPermissionCatalog(),
    getPositionTemplates(),
  ]);
  if (!team.ok) return <SectionDenied section="roles" ctx={ctx} code={team.code} />;

  const ceiling = myPositionKeys(team.data);
  const template = templates.find((t) => t.key === modele) ?? templates.find((t) => t.key === "custom") ?? templates[0];
  const selected = template.permissions.filter((k) => ceiling.includes(k));
  const trimmed = template.permissions.length - selected.length;

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={organization.shortName ?? organization.name}
        title="Nouveau poste"
        actions={
          <ButtonLink href={routes.manageRoles(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
            Postes
          </ButtonLink>
        }
      />
      {ctx.workspace.readOnly && <ReadOnlyNotice reason={organization.status === "archived" ? "organization_archived" : "organization_suspended"} />}
      {ctx.aal !== "aal2" && <MfaNotice what="Créer un poste" />}

      <ManageSection title="1. Partir d'un modèle" description="Un modèle pré-coche des droits. Tu les ajustes ensuite ; le modèle n'est plus lié au poste après sa création.">
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const current = t.key === template.key;
            return (
              <li key={t.key}>
                <Link
                  href={`${routes.manageNewRole(asso)}?modele=${t.key}`}
                  aria-current={current ? "true" : undefined}
                  scroll={false}
                  className={cx(
                    "flex h-full flex-col gap-1 rounded-sm border-2 px-4 py-3 transition-colors",
                    current ? "border-assoc bg-assoc-soft" : "border-line bg-raised hover:border-line-strong",
                  )}
                >
                  <span className="type-button text-[0.8rem]">{t.label}</span>
                  <span className="type-small text-subtle">{t.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </ManageSection>

      <ManageSection title="2. Nom et droits">
        <ActionForm
          key={template.key}
          action={createPosition}
          hidden={{ organization_id: organization.id, organization_slug: organization.slug, template_key: template.key }}
          submitLabel="Créer le poste"
          className="rounded-md border border-line bg-raised px-4 py-5 sm:px-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom du poste" hint="Libre : c'est ce que verra l'équipe. Il ne donne aucun droit à lui seul.">
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} name="title" required maxLength={80} defaultValue={template.key === "custom" ? "" : template.label} placeholder="Ex : Responsable partenariats" />
              )}
            </Field>
            <Field label="Description" optional>
              {({ id, describedBy }) => (
                <Textarea id={id} aria-describedby={describedBy} name="description" maxLength={300} className="min-h-12" defaultValue={template.key === "custom" ? "" : template.description} />
              )}
            </Field>
          </div>
          {trimmed > 0 && (
            <p className="type-small text-warn">
              Ce modèle contient des droits que tu n&apos;as pas toi-même&nbsp;: ils ne sont pas cochés.
            </p>
          )}
          <PermissionPicker catalog={catalog} selected={selected} ceiling={ceiling} />
        </ActionForm>
      </ManageSection>
    </div>
  );
}
