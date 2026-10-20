import Link from "next/link";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDateLong } from "@/lib/format";
import { ORGANIZATION_STATUS_LABEL } from "@/lib/governance/labels";
import { hasUnpublishedChanges, type AssociationEditor } from "@/lib/associations/editor";
import { completeness } from "@/lib/associations/validation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { Notice } from "@/components/manage/governance/Notices";

/**
 * Where the page stands, in words. Two separate things, never mixed up:
 * the association's status (set by the BDE: en préparation, active,
 * suspendue, archivée) and its page's (brouillon, en ligne, retirée). A page
 * is online only when both allow it.
 */
export function pageState(e: AssociationEditor): { tone: StatusTone; label: string; detail: string } {
  if (e.page.withheld_at) {
    return {
      tone: "danger",
      label: "Retirée par le BDE",
      detail: `Le BDE a retiré la page le ${formatDateLong(e.page.withheld_at)}. Elle ne peut pas être publiée tant qu'il ne l'a pas rétablie.`,
    };
  }
  if (e.page.is_public) {
    return {
      tone: "ok",
      label: "En ligne",
      detail: `Publiée le ${formatDateLong(e.page.published_at!)}${e.page.published_by_name ? ` par ${e.page.published_by_name}` : ""}.`,
    };
  }
  if (e.page.status === "published") {
    return {
      tone: "warn",
      label: "Publiée, pas visible",
      detail: `La page est publiée, mais l'asso est « ${ORGANIZATION_STATUS_LABEL[e.organization.status].toLowerCase()} » : elle sera visible quand le BDE la rendra active.`,
    };
  }
  if (e.page.status === "unpublished") {
    return {
      tone: "neutral",
      label: "Retirée par l'asso",
      detail: `Retirée du site le ${formatDateLong(e.page.unpublished_at!)}. Elle revient à la prochaine publication.`,
    };
  }
  return { tone: "info", label: "Brouillon", detail: "Jamais publiée : personne d'autre que l'équipe ne la voit." };
}

export function editorCompleteness(e: AssociationEditor) {
  const team = e.team_members.filter((m) => m.eligible && !m.member_hidden).length;
  return completeness(e.draft, { isBde: e.organization.kind === "bde", galleryCount: e.gallery.length, teamCount: team });
}

/** Where each item of the checklist is filled in. */
export function completenessHref(asso: string, key: string): string {
  switch (key) {
    case "logo":
    case "cover":
      return routes.managePageAppearance(asso);
    case "gallery":
      return routes.managePageGallery(asso);
    case "team":
      return routes.managePageTeam(asso);
    case "contact":
      return `${routes.manageSettings(asso)}#contact`;
    case "pillars":
    case "description":
      return `${routes.manageSettings(asso)}#presentation`;
    default:
      return `${routes.manageSettings(asso)}#identite`;
  }
}

export function PageStatusPanel({ editor: e }: { editor: AssociationEditor }) {
  const state = pageState(e);
  const changes = hasUnpublishedChanges(e);
  const { percent } = editorCompleteness(e);
  const asso = e.organization.slug;
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 bg-raised px-4 py-3">
          <dt className="type-label text-subtle">L&apos;association</dt>
          <dd className="flex flex-col gap-1">
            <StatusBadge tone={e.organization.status === "active" ? "ok" : e.organization.status === "setup" ? "info" : "warn"}>
              {ORGANIZATION_STATUS_LABEL[e.organization.status]}
            </StatusBadge>
            <span className="type-small text-muted">Statut décidé par le BDE.</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1.5 bg-raised px-4 py-3">
          <dt className="type-label text-subtle">La page</dt>
          <dd className="flex flex-col gap-1">
            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
            <span className="type-small text-muted">{state.detail}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1.5 bg-raised px-4 py-3">
          <dt className="type-label text-subtle">Le brouillon</dt>
          <dd className="flex flex-col gap-1">
            <StatusBadge tone={changes && e.page.published_revision !== null ? "accent" : "neutral"}>
              {e.page.published_revision === null
                ? `Complet à ${percent} %`
                : changes
                  ? "Changements à publier"
                  : "Identique à la version en ligne"}
            </StatusBadge>
            <span className="type-small text-muted">
              Enregistré le {formatDateLong(e.draft.updated_at)}
              {e.draft.updated_by_name ? ` par ${e.draft.updated_by_name}` : ""}.{" "}
              <Link href={routes.managePagePublication(asso)} className="link font-semibold text-fg">
                Publication
              </Link>
            </span>
          </dd>
        </div>
      </dl>
      {e.page.withheld_at && (
        <Notice tone="danger" icon="alert" title="Le BDE a retiré ta page du site">
          <p>Raison donnée : {e.page.withheld_reason}</p>
          <p>
            Corrige ce qui pose problème dans le brouillon, puis contacte le bureau du BDE : il peut rétablir la page.
          </p>
        </Notice>
      )}
    </div>
  );
}

/** The checklist: what the page has, what it lacks, what publishing needs. */
export function CompletenessList({ editor: e, className }: { editor: AssociationEditor; className?: string }) {
  const { items, percent, publishable } = editorCompleteness(e);
  const asso = e.organization.slug;
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold">Page complète à {percent} %</p>
        <p className={cx("type-small font-semibold", publishable ? "text-ok" : "text-warn")}>
          {publishable ? "Prête à publier" : "Il manque l'essentiel pour publier"}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Complétude de la page"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-sunken"
      >
        <span className="block h-full rounded-full bg-assoc" style={{ width: `${percent}%` }} />
      </div>
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} className="flex min-h-10 items-center gap-2.5 border-b border-line py-1.5">
            <Icon
              name={item.done ? "check" : "plus"}
              size={16}
              strokeWidth={item.done ? 3 : 2}
              className={item.done ? "shrink-0 text-ok" : "shrink-0 text-subtle"}
            />
            {item.done ? (
              <span className="type-small">{item.label}</span>
            ) : (
              <Link href={completenessHref(asso, item.key)} className="type-small font-semibold hover:underline">
                {item.label}
                {item.required && <span className="font-normal text-warn"> · obligatoire</span>}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
