import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getEventEditor, type EventRow } from "@/lib/events/editor";
import {
  EVENT_STAGE_LABEL,
  EVENT_STAGE_TONE,
  WIZARD_STEPS,
  eventChecklist,
  publicationDoneMessage,
  eventStage,
  type WizardStep,
} from "@/lib/events/model";
import { instantToParisLocal } from "@/lib/posts/schedule";
import { eventSeries } from "@/data/mock";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { DoneNotice, MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { InfosStep, InscriptionsStep, LieuStep, VisuelsStep, type StepBase } from "@/components/manage/events/EventSteps";
import { EventPublication } from "@/components/manage/events/EventPublication";
import { governanceErrorMessage } from "@/lib/governance/messages";

type Params = Promise<{ asso: string; event: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { event } = await params;
  if (!UUID.test(event)) return { title: "Événement introuvable" };
  const editor = await getEventEditor(event.toLowerCase());
  if (!editor.ok) return { title: "Événement" };
  return { title: editor.data.event.title.trim() || "Événement sans titre" };
}

const local = (iso: string | null) => (iso ? instantToParisLocal(iso) : { date: "", time: "" });

/**
 * /manage/[asso]/events/[event] — one event in the wizard (?etape= infos,
 * lieu, visuels, inscriptions, apercu, publication). public.event_editor
 * decides who may read it (its author with events.create while it is a
 * draft, or events.edit, events.publish, events.attendees.* in its own
 * association) and what they may do; an event of another association opens
 * in its own workspace. Each step saves through save_event, which checks
 * the right, the version and every rule again.
 */
export default async function EventWizardPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso, event: eventId } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("events", ctx.membership.permissions)) return <SectionDenied section="events" ctx={ctx} />;
  if (!UUID.test(eventId)) return <Unavailable asso={asso} message={governanceErrorMessage("event_not_found")} />;

  const editor = await getEventEditor(eventId.toLowerCase());
  if (!editor.ok) return <Unavailable asso={asso} message={governanceErrorMessage(editor.code)} />;
  const data = editor.data;
  if (data.organization.slug !== asso) redirect(routes.manageEvent(data.organization.slug, data.event.id));

  const now = new Date();
  const { event, summary, can } = data;
  const rawStep = Array.isArray(sp.etape) ? sp.etape[0] : sp.etape;
  const step: WizardStep = WIZARD_STEPS.some((s) => s.key === rawStep) ? (rawStep as WizardStep) : "infos";
  const readOnly = readOnlyReason(ctx);
  const cancelled = event.status === "cancelled";
  const editable = can.edit && !readOnly && !cancelled;
  const checklist = eventChecklist(event, now);
  const stage = eventStage(summary, now);
  const short = data.organization.short_name ?? data.organization.name;
  const isBde = can.series;
  const base: StepBase = { eventId: event.id, asso, version: event.version, isBde, disabled: !editable };
  const people = event.confirmed_count + event.waitlist_count;
  const needsPublishRight = Boolean(event.first_published_at) && !can.publish;
  const done = publicationDoneMessage(Array.isArray(sp.fait) ? sp.fait[0] : sp.fait);

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={
          <Link href={routes.manageEvents(asso)} className="inline-flex items-center gap-1.5 hover:underline">
            <Icon name="arrow-left" size={14} />
            Événements de {short}
          </Link>
        }
        title={event.title.trim() || "Sans titre"}
        meta={
          <>
            <StatusBadge tone={EVENT_STAGE_TONE[stage]}>{EVENT_STAGE_LABEL[stage]}</StatusBadge>
            {event.registration_mode === "internal" && event.first_published_at && (
              <span>
                {plural(event.confirmed_count, "inscrit·e", "inscrit·es")}
                {event.capacity !== null && ` sur ${event.capacity}`}
                {event.waitlist_count > 0 && ` · ${event.waitlist_count} en attente`}
              </span>
            )}
          </>
        }
        actions={
          <>
            <ButtonLink href={routes.eventPreview(event.id)} variant="secondary" icon="eye" iconPosition="start">
              Aperçu
            </ButtonLink>
            {can.attendees_view && event.registration_mode === "internal" && event.first_published_at && (
              <ButtonLink href={routes.manageEventParticipants(asso, event.id)} variant="secondary" icon="users" iconPosition="start">
                Participants
              </ButtonLink>
            )}
            {summary.is_public && event.slug && (
              <ButtonLink href={routes.event(event.slug)} variant="ghost" icon="arrow-up-right">
                En ligne
              </ButtonLink>
            )}
          </>
        }
      />

      <DoneNotice message={done} />

      {(readOnly || summary.hidden || cancelled || needsPublishRight || (!can.edit && !readOnly) || (can.publish && ctx.aal !== "aal2")) && (
        <div className="flex flex-col gap-3">
          {readOnly && <ReadOnlyNotice reason={readOnly} />}
          {summary.hidden && (
            <Notice tone="danger" icon="eye" title="Masqué par la modération du BDE">
              <p>
                Il n&apos;apparaît plus sur le site, mais il n&apos;est pas annulé : les inscriptions restent. Raison donnée
                par le BDE&nbsp;: {summary.hidden.reason}
              </p>
            </Notice>
          )}
          {cancelled && (
            <Notice tone="danger" icon="close" title="Événement annulé">
              <p>
                Il reste lisible à son adresse, avec la mention «&nbsp;Annulé&nbsp;»{event.cancellation_reason ? ` et la raison : ${event.cancellation_reason}` : ""}.
                Il ne se modifie plus.
              </p>
            </Notice>
          )}
          {!can.edit && !readOnly && (
            <Notice tone="info" icon="lock" title="Lecture seule pour toi">
              <p>Modifier cet événement demande le droit «&nbsp;Modifier les événements&nbsp;» (ou d&apos;en être l&apos;auteur, tant que c&apos;est un brouillon).</p>
            </Notice>
          )}
          {needsPublishRight && can.edit && (
            <Notice tone="info" icon="info" title="Événement déjà publié">
              <p>
                Tu peux corriger le texte et l&apos;image. Changer la date, le lieu ou les inscriptions d&apos;un événement
                publié demande le droit «&nbsp;Publier les événements&nbsp;» : le changement est annoncé aux inscrit·es.
              </p>
            </Notice>
          )}
          {can.publish && ctx.aal !== "aal2" && !readOnly && <MfaNotice what="Publier ou annuler un événement" />}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Étapes de l'événement" className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0">
          <ol className="flex min-w-max gap-1 border-b border-line lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:min-w-0 lg:flex-col lg:border-b-0 lg:border-l">
            {WIZARD_STEPS.map((s, i) => {
              const items = checklist.filter((c) => c.step === s.key && c.required);
              const ok = items.length > 0 && items.every((c) => c.ok);
              const todo = items.some((c) => !c.ok);
              const active = s.key === step;
              return (
                <li key={s.key}>
                  <Link
                    href={routes.manageEvent(asso, event.id, s.key)}
                    aria-current={active ? "step" : undefined}
                    className={cx(
                      "relative flex min-h-11 items-center gap-2.5 whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors lg:-ml-px lg:border-l-[3px] lg:border-transparent",
                      active ? "text-fg lg:border-assoc" : "text-muted hover:text-fg",
                    )}
                  >
                    <span className="type-meta text-[0.75rem] text-subtle">{i + 1}</span>
                    {s.label}
                    {ok && <Icon name="check" size={14} strokeWidth={2.5} className="text-ok" aria-label="complet" />}
                    {todo && <span className="size-1.5 rounded-full bg-warn" aria-label="à compléter" role="img" />}
                    <span aria-hidden className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc lg:hidden", active ? "opacity-100" : "opacity-0")} />
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 max-w-3xl">
          {step === "infos" && (
            <InfosStep
              base={base}
              values={{
                title: event.title,
                summary: event.summary ?? "",
                description: event.description ?? "",
                category_id: event.category_id ?? "",
                series_key: event.series_key ?? "",
                coorganizer_ids: data.coorganizers.map((c) => c.id),
              }}
              categories={data.categories}
              organizations={data.organizations}
              series={isBde ? eventSeries.map((s) => ({ slug: s.slug, name: s.name })) : []}
            />
          )}
          {step === "lieu" && <LieuStep base={base} values={placeValues(event)} notified={event.first_published_at ? people : 0} />}
          {step === "visuels" && (
            <VisuelsStep base={base} coverId={event.cover_media_id ?? ""} media={data.media} emblem={Boolean(event.series_key)} canUpload={can.upload} />
          )}
          {step === "inscriptions" && (
            <InscriptionsStep
              base={base}
              values={{
                registration_mode: event.registration_mode,
                external_url: event.external_url ?? "",
                capacity: event.capacity !== null ? String(event.capacity) : "",
                waitlist_enabled: event.waitlist_enabled,
                opens: local(event.registration_opens_at),
                closes: local(event.registration_closes_at),
                cancellation_cutoff_minutes: event.cancellation_cutoff_minutes,
                access_details: event.access_details ?? "",
              }}
              counts={{ confirmed: event.confirmed_count, waitlist: event.waitlist_count }}
            />
          )}
          {step === "apercu" && (
            <div className="flex flex-col gap-8">
              <section aria-labelledby="pret" className="flex flex-col gap-3">
                <h2 id="pret" className="type-label text-muted">
                  Avant de publier
                </h2>
                <ul className="flex flex-col border-y border-line">
                  {checklist.map((c) => (
                    <li key={c.label} className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
                      <span className="inline-flex items-center gap-2.5">
                        {c.ok ? (
                          <Icon name="check" size={16} strokeWidth={2.5} className="text-ok" />
                        ) : (
                          <Icon name={c.required ? "alert" : "info"} size={16} className={c.required ? "text-warn" : "text-subtle"} />
                        )}
                        <span className={cx("type-small", c.ok && "text-muted")}>{c.label}</span>
                        <span className="sr-only">{c.ok ? " : fait" : c.required ? " : à faire" : " : facultatif"}</span>
                      </span>
                      {!c.ok && (
                        <Link href={routes.manageEvent(asso, event.id, c.step)} className="link type-small font-bold">
                          Compléter
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="apercu-titre" className="flex flex-col gap-4">
                <h2 id="apercu-titre" className="type-label text-muted">
                  Tel que les étudiant·es le verront
                </h2>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={routes.eventPreview(event.id)} variant="secondary" icon="eye" iconPosition="start">
                    Ouvrir l&apos;aperçu
                  </ButtonLink>
                  <ButtonLink href={`${routes.eventPreview(event.id)}?vue=telephone`} variant="ghost" icon="arrow-up-right">
                    Sur téléphone
                  </ButtonLink>
                </div>
                {event.starts_at && event.ends_at ? (
                  <iframe
                    src={`${routes.eventPreview(event.id)}?cadre=1`}
                    title={`Aperçu de « ${event.title || "l'événement"} » sur téléphone`}
                    className="h-[720px] max-h-[75dvh] w-[390px] max-w-full self-center rounded-[2rem] border-[10px] border-fg bg-bg lg:self-start"
                  />
                ) : (
                  <p className="type-small text-muted">L&apos;aperçu s&apos;affiche ici dès que la date est fixée.</p>
                )}
              </section>
              <div>
                <ButtonLink href={routes.manageEvent(asso, event.id, "publication")} icon="arrow-right">
                  Passer à la publication
                </ButtonLink>
              </div>
            </div>
          )}
          {step === "publication" && (
            <EventPublication data={data} asso={asso} checklist={checklist} writable={!readOnly} now={now} />
          )}
        </div>
      </div>
    </div>
  );
}

function placeValues(event: EventRow) {
  return {
    starts: local(event.starts_at),
    ends: local(event.ends_at),
    location_type: event.location_type,
    venue_name: event.venue_name ?? "",
    address_line: event.address_line ?? "",
    city: event.city ?? "",
    latitude: event.latitude !== null ? String(event.latitude) : "",
    longitude: event.longitude !== null ? String(event.longitude) : "",
    online_url: event.online_url ?? "",
  };
}

/** The event cannot be opened (deleted draft, wrong link, someone else's draft): says so, nothing about it. */
function Unavailable({ asso, message }: { asso: string; message: string }) {
  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader title="Événement" />
      <ManageEmpty
        as="h2"
        icon="lock"
        title="Cet événement ne s'ouvre pas ici"
        actions={
          <ButtonLink href={routes.manageEvents(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
            Événements
          </ButtonLink>
        }
      >
        <p>{message}</p>
      </ManageEmpty>
    </div>
  );
}
