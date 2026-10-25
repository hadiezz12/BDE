import Link from "next/link";
import type { ReactNode } from "react";
import type { ApplicationItem, Association, EventItem, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { APPLICATION_STATUS_LABEL, formatDayMonth, plural } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Sticker } from "@/components/ui/Sticker";
import { EventRow } from "@/components/events/EventRow";
import { euros, type MemberCardLink } from "./home-facts";

const listFr = new Intl.ListFormat("fr", { style: "long", type: "conjunction" });

/**
 * The light personal line under the ticker.
 *  - visitor : one sentence and a sign-in button, nothing personal
 *  - student : their next registered date, their carte cotisante
 *  - officer : the same, plus their associations' workspace
 * Applications only show once the student has some going. Demo accounts
 * (Phase 1) are named by their demo label, never by a made-up person, and
 * start empty: every cell says so plainly. It points to the student space;
 * it never tries to be it.
 */
export function PersonalStrip({
  user,
  nextOuting,
  savedUpcoming,
  memberActive,
  applications,
  managed,
  memberCard,
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
  /** Where the member card is presented, its price and discount. */
  memberCard: MemberCardLink;
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
                Connecte-toi avec ton adresse de l&apos;école pour retrouver ta carte cotisante et tes inscriptions.
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

  // A draft still to send first: that is the one that needs the student.
  const highlight = applications.find((a) => a.status === "brouillon") ?? applications[0] ?? null;

  return (
    <section aria-labelledby="ton-espace" className="wrap pt-8 sm:pt-10">
      <div className="border-t-2 border-fg pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="ton-espace" className="type-label text-accent-text">
            {user.demoLabel ? "Ton espace" : `Ton espace, ${user.firstName}`}
          </h2>
          {user.demoLabel && (
            <Sticker tone="cream" size="sm" tilt={-2}>
              {user.demoLabel}
            </Sticker>
          )}
        </div>
        <div className="mt-4 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:flex">
          <Cell title="Tes inscriptions" lead className="sm:col-span-2">
            {nextOuting ? (
              <div className="self-stretch border-b border-line">
                <EventRow event={nextOuting} variant="compact" headingLevel={4} personal={{ registered: true }} now={now} />
              </div>
            ) : (
              <p className="text-muted">
                Tu n&apos;es inscrit·e à rien pour l&apos;instant. Les dates arrivent au fil des annonces du bureau.
              </p>
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
                  Année {user.memberCard.season}, valable jusqu&apos;au {formatDayMonth(user.memberCard.validUntil)}.
                </p>
                <CellLink href={routes.account}>Sortir ma carte</CellLink>
              </>
            ) : (
              <>
                <StatusBadge tone="neutral">Pas encore prise</StatusBadge>
                {memberCard.price !== null && (
                  <p className="type-small text-muted">
                    {euros(memberCard.price)} l&apos;année universitaire
                    {memberCard.discount ? `, et ${memberCard.discount} sur nos événements.` : "."}
                  </p>
                )}
                <CellLink href={memberCard.href}>La carte cotisante</CellLink>
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

          {highlight && (
            <Cell title="Candidatures">
              <StatusBadge tone="info">{plural(applications.length, "en cours", "en cours")}</StatusBadge>
              <p className="type-small">
                <span className="font-bold">{highlight.campaign.association.name}</span>
                <span className="text-muted">
                  {" "}
                  ·{" "}
                  {highlight.position.title} · {APPLICATION_STATUS_LABEL[highlight.status].toLowerCase()}
                </span>
              </p>
              <CellLink href={routes.accountApplications}>Mes candidatures</CellLink>
            </Cell>
          )}
        </div>
      </div>
    </section>
  );
}

/** One fact of the strip. The lead cell (registrations) is wider and has no left rule. */
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
