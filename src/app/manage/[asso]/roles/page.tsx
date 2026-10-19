import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getOrganizationTeam, getPermissionCatalog, getPositionTemplates } from "@/lib/governance/queries";
import { OFFICE_LABEL, PERMISSION_CATEGORY_LABEL, PERMISSION_CATEGORY_ORDER } from "@/lib/governance/labels";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ cree?: string }>;

export const metadata: Metadata = { title: "Postes et droits" };

/**
 * /manage/[asso]/roles — the association's positions and what each one
 * allows, in words. A title is only a name: the rights come from the boxes
 * ticked on the position, and the people holding it get them for the length
 * of their mandate. Editing a position changes the rights of its holders at
 * once (live, not a copy); a template is only a starting point at creation.
 */
export default async function ManageRolesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const { cree } = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const { organization, can } = ctx;
  if (!(can("positions.manage") || can("positions.assign") || can("delegations.manage"))) {
    return <SectionDenied section="roles" ctx={ctx} />;
  }

  const [team, catalog, templates] = await Promise.all([
    getOrganizationTeam(organization.id),
    getPermissionCatalog(),
    getPositionTemplates(),
  ]);
  if (!team.ok) return <SectionDenied section="roles" ctx={ctx} code={team.code} />;

  const writable = !ctx.workspace.readOnly;
  const labels = new Map(catalog.map((p) => [p.key, p]));
  const templateLabel = new Map(templates.map((t) => [t.key, t.label]));
  const positions = team.data.positions;
  const custom = positions.filter((p) => p.office === null);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={organization.shortName ?? organization.name}
        title="Postes et droits"
        description={
          <p>
            Le nom d&apos;un poste est libre&nbsp;; ce sont ses droits qui comptent. Chaque personne qui occupe un poste a
            ses droits jusqu&apos;à la fin de son mandat. Tu ne peux donner que des droits que tu as toi-même.
          </p>
        }
        actions={
          writable && can("positions.manage") ? (
            <ButtonLink href={routes.manageNewRole(asso)} icon="plus" iconPosition="start">
              Nouveau poste
            </ButtonLink>
          ) : undefined
        }
      />

      {!writable && (
        <ReadOnlyNotice
          reason={ctx.membership.membership_status === "suspended" ? "membership_suspended" : organization.status === "archived" ? "organization_archived" : "organization_suspended"}
        />
      )}
      {writable && ctx.aal !== "aal2" && can("positions.manage") && <MfaNotice what="Créer ou modifier un poste" />}
      {cree && <Notice tone="info" icon="check" title="Poste créé. Attribue-le depuis la fiche d'un membre, ou dans une invitation." />}

      <ManageSection title="Postes" count={positions.length}>
        <ul className="flex flex-col gap-3">
          {positions.map((p) => {
            const groups = PERMISSION_CATEGORY_ORDER.map((category) => ({
              category,
              items: p.permissions.filter((k) => labels.get(k)?.category === category),
            })).filter((g) => g.items.length > 0);
            const editable = writable && can("positions.manage");
            return (
              <li key={p.id} className="rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="type-card">
                      {editable ? (
                        <Link href={routes.manageRole(asso, p.id)} className="hover:text-assoc-text hover:underline">
                          {p.title}
                        </Link>
                      ) : (
                        p.title
                      )}
                    </h3>
                    <p className="flex flex-wrap gap-x-3 type-meta text-subtle">
                      {p.office ? <span>{OFFICE_LABEL[p.office]} · protégé</span> : <span>Modèle&nbsp;: {templateLabel.get(p.template_key) ?? "sur mesure"}</span>}
                      <span>{p.holders ? plural(p.holders, "personne") : "Personne pour l'instant"}</span>
                    </p>
                    {p.description && <p className="type-small text-muted">{p.description}</p>}
                  </div>
                  {p.office ? (
                    <StatusBadge tone="accent">Passation uniquement</StatusBadge>
                  ) : (
                    editable && (
                      <ButtonLink href={routes.manageRole(asso, p.id)} size="sm" variant="secondary">
                        Modifier
                      </ButtonLink>
                    )
                  )}
                </div>
                {groups.length ? (
                  <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-line pt-3 sm:grid-cols-2">
                    {groups.map(({ category, items }) => (
                      <div key={category}>
                        <dt className="type-label text-subtle">{PERMISSION_CATEGORY_LABEL[category]}</dt>
                        <dd className="type-small">{items.map((k) => labels.get(k)?.label ?? k).join(", ")}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 border-t border-line pt-3 type-small text-muted">Aucun droit de gestion.</p>
                )}
              </li>
            );
          })}
        </ul>
        {custom.length === 0 && (
          <ManageEmpty icon="sliders" title="Aucun poste en dehors de la présidence">
            <p>
              Crée les postes de ton équipe (communication, trésorerie, événements…) à partir d&apos;un modèle, puis ajuste
              leurs droits case par case.
            </p>
          </ManageEmpty>
        )}
      </ManageSection>
    </div>
  );
}
