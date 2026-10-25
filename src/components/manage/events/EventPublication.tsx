import Link from "next/link";
import type { EventEditor } from "@/lib/events/editor";
import { EVENT_BLOCKER_LABEL, EVENT_STAGE_LABEL, eventStage, type ChecklistItem } from "@/lib/events/model";
import { AUDIT_ACTION_LABEL } from "@/lib/governance/labels";
import { routes } from "@/lib/routes";
import { formatDayFull, formatTime } from "@/lib/format";
import { cancelEvent, changeEventSlug, deleteEventDraft, publishEvent, setEventPin, unpublishEvent } from "@/app/actions/events";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { Notice } from "@/components/manage/governance/Notices";

/**
 * The wizard's last step: where the event stands, the one thing to do next
 * (publish, or what is missing first), then the rarer actions folded behind
 * their name — take it off the site, pin it on the association's page,
 * change its address, cancel it (irreversible, everyone registered is told),
 * delete a draft that was never online — and its history. Every button is
 * a database function that checks the right (events.publish for what goes
 * online, a second factor for publishing and cancelling) again.
 */
export function EventPublication({
  data,
  asso,
  checklist,
  writable,
  now,
}: {
  data: EventEditor;
  asso: string;
  checklist: ChecklistItem[];
  writable: boolean;
  now: Date;
}) {
  const { event, summary, can } = data;
  const stage = eventStage(summary, now);
  const missing = checklist.filter((c) => c.required && !c.ok);
  const published = event.publication === "published";
  const scheduled = event.status === "scheduled";
  const hold = { event_id: event.id };
  const back = { ...hold, organization_slug: asso };
  const people = event.confirmed_count + event.waitlist_count;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="statut" className="flex flex-col gap-4">
        <h2 id="statut" className="type-label text-muted">
          Où il en est
        </h2>
        <p className="type-headline text-[1.6rem]">{EVENT_STAGE_LABEL[stage]}</p>
        {summary.is_public && event.slug && (
          <p className="flex flex-wrap items-center gap-2 type-small">
            <Icon name="globe" size={15} className="text-muted" />
            En ligne à l&apos;adresse{" "}
            <Link href={routes.event(event.slug)} className="link font-mono text-[0.85rem]">
              {routes.event(event.slug)}
            </Link>
          </p>
        )}
        {event.prominence === "featured" && (
          <p className="type-small text-accent-text">Le BDE l&apos;a mis à l&apos;affiche du site.</p>
        )}
      </section>

      {writable && can.publish && scheduled && !published && (
        <section aria-labelledby="publier" className="flex flex-col gap-4">
          <h2 id="publier" className="type-title text-[1.5rem]">
            {event.first_published_at ? "Remettre en ligne" : "Publier"}
          </h2>
          {missing.length > 0 ? (
            <Notice tone="info" icon="info" title="Encore quelques éléments avant de publier">
              <ul className="mt-1 flex flex-col gap-1">
                {missing.map((m) => (
                  <li key={m.label}>
                    <Link href={routes.manageEvent(asso, event.id, m.step)} className="link">
                      {m.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Notice>
          ) : summary.blocker ? (
            <Notice tone="warn" icon="alert" title={`Publication impossible pour l'instant : ${EVENT_BLOCKER_LABEL[summary.blocker] ?? summary.blocker}.`} />
          ) : (
            <ActionForm action={publishEvent} hidden={back} submitLabel={event.first_published_at ? "Remettre en ligne" : "Publier l'événement"} submitIcon="arrow-right">
              <p className="max-w-2xl type-small text-muted">
                Il paraît dans l&apos;agenda, le calendrier et sur la page de l&apos;asso
                {event.registration_mode === "internal" ? " ; les inscriptions s'ouvrent à l'heure prévue" : ""}.
                {!event.first_published_at && " Son adresse est fixée à partir du titre."}
              </p>
            </ActionForm>
          )}
        </section>
      )}

      {writable && !can.publish && !published && scheduled && (
        <Notice tone="info" icon="lock" title="La publication revient à un autre poste">
          <p>
            Les postes qui ont le droit «&nbsp;Publier les événements&nbsp;» le mettent en ligne. Préviens-les quand il est
            prêt&nbsp;: ils le verront dans les brouillons de l&apos;asso.
          </p>
        </Notice>
      )}

      {writable && can.publish && (published || scheduled) && (
        <section aria-labelledby="plus" className="flex flex-col gap-3">
          <h2 id="plus" className="type-label text-muted">
            Autres actions
          </h2>
          {published && scheduled && (
            <ActionForm
              action={setEventPin}
              hidden={{ ...hold, pinned: event.pinned_at ? "0" : "1" }}
              submitLabel={event.pinned_at ? "Désépingler de la page de l'asso" : "Épingler en tête de la page de l'asso"}
              submitIcon="pushpin"
              variant="secondary"
              size="sm"
            />
          )}
          {published && event.slug && (
            <Disclosure summary="Changer l'adresse" icon="link">
              <ActionForm action={changeEventSlug} hidden={hold} submitLabel="Changer l'adresse" variant="secondary">
                <Field label="Nouvelle adresse" hint="Minuscules, chiffres et tirets. L'ancienne redirige vers la nouvelle.">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="slug" defaultValue={event.slug ?? ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} required />
                  )}
                </Field>
              </ActionForm>
            </Disclosure>
          )}
          {published && (
            <Disclosure summary="Retirer du site" icon="eye">
              <ActionForm action={unpublishEvent} hidden={back} submitLabel="Retirer du site" variant="secondary">
                <p className="max-w-2xl type-small text-muted">
                  {people > 0
                    ? "Impossible tant que des personnes sont inscrites ou en attente : annule l'événement si il n'a pas lieu."
                    : "Il disparaît de l'agenda et de la page de l'asso ; tu pourras le remettre en ligne. Pour un événement qui n'aura pas lieu, annule-le plutôt."}
                </p>
                <Field label="Raison (pour l'historique)" optional>
                  {({ id }) => <Input id={id} name="reason" maxLength={500} />}
                </Field>
              </ActionForm>
            </Disclosure>
          )}
          {event.first_published_at && scheduled && (
            <Disclosure summary="Annuler l'événement" icon="close" tone="danger">
              <ActionForm action={cancelEvent} hidden={back} submitLabel="Annuler l'événement" variant="danger">
                <p className="max-w-2xl type-small">
                  <strong>Irréversible.</strong> La page reste en ligne avec la mention «&nbsp;Annulé&nbsp;» et ta raison ; plus
                  personne ne peut s&apos;inscrire,{" "}
                  {people > 0 ? `et les ${people} personnes inscrites ou en attente sont prévenues.` : "et personne n'était inscrit."}
                </p>
                <Field label="Raison, lue par les inscrit·es" hint="Ex : salle indisponible, report à une date à fixer…">
                  {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={3} maxLength={500} required minLength={3} />}
                </Field>
              </ActionForm>
            </Disclosure>
          )}
        </section>
      )}

      {writable && can.delete && !event.first_published_at && (
        <Disclosure summary="Supprimer le brouillon" icon="close" tone="danger">
          <ActionForm action={deleteEventDraft} hidden={{ ...hold, organization_slug: asso }} submitLabel="Supprimer définitivement" variant="danger">
            <p className="max-w-2xl type-small">Il n&apos;a jamais été en ligne : il est supprimé pour de bon, avec son historique de brouillon.</p>
          </ActionForm>
        </Disclosure>
      )}

      <section aria-labelledby="historique" className="flex flex-col gap-4">
        <h2 id="historique" className="type-label text-muted">
          Historique
        </h2>
        <p className="max-w-2xl type-small text-subtle">
          Commencé par {data.creator_name}. Les changements de date, de lieu et d&apos;inscriptions d&apos;un événement publié
          sont gardés ici, avec qui les a faits.
        </p>
        {data.history.length > 0 ? (
          <ol className="flex flex-col border-y border-line">
            {data.history.map((h, i) => (
              <li key={`${h.occurred_at}-${i}`} className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0">
                <span className="type-meta text-muted">
                  {formatDayFull(h.occurred_at)} à {formatTime(h.occurred_at)}
                </span>
                <span className="type-small">
                  <strong>{h.actor_name ?? "Le système"}</strong> {AUDIT_ACTION_LABEL[h.action] ?? h.action}
                </span>
                {h.reason && <span className="type-small text-muted">Raison : {h.reason}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="type-small text-muted">Rien encore : l&apos;historique commence à la première publication.</p>
        )}
      </section>
    </div>
  );
}
