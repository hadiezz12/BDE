import Link from "next/link";
import type { ReactNode } from "react";
import type { ApplicationItem, Association, EventItem, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { APPLICATION_STATUS_LABEL, formatDayMonth, formatTime, plural, relativeDay } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EventRow } from "@/components/events/EventRow";

const listFr = new Intl.ListFormat("fr", { style: "long", type: "conjunction" });

/**
 * The light personal line under the ticker.
 *  - visitor : one sentence and a sign-in button, nothing personal
 *  - student : next outing, member card, applications in progress
 *  - officer : the same, with their associations' workspace instead of
 *              applications when they have none going
 * It points to the student space; it never tries to be it.
 */
export function PersonalStrip({
  user,
  nextOuting,
  savedUpcoming,
  memberActive,
  applications,
  managed,
  memberCardHref,
  now,
}: {
  user: UserProfile | null;
  /** The next registered event that isn't over. */
  nextOuting: EventItem | null;
  /** Saved events still to come. */
  savedUpcoming: number;
  memberActive: boolean;
  /** Active applications (draft, sent, being read, interview). */
  applications: ApplicationItem[];
  managed: Pick<Association, "id" | "name">[];
  /** Where the member card is sold (the BDE page). */
  memberCardHref: string;
  now: Date;
}) {
  if (!user) {
    return (
      <aside aria-label="Ton espace" className="wrap pt-8 sm:pt-10">
        <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <p className="flex items-start gap-3">
            <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-muted" />
            <span>
              <strong>Tout se lit sans compte.</strong>{" "}
              <span className="text-muted">
                Connecte-toi pour garder tes soirées, suivre tes candidatures et sortir ta carte cotisante à
                l&apos;entrée.
              </span>
            </span>
          </p>
          <ButtonLink
            href={`${routes.login}?next=${encodeURIComponent(routes.home)}`}
            variant="secondary"
            size="sm"
            icon="arrow-right"
            className="self-start sm:self-auto"
          >
            Se connecter
          </ButtonLink>
        </div>
      </aside>
    );
  }

  const highlight = applications.find((a) => a.nextStep?.date) ?? applications[0] ?? null;
  const showApplications = applications.length > 0 || managed.length === 0;

  return (
    <section aria-labelledby="ton-programme" className="wrap pt-8 sm:pt-10">
      <div className="border-t-2 border-fg pt-3">
        <h2 id="ton-programme" className="type-label text-accent-text">
          Ton programme, {user.firstName}
        </h2>
        <div className="mt-4 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:flex">
          <Cell title="Ta prochaine sortie" lead className="sm:col-span-2">
            {nextOuting ? (
              <div className="self-stretch border-b border-line">
                <EventRow event={nextOuting} variant="compact" headingLevel={4} personal={{ registered: true }} now={now} />
              </div>
            ) : (
              <p className="text-muted">Tu n&apos;es inscrit·e à rien pour le moment. Ce soir, peut-être ?</p>
            )}
            <CellLink href={routes.accountEvents}>
              Mes événements
              {savedUpcoming > 0 && (
                <span className="text-muted"> · {plural(savedUpcoming, "enregistré", "enregistrés")}</span>
              )}
            </CellLink>
          </Cell>

          <Cell title="Carte cotisante">
            {memberActive && user.memberCard ? (
              <>
                <StatusBadge tone="ok">Active</StatusBadge>
                <p className="type-meta">{user.memberCard.number}</p>
                <p className="type-small text-muted">
                  Saison {user.memberCard.season}, jusqu&apos;au {formatDayMonth(user.memberCard.validUntil)} : tarif
                  adhérent sur les soirées du VPC.
                </p>
                <CellLink href={routes.account}>Sortir ma carte</CellLink>
              </>
            ) : (
              <>
                <StatusBadge tone="neutral">Pas encore prise</StatusBadge>
                <p className="type-small text-muted">
                  30&nbsp;€ l&apos;année, et les soirées du VPC passent au tarif adhérent.
                </p>
                <CellLink href={memberCardHref}>Prendre la carte</CellLink>
              </>
            )}
          </Cell>

          {managed.length > 0 && (
            <Cell title="Tes assos">
              <p className="font-bold leading-snug">{listFr.format(managed.map((a) => a.name))}</p>
              <p className="type-small text-muted">Événements, recrutements et équipe se gèrent dans l&apos;espace asso.</p>
              <CellLink href={routes.manage}>Ouvrir l&apos;espace asso</CellLink>
            </Cell>
          )}

          {showApplications && (
            <Cell title="Candidatures">
              {highlight ? (
                <>
                  <StatusBadge tone="info">{plural(applications.length, "en cours", "en cours")}</StatusBadge>
                  <p className="type-small">
                    <span className="font-bold">{highlight.campaign.association.name}</span>
                    <span className="text-muted">
                      {" "}
                      ·{" "}
                      {highlight.nextStep?.date
                        ? `${highlight.nextStep.label}, ${relativeDay(highlight.nextStep.date, now).toLowerCase()} à ${formatTime(highlight.nextStep.date)}`
                        : APPLICATION_STATUS_LABEL[highlight.status]}
                    </span>
                  </p>
                  <CellLink href={routes.accountApplications}>Mes candidatures</CellLink>
                </>
              ) : (
                <>
                  <p className="type-small text-muted">Aucune candidature en cours.</p>
                  <CellLink href={routes.recruitment}>Voir qui recrute</CellLink>
                </>
              )}
            </Cell>
          )}
        </div>
      </div>
    </section>
  );
}

/** One fact of the strip. The lead cell (next outing) is wider and has no left rule. */
function Cell({
  title,
  lead,
  className,
  children,
}: {
  title: string;
  lead?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col items-start gap-2",
        lead ? "lg:w-[42%] lg:shrink-0" : "lg:flex-1 lg:border-l lg:border-line lg:pl-8",
        className,
      )}
    >
      <h3 className="type-label text-muted">{title}</h3>
      {children}
    </div>
  );
}

function CellLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mt-1 inline-flex items-center gap-1.5 type-label text-fg hover:text-accent-text">
      <span>{children}</span>
      <Icon name="arrow-right" size={14} className="shrink-0" />
    </Link>
  );
}
