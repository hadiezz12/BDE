import Link from "next/link";
import type { ApplicationItem, CampaignItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import {
  APPLICATION_STATUS_LABEL,
  CAMPAIGN_STATUS_LABEL,
  formatDayMonth,
  formatTime,
  plural,
} from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplyTrigger } from "./ApplyTrigger";
import { STATUS_TONE, countdown, isOpen, isPositionOpen } from "./campaign-facts";

/**
 * The apply "ticket" of a fiche: countdown, the exact deadline in words, and
 * the one action that matters in the current state — apply, follow your
 * application, wait for the opening, or find another campaign. Sticky beside
 * the fiche on desktop; on phones it shows inline when the campaign is not
 * open (the ApplyBar takes over when it is).
 */
export function ApplyPanel({
  campaign,
  mine,
  signedIn,
  headingId,
  now = new Date(),
}: {
  campaign: CampaignItem;
  mine: ApplicationItem | null;
  signedIn: boolean;
  /** Unique per render: the panel can appear twice (phone inline + desktop aside). */
  headingId: string;
  now?: Date;
}) {
  const { status } = campaign;
  const open = isOpen(status);
  const urgent = status === "derniere-chance";
  const count = countdown(campaign, now);
  const openRoles = campaign.positions.filter((p) => isPositionOpen(p, campaign, now));
  const draft = mine?.status === "brouillon";
  const applied = mine && !draft ? mine : null;
  const otherRoles = openRoles.filter((p) => p.id !== mine?.positionId);

  const exact =
    status === "a-venir"
      ? `Ouverture le ${formatDayMonth(campaign.opensAt)} à ${formatTime(campaign.opensAt)}`
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
            status === "cloturee" ? "text-subtle" : urgent ? "text-accent-text" : "text-assoc-text",
          )}
        >
          <span className="text-[4.25rem]">{count.value}</span>
          {count.unit && <span className="text-[1.75rem]">{count.unit}</span>}
        </p>
        <div className="flex flex-col gap-0.5">
          <p className={cx("type-meta font-bold", urgent && "text-accent-text")}>{count.label}</p>
          <p className="type-meta text-muted">{exact}</p>
        </div>
        <p className="type-small text-muted">
          {open
            ? `${plural(openRoles.length, "poste ouvert", "postes ouverts")} · ${plural(
                openRoles.reduce((n, p) => n + p.seats, 0),
                "place",
              )}`
            : `${plural(campaign.positions.length, "poste")} · ${plural(campaign.seats, "place")}`}
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t-2 border-dashed border-line-strong/40 p-5 sm:p-6">
        {open && applied && (
          <>
            <p className="type-small">
              Ta candidature au poste <strong>{applied.position.title}</strong> :{" "}
              {APPLICATION_STATUS_LABEL[applied.status].toLowerCase()}.
            </p>
            <ButtonLink href={routes.accountApplication(applied.id)} variant="assoc" icon="arrow-right" block>
              Suivre ma candidature
            </ButtonLink>
            {otherRoles.length > 0 && (
              <ApplyTrigger variant="ghost" block>
                Candidater à un autre poste
              </ApplyTrigger>
            )}
          </>
        )}

        {open && !applied && (
          <>
            <ApplyTrigger size="lg" block>
              Candidater
            </ApplyTrigger>
            <p className="type-small text-muted">
              {signedIn
                ? "Tu choisis le poste dans le formulaire."
                : "Il te faudra te connecter : ta candidature est liée à ton compte."}
            </p>
            {draft && mine && (
              <Link href={routes.accountApplication(mine.id)} className="link type-small font-bold">
                Reprendre mon brouillon ({mine.position.title})
              </Link>
            )}
          </>
        )}

        {status === "a-venir" && (
          <>
            <p className="type-small">
              Le formulaire ouvre le {formatDayMonth(campaign.opensAt)} à {formatTime(campaign.opensAt)}. D&apos;ici là,
              lis les postes et prépare tes réponses : tout ce qu&apos;on te demandera est sur la fiche.
            </p>
            {draft && mine && (
              <ButtonLink href={routes.accountApplication(mine.id)} variant="secondary" icon="arrow-right" block>
                Reprendre mon brouillon
              </ButtonLink>
            )}
          </>
        )}

        {status === "cloturee" && (
          <>
            <p className="type-small">
              {campaign.association.name} ne prend plus de candidature pour ce recrutement. La fiche reste en ligne
              pour mémoire.
            </p>
            {mine && (
              <ButtonLink href={routes.accountApplication(mine.id)} variant="secondary" icon="arrow-right" block>
                Suivre ma candidature
              </ButtonLink>
            )}
            <Link
              href={`${routes.recruitment}?scope=open`}
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
