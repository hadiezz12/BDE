import type { ManageContext } from "@/lib/data/manage";
import { routes } from "@/lib/routes";
import { governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { sectionByKey, type ManageSectionKey } from "@/components/manage/sections";

/**
 * A section the person cannot open (typed URL, or a right that ended since
 * the page was loaded). Says which right is missing in words, and nothing
 * about anyone else's access.
 */
export function SectionDenied({
  section,
  ctx,
  code,
}: {
  section: ManageSectionKey;
  ctx: ManageContext;
  /** The database's refusal, when the read itself was refused. */
  code?: GovernanceErrorCode;
}) {
  const s = sectionByKey(section);
  const why =
    code && code !== "insufficient_permission"
      ? governanceErrorMessage(code)
      : `Aucun de tes postes actuels ne donne accès à « ${s.label} » dans ${ctx.organization.name}. Si tu devrais l'avoir, demande à la présidence de l'asso : un poste ou une délégation peut te l'ouvrir.`;
  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader kicker={ctx.organization.shortName ?? ctx.organization.name} title={s.label} />
      <ManageEmpty
        as="h2"
        icon="lock"
        title="Accès non disponible"
        actions={
          <ButtonLink href={routes.manageHome(ctx.organization.slug)} variant="secondary" icon="arrow-left" iconPosition="start">
            Accueil de l&apos;espace
          </ButtonLink>
        }
      >
        <p>{why}</p>
      </ManageEmpty>
    </div>
  );
}
