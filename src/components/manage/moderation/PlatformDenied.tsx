import { routes } from "@/lib/routes";
import { governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";

/**
 * A page of the BDE control center that this person's BDE position does not
 * open (typed URL, or a mandate that ended since the page was loaded). Names
 * the right in words, nothing about anyone else's access.
 */
export function PlatformDenied({
  title,
  right,
  code,
}: {
  /** The page's name ("Modération"). */
  title: string;
  /** The right's label as the permission catalog words it ("Modérer les contenus publics"). */
  right: string;
  /** The database's refusal, when the read itself was refused for another reason. */
  code?: GovernanceErrorCode;
}) {
  const why =
    code && code !== "insufficient_permission"
      ? governanceErrorMessage(code)
      : `Ton poste au BDE ne donne pas le droit « ${right} ». Il suit le mandat : la présidence et la vice-présidence du BDE l'ont tant que leur mandat court.`;
  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader kicker="Centre de contrôle BDE" title={title} />
      <ManageEmpty
        as="h2"
        icon="lock"
        title="Accès non disponible"
        actions={
          <ButtonLink href={routes.managePlatform} variant="secondary" icon="arrow-left" iconPosition="start">
            Vue d&apos;ensemble
          </ButtonLink>
        }
      >
        <p>{why}</p>
      </ManageEmpty>
    </div>
  );
}
