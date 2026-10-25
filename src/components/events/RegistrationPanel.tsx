import Link from "next/link";
import type { EventItem, UserProfile } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { formatDayFull, formatTime, plural } from "@/lib/format";
import { ordinal } from "@/lib/events/model";
import { cutoffLabel } from "@/lib/events/input";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RegistrationState } from "./RegistrationState";
import { EventTicket } from "./EventTicket";
import { CancelRegistration, EventActionNotice, RegisterButton, SaveToggle } from "./EventActions";
import { ACTION_LABEL, type EventAction, type PersonalRegistration } from "./event-action";

/**
 * The event page's registration ticket: where registration stands (with the
 * fill meter when seats are counted), the exact opening, closing and
 * cancellation times, and the one thing to do now — register, join the
 * waiting list, go to the organizer's page, or, once registered, the ticket
 * (with the private joining details, confirmed seats only) and the way to
 * cancel. Sticky beside the page on desktop; inline under the hero on
 * phones, where `actions={false}` leaves the buttons to the sticky
 * EventActionBar so they never show twice.
 */
export function RegistrationPanel({
  event,
  action,
  user,
  personal,
  reference,
  accessDetails,
  canSave,
  loginHref,
  headingId,
  actions = true,
  now = new Date(),
  className,
}: {
  event: EventItem;
  action: EventAction;
  /** Session user; null for a visitor. */
  user: UserProfile | null;
  personal: PersonalRegistration | null;
  /** The registration's reference (to quote to the organizers). */
  reference: string | null;
  /** Private instructions, given to a confirmed seat only (my_event_status). */
  accessDetails: string | null;
  canSave: boolean;
  /** Login with ?next= back to this page. */
  loginHref: string;
  /** Unique per render: the panel appears twice (phone inline + desktop aside). */
  headingId: string;
  actions?: boolean;
  now?: Date;
  className?: string;
}) {
  const r = event.registration;
  const upcoming = !action.past && event.status !== "cancelled";
  const when = (iso: string) => `${formatDayFull(iso)} à ${formatTime(iso)}`;
  const rows: Array<{ label: string; value: string; mono?: boolean }> = [];
  if (r.mode === "internal") {
    rows.push({ label: "Jauge", value: r.capacity !== undefined ? plural(r.capacity, "place") : "Pas de limite", mono: true });
    if (upcoming && r.opensAt && Date.parse(r.opensAt) > now.getTime()) rows.push({ label: "Ouverture", value: when(r.opensAt) });
    if (upcoming && r.closesAt && Date.parse(r.closesAt) > now.getTime()) rows.push({ label: "Clôture", value: when(r.closesAt) });
    if (upcoming && r.cancellationCutoffMinutes > 0) {
      rows.push({ label: "Annulation", value: `${cutoffLabel(r.cancellationCutoffMinutes).toLowerCase()} le début` });
    }
  }

  const cta = action.kind === "register" || action.kind === "waitlist" ? action.kind : null;
  const showNotice = actions && Boolean(user);
  const removed = personal?.status === "cancelled" && personal.cancelSource === "organizer";

  return (
    <section
      aria-labelledby={headingId}
      className={cx("flex flex-col rounded-sm border border-line-strong bg-raised", className)}
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 id={headingId} className="type-label text-muted">
          {r.mode === "none" ? "Participer" : "Inscription"}
        </h2>
        <RegistrationState event={event} meter now={now} />
        {rows.length > 0 && (
          <dl className="flex flex-col border-t border-line">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
                <dt className="type-label text-muted">{row.label}</dt>
                <dd className={cx("text-right", row.mono ? "type-meta" : "type-small font-bold")}>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {r.mode === "internal" && !action.past && (
          <p className="type-caption">Inscription en ligne, liée à ton compte de l&apos;école.</p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t-2 border-dashed border-line-strong/50 p-5 sm:p-6">
        {action.kind === "confirmed" && user && (
          <>
            <EventTicket event={event} holder={user} reference={reference} now={now} />
            {accessDetails && (
              <div className="flex flex-col gap-1.5 rounded-sm border-2 border-ok/50 bg-ok/5 p-3">
                <p className="inline-flex items-center gap-1.5 type-label text-ok">
                  <Icon name="lock" size={14} />
                  Pour les inscrit·es
                </p>
                <p className="whitespace-pre-line break-words type-small">{accessDetails}</p>
              </div>
            )}
            {actions && personal?.canCancel && <CancelRegistration waitlisted={false} />}
            {actions && personal && !personal.canCancel && (
              <p className="type-small text-muted">Il est trop tard pour annuler en ligne : préviens l&apos;asso si tu ne peux pas venir.</p>
            )}
          </>
        )}

        {action.kind === "waitlisted" && personal && (
          <div className="flex flex-col gap-2 rounded-sm border-2 border-info/50 bg-info/5 p-4">
            <p className="inline-flex items-center gap-1.5 type-label text-info">
              <Icon name="clock" size={15} />
              Liste d&apos;attente
            </p>
            <p className="type-headline text-[1.6rem]">
              {personal.position ? `${ordinal(personal.position)} sur la liste` : "Tu es sur la liste"}
            </p>
            <p className="type-small text-muted">Ta place peut monter quand d&apos;autres annulent.</p>
          </div>
        )}
        {action.kind === "waitlisted" && actions && personal?.canCancel && <CancelRegistration waitlisted />}

        {(action.kind === "confirmed" || action.kind === "waitlisted") && (
          <Link
            href={routes.accountEvents}
            className="inline-flex items-center gap-1.5 self-start type-small font-bold hover:text-assoc-text"
          >
            Tous mes événements
            <Icon name="arrow-right" size={15} />
          </Link>
        )}

        {removed && (
          <p className="rounded-sm border-2 border-line-strong p-3 type-small">
            <strong>L&apos;asso a retiré ton inscription.</strong>
            {personal?.cancelReason ? <> Raison donnée&nbsp;: {personal.cancelReason}</> : null}
          </p>
        )}

        {action.note && (
          <p className={cx("type-small", action.past && "inline-flex items-start gap-1.5 font-bold text-muted")}>
            {action.past && <Icon name="check" size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" />}
            {action.note}
          </p>
        )}

        {action.kind === "external" && r.externalUrl && actions && (
          <ButtonLink href={r.externalUrl} variant="assoc" size="lg" icon="external" block target="_blank" rel="noopener noreferrer">
            {ACTION_LABEL.external}
            <span className="sr-only"> (site extérieur, nouvel onglet)</span>
          </ButtonLink>
        )}

        {cta && !user && (
          <>
            <p className="type-small text-muted">
              Connecte-toi avec ton adresse de l&apos;école : ton inscription est liée à ton compte.
            </p>
            {actions && (
              <ButtonLink href={loginHref} variant="assoc" size="lg" icon="arrow-right" block>
                {cta === "register" ? "Se connecter pour s'inscrire" : "Se connecter pour la liste"}
              </ButtonLink>
            )}
          </>
        )}

        {cta && user && actions && (
          <>
            <RegisterButton size="lg" block>
              {ACTION_LABEL[cta]}
            </RegisterButton>
            {cta === "waitlist" && (
              <p className="type-caption">
                Si une place se libère avant la clôture, elle t&apos;est attribuée automatiquement, dans l&apos;ordre : tu seras prévenu·e.
              </p>
            )}
          </>
        )}

        {canSave && actions && <SaveToggle />}
        {showNotice && <EventActionNotice />}
      </div>
    </section>
  );
}
