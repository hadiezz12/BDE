import type { DeskOrganization } from "@/lib/posts/editor";
import { routes } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/manage/governance/Notices";

/**
 * Articles go online only with their association's public page
 * (public.publish_post and the scheduler refuse with page_not_public): say
 * it before anyone wonders why "Publier" fails, and who can fix it. Nothing
 * here for a suspended or archived association: the read-only notice says
 * more already.
 */
export function PageOfflineNotice({
  asso,
  status,
  canPublishPage,
}: {
  asso: string;
  status: DeskOrganization["status"];
  canPublishPage: boolean;
}) {
  if (status === "suspended" || status === "archived") return null;
  const setup = status === "setup";
  return (
    <Notice
      tone="info"
      icon="globe"
      title={
        setup
          ? "L'asso est encore en préparation : ses articles ne peuvent pas encore paraître"
          : "La page publique de l'asso n'est pas en ligne : ses articles non plus"
      }
      action={
        !setup && canPublishPage ? (
          <ButtonLink href={routes.managePagePublication(asso)} size="sm" variant="secondary" icon="arrow-right">
            Publier la page
          </ButtonLink>
        ) : undefined
      }
    >
      <p>
        Tu peux déjà écrire, relire et approuver. Les articles partiront en ligne une fois{" "}
        {setup ? "l'asso rendue active par le BDE et sa page publiée" : "la page publiée"}&nbsp;; d&apos;ici là, une
        publication programmée dont l&apos;heure arrive échoue, et il faudra la reprogrammer.
        {!setup && !canPublishPage && (
          <>
            {" "}
            La page est mise en ligne par les postes qui ont le droit «&nbsp;Publier la page&nbsp;» (par défaut, la
            présidence)&nbsp;: préviens-les quand vos articles sont prêts.
          </>
        )}
      </p>
    </Notice>
  );
}
