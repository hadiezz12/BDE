import type { ReactNode } from "react";
import type { Association, AssociationRef } from "@/lib/types";
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
 *  - forbidden : logged in, not on this association's bureau
 *  - none      : logged in, manages no association at all (the /manage chooser)
 */
export function ManageGateState({
  reason,
  association,
  managed = [],
}: {
  reason: "login" | "forbidden" | "none";
  association?: Association;
  /** Associations the viewer does manage (offered as a way out of "forbidden"). */
  managed?: AssociationRef[];
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
            <ButtonLink
              href={association ? routes.association(association.slug) : routes.associations}
              variant="secondary"
            >
              {association ? "Voir la page publique" : "Voir les associations"}
            </ButtonLink>
          </>
        }
      >
        <p>
          C&apos;est ici que les bureaux publient leurs événements, trient les candidatures et tiennent leur page à
          jour. Connecte-toi avec ton mail GEM&nbsp;: si ton compte a les droits, tu arrives directement sur ton
          espace.
        </p>
      </ManageStatePanel>
    );
  }

  if (reason === "forbidden" && association) {
    // The first listed member leads the bureau (présidente, responsable d'antenne…).
    const lead = association.team[0];
    const elsewhere = managed.filter((a) => a.id !== association.id);
    return (
      <ManageStatePanel
        kicker="Accès réservé au bureau"
        header={header}
        title={`Tu ne fais pas partie du bureau de ${association.name}.`}
        actions={
          <>
            {elsewhere.map((a) => (
              <ButtonLink key={a.id} href={routes.manageHome(a.slug)} icon="arrow-right">
                Gérer {a.shortName ?? a.name}
              </ButtonLink>
            ))}
            <ButtonLink
              href={routes.association(association.slug)}
              variant={elsewhere.length ? "secondary" : "primary"}
            >
              Voir la page publique
            </ButtonLink>
            <ButtonLink href={routes.account} variant="ghost">
              Mon espace
            </ButtonLink>
          </>
        }
      >
        <p>
          Seul·es les membres du bureau peuvent modifier sa page, ses événements et ses recrutements. Tu viens
          d&apos;être élu·e&nbsp;?{" "}
          {lead ? (
            <>
              Demande à <strong className="font-bold text-fg">{lead.name}</strong> ({lead.role.toLowerCase()}) de
              t&apos;ajouter depuis l&apos;onglet Équipe.
            </>
          ) : (
            <>Demande à la personne qui préside l&apos;association de t&apos;ajouter depuis l&apos;onglet Équipe.</>
          )}
        </p>
      </ManageStatePanel>
    );
  }

  return (
    <ManageStatePanel
      kicker="Aucune association"
      icon="users"
      title="Tu ne gères aucune association pour l'instant."
      actions={
        <>
          <ButtonLink href={routes.recruitment} icon="arrow-right">
            Voir les recrutements
          </ButtonLink>
          <ButtonLink href={routes.account} variant="secondary">
            Mon espace
          </ButtonLink>
        </>
      }
    >
      <p>
        Cet espace s&apos;ouvre aux membres d&apos;un bureau, une fois ajouté·es par leur présidence. Envie d&apos;en
        être&nbsp;? Les assos qui cherchent du monde publient leurs postes dans Recrutement.
      </p>
    </ManageStatePanel>
  );
}
