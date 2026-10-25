import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDayShort, formatTime, plural } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getPlatformEvents, type PlatformEvent } from "@/lib/events/editor";
import { REGISTRATION_STATE_LABEL } from "@/lib/events/model";
import { organizationRef } from "@/lib/posts/model";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { hideEvent, restoreEventVisibility, setEventProminence } from "@/app/actions/events";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "Événements" };

const VIEWS = [
  { key: "a-venir", label: "À venir", rpc: "upcoming" },
  { key: "passes", label: "Passés", rpc: "past" },
  { key: "masques", label: "Masqués", rpc: "hidden" },
] as const;

/** Featured events shown on the agenda and the home page at once (set_event_prominence refuses a fourth). */
const FEATURED_LIMIT = 3;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /manage/plateforme/evenements — the site's events for the BDE: public
 * information and counts only (platform_events), never a participant, a
 * draft or the private joining details. Two separate rights:
 *  - platform.content.moderate: hide an event that breaks the rules, or
 *    restore it, with a reason the association reads (hiding is not
 *    cancelling: registrations stay, the association keeps its event);
 *  - platform.content.feature: put an event "à l'affiche" of the agenda and
 *    the home page (three at most, 60 days at most), distinct from the pin
 *    an association puts on its own page.
 * Both need the second factor and are recorded in the audit.
 */
export default async function PlatformEventsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  const canModerate = hasPlatform(access, "platform.content.moderate");
  const canFeature = hasPlatform(access, "platform.content.feature");
  if (!canModerate && !canFeature) return <PlatformDenied title="Événements" right="Modérer ou mettre en avant" />;

  const viewKey = VIEWS.find((v) => v.key === first(sp.vue))?.key ?? "a-venir";
  const view = VIEWS.find((v) => v.key === viewKey)!;
  const q = (first(sp.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const [list, upcoming] = await Promise.all([
    getPlatformEvents(q || null, view.rpc),
    view.rpc === "upcoming" ? null : getPlatformEvents(null, "upcoming"),
  ]);
  if (!list.ok) {
    return (
      <Notice tone="danger" icon="alert" title="La liste n'a pas pu être chargée.">
        <p>{governanceErrorMessage(list.code)}</p>
      </Notice>
    );
  }
  const events = list.data;
  const ahead = upcoming?.ok ? upcoming.data : events;
  const live = ahead.filter((e) => e.prominence === "featured" && !e.hidden);
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const now = new Date();
  const href = (key: string) => {
    const p = new URLSearchParams();
    if (key !== "a-venir") p.set("vue", key);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `${routes.managePlatformEvents}?${qs}` : routes.managePlatformEvents;
  };

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Événements"
        description={
          <p>
            Les événements publiés par les assos, tels que tout le monde les voit. Le BDE peut en mettre à l&apos;affiche ou
            en masquer un qui enfreint les règles ; il ne voit ni les brouillons, ni qui s&apos;est inscrit, ni les infos réservées,
            et ne modifie jamais un événement d&apos;asso.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="Masquer, rétablir ou mettre à l'affiche un événement" />}

      {canFeature && (
        <StatGroup label="Affiche" columns={2}>
          <StatTile
            label="À l'affiche"
            value={live.length}
            of={FEATURED_LIMIT}
            comparison={live.length >= FEATURED_LIMIT ? "Complet : retires-en un pour en mettre un autre" : undefined}
            tone={live.length >= FEATURED_LIMIT ? "accent" : "neutral"}
          />
          <StatTile label="Publiés à venir" value={ahead.length} comparison={ahead.length >= 100 ? "Les 100 premiers" : undefined} />
        </StatGroup>
      )}

      <div className="flex flex-col gap-4">
        <nav aria-label="Vues" className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:px-0">
          <ul className="flex min-w-max gap-1 border-b border-line">
            {VIEWS.map((v) => {
              const active = v.key === viewKey;
              return (
                <li key={v.key}>
                  <Link
                    href={href(v.key)}
                    scroll={false}
                    aria-current={active ? "true" : undefined}
                    className={cx(
                      "relative flex min-h-11 items-center whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors",
                      active ? "text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    {v.label}
                    <span aria-hidden className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc", active ? "opacity-100" : "opacity-0")} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <Form action={routes.managePlatformEvents} role="search" className="flex max-w-xl items-stretch gap-2">
          {viewKey !== "a-venir" && <input type="hidden" name="vue" value={viewKey} />}
          <label htmlFor="evt-q" className="sr-only">
            Chercher un événement
          </label>
          <Input key={q} id="evt-q" name="q" type="search" defaultValue={q} placeholder="Titre ou asso" autoComplete="off" maxLength={80} className="min-w-0 flex-1" />
          <Button type="submit" variant="secondary" icon="search">
            <span className="max-sm:sr-only">Chercher</span>
          </Button>
        </Form>
        {events.length >= 100 && <p className="type-small text-muted">Les 100 premiers sont affichés : affine la recherche.</p>}
      </div>

      {events.length === 0 ? (
        <ManageEmpty icon="calendar" title={q ? "Aucun événement ne correspond" : viewKey === "masques" ? "Aucun événement masqué" : "Aucun événement ici"}>
          <p>Seuls les événements déjà publiés par une asso apparaissent ici.</p>
        </ManageEmpty>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <PlatformEventCard event={e} canModerate={canModerate} canFeature={canFeature} featuredFull={live.length >= FEATURED_LIMIT} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlatformEventCard({
  event: e,
  canModerate,
  canFeature,
  featuredFull,
  now,
}: {
  event: PlatformEvent;
  canModerate: boolean;
  canFeature: boolean;
  featuredFull: boolean;
  now: Date;
}) {
  const over = Date.parse(e.ends_at) <= now.getTime();
  const featured = e.prominence === "featured";
  const hold = { event_id: e.id };
  return (
    <article className="flex flex-col gap-4 rounded-md border border-line bg-raised px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <AssociationLogo association={organizationRef(e.organization)} size={40} className="shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-bold leading-snug">
            {e.is_public && e.slug ? (
              <Link href={routes.event(e.slug)} className="hover:underline">
                {e.title}
              </Link>
            ) : (
              e.title
            )}
          </h2>
          <p className="type-meta text-muted">
            {formatDayShort(e.starts_at)} à {formatTime(e.starts_at)} · {e.organization.short_name ?? e.organization.name}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            {e.hidden && <StatusBadge tone="danger">Masqué</StatusBadge>}
            {e.status === "cancelled" && <StatusBadge tone="danger">Annulé</StatusBadge>}
            {e.publication !== "published" && <StatusBadge tone="neutral">Retiré par l&apos;asso</StatusBadge>}
            {featured && !e.hidden && <StatusBadge tone="accent">À l&apos;affiche</StatusBadge>}
            {e.pinned && <StatusBadge tone="neutral">Épinglé par l&apos;asso</StatusBadge>}
            {!over && e.status === "scheduled" && (
              <span className="type-meta text-subtle">
                {REGISTRATION_STATE_LABEL[e.registration.state]}
                {e.registration.mode === "internal" && ` · ${plural(e.registration.confirmed, "inscrit·e", "inscrit·es")}`}
              </span>
            )}
          </p>
          {e.hidden && (
            <p className="type-small text-muted">
              Masqué le {formatDayShort(e.hidden.at)}
              {e.hidden.by_name ? ` par ${e.hidden.by_name}` : ""} : {e.hidden.reason}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 lg:w-80">
        {canFeature && !e.hidden && !over && e.status === "scheduled" && e.publication === "published" &&
          (featured ? (
            <ActionForm action={setEventProminence} hidden={{ ...hold, prominence: "normal" }} submitLabel="Retirer de l'affiche" variant="secondary" size="sm" />
          ) : featuredFull ? (
            <p className="type-small text-subtle">Affiche complète (3).</p>
          ) : (
            <Disclosure summary="Mettre à l'affiche" icon="bookmark" tone="primary">
              <ActionForm action={setEventProminence} hidden={{ ...hold, prominence: "featured" }} submitLabel="Mettre à l'affiche" size="sm">
                <Field label="Jusqu'au" optional hint="60 jours au plus. Vide : jusqu'à la fin de l'événement.">
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="until" type="date" />}
                </Field>
              </ActionForm>
            </Disclosure>
          ))}
        {canModerate &&
          (e.hidden ? (
            <Disclosure summary="Rétablir" icon="eye">
              <ActionForm action={restoreEventVisibility} hidden={hold} submitLabel="Rétablir l'événement" size="sm">
                <Field label="Raison (historique)">{({ id }) => <Textarea id={id} name="reason" rows={2} maxLength={500} required minLength={3} />}</Field>
              </ActionForm>
            </Disclosure>
          ) : (
            <Disclosure summary="Masquer" icon="eye" tone="danger">
              <ActionForm action={hideEvent} hidden={hold} submitLabel="Masquer l'événement" variant="danger" size="sm">
                <p className="type-small">
                  Il disparaît du site sans être annulé : les inscriptions restent, l&apos;asso voit ta raison et peut corriger.
                </p>
                <Field label="Raison, lue par l'asso">{({ id }) => <Textarea id={id} name="reason" rows={2} maxLength={500} required minLength={3} />}</Field>
              </ActionForm>
            </Disclosure>
          ))}
      </div>
    </article>
  );
}
