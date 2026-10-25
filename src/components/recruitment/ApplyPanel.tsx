import Link from "next/link";
import type { ApplicationItem, CampaignItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, CAMPAIGN_STATUS_LABEL, formatDayMonth, formatTime, plural } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { STATUS_TONE, countdown, isOpen, isOver, openPositions, positionsLine } from "./campaign-facts";

/**
 * The apply "ticket" of a fiche: countdown, the exact deadline in words, and
 * what to do in the current state — choose a position, come back to your
 * draft, wait for the opening, or find another campaign. Sticky beside the
 * fiche on desktop; on phones it shows inline when the campaign is not open
 * (the ApplyBar takes over when it is). Each position carries its own
 * "Candidater" button.
 */
export function ApplyPanel({
  campaign,
  mine,
  signedIn,
  headingId,
  positionsHref = "#postes",
  preview = false,
  now = new Date(),
}: {
  campaign: CampaignItem;
  /** The student's applications to this campaign that still count (draft or sent). */
  mine: ApplicationItem[];
  signedIn: boolean;
  /** Unique per render: the panel can appear twice (phone inline + desktop aside). */
  headingId: string;
  /** Where "Choisir un poste" leads (the positions, or this position on its own page). */
  positionsHref?: string;
  /** The team's preview: says nothing is saved. */
  preview?: boolean;
  now?: Date;
}) {
  const { status } = campaign;
  const open = isOpen(status);
  const over = isOver(status);
  const urgent = status === "derniere-chance";
  const count = countdown(campaign, now);
  const roles = openPositions(campaign);
  const canApplyMore = mine.length < campaign.maxApplications;

  const exact =
    status === "a-venir"
      ? `Ouverture le ${formatDayMonth(campaign.opensAt)} à ${formatTime(campaign.opensAt)}`
      : status === "annulee"
        ? "Recrutement annulé par l'association"
        : status === "cloturee"
          ? `Clos le ${formatDayMonth(campaign.closesAt)} à ${formatTime(campaign.closesAt)}`
          : `Clôture le ${formatDayMonth(campaign.closesAt)} à ${formatTime(campaign.closesAt)}`;

  return (
    <section aria-labelledby={headingId} className="rounded-sm border-2 border-fg bg-raised shadow-sticker">
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id={headingId} className="type-label text-muted">
            Candidatures
          </h2>
          <StatusBadge tone={STATUS_TONE[status]} pulse={urgent}>
            {CAMPAIGN_STATUS_LABEL[status]}
          </StatusBadge>
        </div>
        <p
          aria-hidden
          className={cx(
            "mt-1 flex items-baseline gap-1 type-numeral",
            over || status === "en-pause" ? "text-subtle" : urgent ? "text-accent-text" : "text-assoc-text",
          )}
        >
          <span className={count.unit ? "text-[4.25rem]" : "text-[3.25rem]"}>{count.value}</span>
          {count.unit && <span className="text-[1.75rem]">{count.unit}</span>}
        </p>
        <div className="flex flex-col gap-0.5">
          <p className={cx("type-meta font-bold", urgent && "text-accent-text")}>{count.label}</p>
          <p className="type-meta text-muted">{exact}</p>
        </div>
        <p className="type-small text-muted">
          {open ? plural(roles.length, "poste ouvert", "postes ouverts") : positionsLine(campaign)}
          {campaign.maxApplications > 1
            ? ` · jusqu'à ${campaign.maxApplications} postes par personne`
            : " · un poste par personne"}
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t-2 border-dashed border-line-strong/40 p-5 sm:p-6">
        {preview && (
          <p className="flex items-start gap-1.5 type-small font-semibold">
            <Icon name="eye" size={15} className="mt-0.5 shrink-0" />
            Aperçu : les boutons ne créent aucune candidature.
          </p>
        )}
        {mine.length > 0 && (
          <ul className="flex flex-col gap-2">
            {mine.map((a) => (
              <li key={a.id} className="flex flex-col gap-1">
                <p className="type-small">
                  <strong>{a.position.title}</strong> · {APPLICATION_STATUS_LABEL[a.status].toLowerCase()}
                </p>
                <Link href={routes.accountApplication(a.id)} className="link type-small font-bold">
                  {a.status === "brouillon" ? "Reprendre mon brouillon" : "Relire ma candidature"}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {open && roles.length > 0 && canApplyMore && (
          <>
            <ButtonLink href={positionsHref} variant={mine.length > 0 ? "secondary" : "assoc"} size={mine.length > 0 ? "md" : "lg"} icon="arrow-right" block>
              {mine.length > 0 ? "Candidater à un autre poste" : "Choisir un poste"}
            </ButtonLink>
            <p className="type-small text-muted">
              {signedIn
                ? "Chaque poste a son bouton « Candidater ». Tes réponses s'enregistrent au fur et à mesure."
                : "Tout se lit sans compte. Pour candidater, il te faudra te connecter : ta candidature est liée à ton compte."}
            </p>
          </>
        )}
        {open && mine.length > 0 && !canApplyMore && (
          <p className="type-small text-muted">
            Ce recrutement permet {campaign.maxApplications > 1 ? `${campaign.maxApplications} postes` : "un poste"} par personne : tu as
            atteint la limite. Retire une candidature pour en envoyer une autre.
          </p>
        )}
        {open && roles.length === 0 && <p className="type-small">Plus aucun poste ne prend de candidature.</p>}

        {status === "a-venir" && (
          <p className="type-small">
            Les candidatures ouvrent le {formatDayMonth(campaign.opensAt)} à {formatTime(campaign.opensAt)}. D&apos;ici là, lis les
            postes : la fiche dit tout ce qu&apos;on te demandera.
          </p>
        )}

        {status === "en-pause" && (
          <p className="type-small">
            {campaign.association.name} a mis ce recrutement en pause : personne ne peut commencer ni envoyer de candidature tant
            qu&apos;il n&apos;est pas rouvert. Les brouillons restent enregistrés.
          </p>
        )}

        {over && (
          <>
            <p className="type-small">
              {status === "annulee"
                ? `${campaign.association.name} a annulé ce recrutement.${campaign.cancellationReason ? ` Raison donnée : ${campaign.cancellationReason}` : ""}`
                : `${campaign.association.name} ne prend plus de candidature pour ce recrutement. La fiche reste en ligne pour mémoire.`}
            </p>
            <Link
              href={`${routes.recruitment}?vue=ouverts`}
              className="inline-flex items-center gap-1.5 type-small font-bold hover:text-assoc-text"
            >
              Voir les recrutements ouverts
              <Icon name="arrow-right" size={16} />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
