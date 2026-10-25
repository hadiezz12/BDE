import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { cx } from "@/lib/cx";
import { getManageContext } from "@/lib/data/manage";
import { getEventDashboard } from "@/lib/events/editor";
import { EVENT_DESK_VIEWS, inEventView, type EventDeskView, type EventSummary } from "@/lib/events/model";
import { ButtonLink, Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { DoneNotice, MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { EventDeskTable } from "@/components/manage/events/EventDeskTable";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "Événements" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae").toLowerCase();
}

function deskHref(asso: string, view: EventDeskView, q: string): string {
  const sp = new URLSearchParams();
  if (view !== "a-venir") sp.set("vue", view);
  if (q) sp.set("q", q);
  const qs = sp.toString();
  return qs ? `${routes.manageEvents(asso)}?${qs}` : routes.manageEvents(asso);
}

/**
 * /manage/[asso]/events — the association's events desk: what needs someone
 * (an event the BDE hid, e-mails that could not be delivered), then its
 * events by tab (?vue= à venir, brouillons, passés, annulés) and search
 * (?q=), with where each stands and its registration counts.
 *
 * public.event_dashboard checks the right and chooses the events: all of
 * them for the team (edit, publish, participants), one's own drafts for an
 * author who only creates. Counts only: who registered is behind
 * "Participants", for the positions holding that right. Every action behind
 * these links is checked again by the database.
 */
export default async function EventsDeskPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("events", ctx.membership.permissions)) return <SectionDenied section="events" ctx={ctx} />;
  const dashboard = await getEventDashboard(ctx.organization.id);
  if (!dashboard.ok) return <SectionDenied section="events" ctx={ctx} code={dashboard.code} />;

  const { organization, can, events } = dashboard.data;
  const now = new Date();
  const short = organization.short_name ?? organization.name;
  const readOnly = readOnlyReason(ctx);
  const writable = !readOnly;
  const needsMfa = writable && ctx.aal !== "aal2" && can.publish;
  const done = first(sp.fait) === "supprime" ? "Brouillon supprimé." : null;

  const rawView = first(sp.vue);
  const view: EventDeskView = EVENT_DESK_VIEWS.some((v) => v.key === rawView) ? (rawView as EventDeskView) : "a-venir";
  const q = (first(sp.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const needle = fold(q);
  const matching = needle
    ? events.filter((e) => fold([e.title, e.category ?? "", e.location.venue ?? "", e.created_by_name].join(" ")).includes(needle))
    : events;
  const counts = Object.fromEntries(
    EVENT_DESK_VIEWS.map((v) => [v.key, matching.filter((e) => inEventView(e, v.key, now)).length]),
  ) as Record<EventDeskView, number>;
  const shown = matching
    .filter((e) => inEventView(e, view, now))
    .sort((a, b) => order(a, b, view));

  const hidden = events.filter((e) => e.hidden);
  const undelivered = events.filter((e) => e.emails.failed > 0);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={short}
        title="Événements"
        description={
          <p>
            Les événements de {organization.name}, du brouillon à l&apos;agenda du campus, avec leurs inscriptions et leur
            liste d&apos;attente. Un brouillon reste privé jusqu&apos;à sa publication.
          </p>
        }
        meta={events.length > 0 ? <span>{plural(events.length, "événement")}</span> : undefined}
        actions={
          can.create && writable ? (
            <ButtonLink href={routes.manageEventNew(asso)} icon="plus" iconPosition="start">
              Nouvel événement
            </ButtonLink>
          ) : undefined
        }
      />

      {(done || readOnly || needsMfa || !organization.page_public) && (
        <div className="flex flex-col gap-3">
          <DoneNotice message={done} />
          {readOnly && <ReadOnlyNotice reason={readOnly} />}
          {needsMfa && <MfaNotice what="Publier ou annuler un événement" />}
          {!organization.page_public && organization.status !== "suspended" && organization.status !== "archived" && (
            <Notice tone="info" icon="globe" title="La page publique de l'asso n'est pas en ligne : ses événements non plus">
              <p>
                Tu peux déjà préparer les événements. Ils paraîtront dans l&apos;agenda une fois{" "}
                {organization.status === "setup" ? "l'asso rendue active par le BDE et sa page publiée" : "la page publiée"}.
              </p>
            </Notice>
          )}
        </div>
      )}

      {(hidden.length > 0 || undelivered.length > 0) && (
        <ManageSection title="À traiter" count={hidden.length + undelivered.length}>
          <ul className="flex flex-col gap-3">
            {hidden.map((e) => (
              <li key={`h-${e.id}`}>
                <Notice
                  tone="danger"
                  icon="eye"
                  title={`« ${e.title} » est masqué par la modération du BDE`}
                  action={
                    <ButtonLink href={routes.manageEvent(asso, e.id)} size="sm" variant="secondary" icon="arrow-right">
                      Ouvrir
                    </ButtonLink>
                  }
                >
                  <p>
                    Il n&apos;apparaît plus sur le site, mais il n&apos;est pas annulé : les inscriptions restent. Raison
                    donnée&nbsp;: {e.hidden?.reason}
                  </p>
                </Notice>
              </li>
            ))}
            {undelivered.map((e) => (
              <li key={`m-${e.id}`}>
                <Notice tone="warn" icon="mail" title={`${plural(e.emails.failed, "e-mail n'a", "e-mails n'ont")} pas pu être envoyé${e.emails.failed > 1 ? "s" : ""} pour « ${e.title} »`}>
                  <p>
                    Les messages restent visibles dans l&apos;espace des étudiant·es concerné·es (Notifications). Si le
                    problème dure, préviens le BDE : l&apos;envoi des e-mails se règle côté plateforme.
                  </p>
                </Notice>
              </li>
            ))}
          </ul>
        </ManageSection>
      )}

      {events.length === 0 ? (
        <ManageEmpty
          as="h2"
          icon="calendar"
          title={can.all ? "Pas encore d'événement" : "Tu n'as encore rien préparé"}
          actions={
            can.create && writable ? (
              <ButtonLink href={routes.manageEventNew(asso)} icon="plus" iconPosition="start">
                Nouvel événement
              </ButtonLink>
            ) : undefined
          }
        >
          <p>
            Un événement se prépare en quelques étapes (infos, lieu, visuel, inscriptions), se vérifie en aperçu, puis
            paraît dans l&apos;agenda du campus et sur la page de {short}.
          </p>
          {!can.create && <p>Les postes qui ont le droit «&nbsp;Créer des événements&nbsp;» les commencent.</p>}
        </ManageEmpty>
      ) : (
        <section aria-labelledby="desk-list" className="flex flex-col gap-4">
          <h2 id="desk-list" className="sr-only">
            Événements de {short}
          </h2>
          {!can.all && (
            <p className="max-w-2xl type-small text-muted">
              Tu vois ici les brouillons que tu as commencés. Les événements publiés sont gérés par les postes qui les
              modifient ou les publient.
            </p>
          )}
          <nav aria-label="Étapes des événements" className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:px-0">
            <ul className="flex min-w-max gap-1 border-b border-line">
              {EVENT_DESK_VIEWS.map((v) => {
                const active = v.key === view;
                return (
                  <li key={v.key}>
                    <Link
                      href={deskHref(asso, v.key, q)}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={cx(
                        "relative flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors",
                        active ? "text-fg" : "text-muted hover:text-fg",
                      )}
                    >
                      {v.label}
                      <span className={cx("type-meta text-[0.75rem]", active ? "text-fg" : "text-subtle")}>{counts[v.key]}</span>
                      <span
                        aria-hidden
                        className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc", active ? "opacity-100" : "opacity-0")}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {events.length > 3 && (
            <Form action={routes.manageEvents(asso)} role="search" className="flex max-w-xl items-end gap-3">
              {view !== "a-venir" && <input type="hidden" name="vue" value={view} />}
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="type-label text-muted">Chercher</span>
                <span className="relative">
                  <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <Input key={q} name="q" type="search" defaultValue={q} maxLength={80} placeholder="Titre, lieu, catégorie…" className="pl-10" />
                </span>
              </label>
              <Button type="submit" variant="secondary">
                Chercher
              </Button>
            </Form>
          )}
          {q && (
            <p role="status" className="type-meta text-muted">
              {plural(shown.length, "résultat")}
            </p>
          )}
          {shown.length > 0 ? (
            <EventDeskTable events={shown} asso={asso} can={can} caption={`Événements de ${organization.name}`} now={now} />
          ) : (
            <ManageEmpty icon={q ? "search" : "calendar"} title={q ? "Aucun événement ne correspond" : VIEW_EMPTY[view]}>
              {q && (
                <p>
                  <Link href={deskHref(asso, view, "")} className="link">
                    Effacer la recherche
                  </Link>
                </p>
              )}
            </ManageEmpty>
          )}
        </section>
      )}
    </div>
  );
}

const VIEW_EMPTY: Record<EventDeskView, string> = {
  "a-venir": "Rien de publié à venir",
  brouillons: "Aucun brouillon en cours",
  passes: "Aucun événement passé",
  annules: "Aucun événement annulé",
};

/** Soonest first for what's ahead, latest first for the past, freshest edit first for drafts. */
function order(a: EventSummary, b: EventSummary, view: EventDeskView): number {
  if (view === "brouillons") return Date.parse(b.updated_at) - Date.parse(a.updated_at);
  const at = (e: EventSummary) => (e.starts_at ? Date.parse(e.starts_at) : Number.MAX_SAFE_INTEGER);
  return view === "a-venir" ? at(a) - at(b) : at(b) - at(a);
}
