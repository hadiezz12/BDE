import type { ReactNode } from "react";
import type { WorkspaceOrganization } from "@/lib/data/manage";
import type { WorkspaceRef } from "@/lib/governance/workspace";
import { routes } from "@/lib/routes";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";
import { AssociationLogo } from "@/components/associations/AssociationLogo";

/**
 * Full-page states inside the workspace (access gate, unknown association).
 * Studio, not neon: a plain white sheet with a pass-style header strip, the
 * page's single h1, specific copy and always a way on.
 */
export function ManageStatePanel({
  kicker,
  icon = "lock",
  title,
  header,
  children,
  actions,
}: {
  kicker?: string;
  icon?: IconName;
  title: ReactNode;
  /** Optional strip above the sheet (who/what this is about). */
  header?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="max-w-3xl overflow-hidden rounded-md border border-line bg-raised">
      {header && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-sunken px-5 py-3 sm:px-8">
          {header}
        </div>
      )}
      <div className="px-5 py-8 sm:px-8 sm:py-10">
        {kicker && (
          <p className="flex items-center gap-2 type-label text-assoc-text">
            <Icon name={icon} size={14} />
            {kicker}
          </p>
        )}
        <h1 className="mt-3 max-w-[24ch] type-title">{title}</h1>
        {children && <div className="mt-4 flex max-w-xl flex-col gap-3 text-muted">{children}</div>}
        {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </section>
  );
}

/**
 * Why someone cannot use the workspace, in words:
 *  - login     : visitor — log in first
 *  - forbidden : logged in, not a member of this association
 *  - none      : logged in, member of no association at all (the /manage chooser)
 */
export function ManageGateState({
  reason,
  association,
  managed = [],
}: {
  reason: "login" | "forbidden" | "none";
  association?: WorkspaceOrganization;
  /** Association workspaces the viewer does have (offered as a way out of "forbidden"). */
  managed?: WorkspaceRef[];
}) {
  const header = association ? (
    <span data-accent={association.accent} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex min-w-0 items-center gap-2.5">
        <AssociationLogo association={association} size={28} />
        <span className="truncate font-bold">{association.name}</span>
      </span>
      <span className="type-meta text-subtle sm:ml-auto">Espace bureau</span>
    </span>
  ) : undefined;

  if (reason === "login") {
    return (
      <ManageStatePanel
        kicker="Connexion requise"
        header={header}
        title={association ? `Connecte-toi pour gérer ${association.name}.` : "Connecte-toi pour ouvrir l'espace assos."}
        actions={
          <>
            <ButtonLink href={routes.login} icon="arrow-right">
              Se connecter
            </ButtonLink>
            <ButtonLink href={routes.associations} variant="secondary">
              Voir les associations
            </ButtonLink>
          </>
        }
      >
        <p>
          C&apos;est ici que les équipes des assos s&apos;organisent&nbsp;: membres, postes, droits et passations.
          Connecte-toi avec ton mail de l&apos;école&nbsp;: si tu fais partie de l&apos;asso, tu arrives directement
          sur son espace.
        </p>
      </ManageStatePanel>
    );
  }

  if (reason === "forbidden" && association) {
    const elsewhere = managed.filter((a) => a.id !== association.id);
    return (
      <ManageStatePanel
        kicker="Accès réservé à l'équipe"
        header={header}
        title={`Tu ne fais pas partie de l'équipe de ${association.name}.`}
        actions={
          <>
            {elsewhere.map((a) => (
              <ButtonLink key={a.id} href={routes.manageHome(a.slug)} icon="arrow-right">
                Gérer {a.shortName ?? a.name}
              </ButtonLink>
            ))}
            <ButtonLink href={routes.accountInvitations} variant={elsewhere.length ? "secondary" : "primary"}>
              Mes invitations
            </ButtonLink>
            <ButtonLink href={routes.account} variant="ghost">
              Mon espace
            </ButtonLink>
          </>
        }
      >
        <p>
          Cet espace s&apos;ouvre aux membres de l&apos;asso, sur invitation. Tu viens d&apos;être élu·e ou
          recruté·e&nbsp;? Demande à la présidence de t&apos;inviter depuis l&apos;onglet Équipe, avec l&apos;adresse
          de ton compte&nbsp;: l&apos;invitation t&apos;attendra dans Mes invitations.
        </p>
      </ManageStatePanel>
    );
  }

  return (
    <ManageStatePanel
      kicker="Aucune association"
      icon="users"
      title="Tu ne fais partie d'aucune équipe d'asso pour l'instant."
      actions={
        <>
          <ButtonLink href={routes.accountInvitations} icon="arrow-right">
            Mes invitations
          </ButtonLink>
          <ButtonLink href={routes.recruitment} variant="secondary">
            Voir les recrutements
          </ButtonLink>
        </>
      }
    >
      <p>
        Cet espace s&apos;ouvre aux membres d&apos;une asso, sur invitation de son équipe. Une invitation reçue
        t&apos;attend dans Mes invitations. Envie de rejoindre une asso&nbsp;? Celles qui cherchent du monde
        publient leurs postes dans Recrutement.
      </p>
    </ManageStatePanel>
  );
}
