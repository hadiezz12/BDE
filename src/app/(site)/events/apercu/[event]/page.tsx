import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { getAuthContext } from "@/lib/auth/context";
import { getAssociationById } from "@/lib/data/associations";
import { getEventSeriesBySlug } from "@/lib/data/event-series";
import { getEventPreview } from "@/lib/events/editor";
import { EVENT_BLOCKER_LABEL, toEventItem } from "@/lib/events/model";
import { governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { EventView } from "../../[slug]/_components/EventView";

type Props = {
  params: Promise<{ event: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = {
  title: "Aperçu de l'événement",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /events/apercu/[event] — the event exactly as its public page shows it,
 * for its team only: event_preview checks the right (any refusal is the
 * lock below, never data), a draft cover comes from the private preview
 * route, the page is never indexed and nothing on it acts (no registration,
 * no calendar file, no share). ?vue=telephone frames it at phone width
 * (?cadre=1 is the framed page itself, without this banner).
 */
export default async function EventPreviewPage({ params, searchParams }: Props) {
  const { event: eventId } = await params;
  const sp = await searchParams;
  const valid = UUID.test(eventId);
  const self = routes.eventPreview(valid ? eventId.toLowerCase() : eventId);

  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") redirect(`${routes.login}?next=${encodeURIComponent(self)}`);
  if (!valid) return <Refusal code="event_not_found" />;

  const preview = await getEventPreview(eventId.toLowerCase());
  if (!preview.ok) return <Refusal code={preview.code} />;
  const p = preview.data;

  if (!p.starts_at || !p.ends_at) {
    return (
      <div className="wrap py-[var(--section)]">
        <EmptyState
          mark={<Icon name="calendar" size={44} />}
          title="Pas encore d'aperçu"
          actions={
            <ButtonLink href={routes.manageEvent(p.organization.slug, p.id, "infos")} icon="arrow-right">
              Ajouter la date
            </ButtonLink>
          }
        >
          L&apos;aperçu se construit autour de la date : ajoute le début et la fin de l&apos;événement, puis reviens ici.
        </EmptyState>
      </div>
    );
  }

  const event = toEventItem({ ...p, slug: p.slug ?? "apercu", description: p.description }, { preview: true });
  const [association, series] = await Promise.all([
    getAssociationById(event.associationId).catch(() => null),
    event.seriesKey ? getEventSeriesBySlug(event.seriesKey) : Promise.resolve(null),
  ]);
  const view = (
    <EventView
      event={event}
      preview
      user={null}
      personal={null}
      reference={null}
      accessDetails={null}
      canSave={false}
      manages={false}
      association={association}
      series={series}
      related={[]}
      personalFor={() => undefined}
      url={self}
      now={new Date()}
    />
  );
  if (sp.cadre === "1") return view;

  const phone = sp.vue === "telephone";
  const where = p.is_public
    ? "C'est ce que tout le monde voit à l'adresse de l'événement."
    : p.publication === "draft"
      ? "Brouillon : seule l'équipe de l'asso le voit ici."
      : p.publication === "unpublished"
        ? "Retiré du site : seule l'équipe de l'asso le voit ici."
        : "Pas visible en ligne pour l'instant.";

  return (
    <>
      <section aria-label="Aperçu de l'événement" data-surface="paper" className="border-b-2 border-dashed border-fg">
        <div className="wrap flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="type-label">Aperçu · {p.is_public ? "en ligne" : p.publication === "draft" ? "brouillon" : "hors ligne"}</p>
            <p className="type-small text-muted">{where}</p>
            {p.blocker && !p.is_public && (
              <p className="inline-flex items-start gap-1.5 type-small font-bold">
                <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-danger" />
                {EVENT_BLOCKER_LABEL[p.blocker] ?? p.blocker}
              </p>
            )}
            {p.access_details && (
              <p className="type-small text-muted">
                Les infos réservées aux inscrit·es ne figurent pas dans l&apos;aperçu : seule une place confirmée les voit.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Taille de l'aperçu" className="flex rounded-sm border border-line-strong p-0.5">
              {[
                { href: self, label: "Ordinateur", active: !phone },
                { href: `${self}?vue=telephone`, label: "Téléphone", active: phone },
              ].map((v) => (
                <Link
                  key={v.label}
                  href={v.href}
                  aria-current={v.active ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-10 items-center px-3 type-small font-semibold",
                    v.active ? "rounded-xs bg-fg text-bg" : "text-muted hover:text-fg",
                  )}
                >
                  {v.label}
                </Link>
              ))}
            </nav>
            <ButtonLink href={routes.manageEvent(p.organization.slug, p.id)} variant="secondary" size="sm" icon="edit" iconPosition="start">
              Revenir à l&apos;éditeur
            </ButtonLink>
            {p.is_public && p.slug && (
              <ButtonLink href={routes.event(p.slug)} variant="ghost" size="sm" icon="arrow-up-right">
                Voir en ligne
              </ButtonLink>
            )}
          </div>
        </div>
      </section>

      {phone ? (
        <div className="wrap flex justify-center py-8">
          <iframe
            src={`${self}?cadre=1`}
            title={`Aperçu de « ${p.title || "l'événement"} » sur téléphone`}
            className="h-[844px] max-h-[80dvh] w-[390px] max-w-full rounded-[2rem] border-[10px] border-fg bg-bg"
          />
        </div>
      ) : (
        view
      )}
    </>
  );
}

/** Not on the event's team, or an unknown event: one sentence, nothing else. */
function Refusal({ code }: { code: GovernanceErrorCode }) {
  return (
    <div className="wrap py-[var(--section)]">
      <EmptyState
        mark={<Icon name="lock" size={44} />}
        title="Aperçu réservé à l'équipe de l'asso"
        actions={
          <ButtonLink href={routes.events} variant="secondary" icon="arrow-right">
            L&apos;agenda
          </ButtonLink>
        }
      >
        {governanceErrorMessage(code)}
      </EmptyState>
    </div>
  );
}
