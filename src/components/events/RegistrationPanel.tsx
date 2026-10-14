import Link from "next/link";
import type { EventItem, PostItem, UserProfile } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { formatDayFull, formatTime, plural } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RegistrationState } from "./RegistrationState";
import { EventTicket } from "./EventTicket";
import { EventDemoNotice, RegisterButton, SaveToggle } from "./EventActions";
import { ACTION_LABEL, type EventAction } from "./event-action";

/**
 * The event page's registration ticket: where registration stands (with the
 * fill meter), the exact opening / closing times, member vs full price, and
 * the one thing to do now. Sticky beside the page on desktop; inline under
 * the hero on phones, where `actions={false}` leaves the buttons to the
 * sticky EventActionBar so they never show twice.
 */
export function RegistrationPanel({
  event,
  action,
  user,
  canSave,
  loginHref,
  recap,
  headingId,
  actions = true,
  bdeEvent,
  now = new Date(),
  className,
}: {
  event: EventItem;
  action: EventAction;
  /** Session user (student or officer); null for a visitor. */
  user: UserProfile | null;
  canSave: boolean;
  /** Login with ?next= back to this page. */
  loginHref: string;
  recap: Pick<PostItem, "slug" | "title"> | null;
  /** Unique per render: the panel appears twice (phone inline + desktop aside). */
  headingId: string;
  actions?: boolean;
  /** Organised by the BDE: the member price is the carte cotisante price. */
  bdeEvent?: boolean;
  now?: Date;
  className?: string;
}) {
  const r = event.registration;
  const upcoming = !action.past;
  const when = (iso: string) => `${formatDayFull(iso)} à ${formatTime(iso)}`;
  const rows: Array<{ label: string; value: string; mono?: boolean }> = [];
  if (r.capacity !== undefined) rows.push({ label: "Jauge", value: plural(r.capacity, "place"), mono: true });
  if (upcoming && r.opensAt && Date.parse(r.opensAt) > now.getTime()) rows.push({ label: "Ouverture", value: when(r.opensAt) });
  if (upcoming && r.closesAt && Date.parse(r.closesAt) > now.getTime()) rows.push({ label: "Clôture", value: when(r.closesAt) });

  const cta = action.kind === "register" || action.kind === "waitlist" ? action.kind : null;
  const showNotice = actions && Boolean(user) && (cta !== null || canSave);

  return (
    <section
      aria-labelledby={headingId}
      className={cx("flex flex-col rounded-sm border border-line-strong bg-raised", className)}
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 id={headingId} className="type-label text-muted">
          Inscription
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
      </div>

      <Price price={event.price} memberNote={bdeEvent && user?.memberCard && upcoming ? user.memberCard.number : null} />

      <div className="flex flex-col gap-3 border-t-2 border-dashed border-line-strong/50 p-5 sm:p-6">
        {action.kind === "registered" && user && (
          <>
            <EventTicket event={event} holder={user} now={now} />
            <Link
              href={routes.accountEvents}
              className="inline-flex items-center gap-1.5 self-start type-small font-bold hover:text-assoc-text"
            >
              Tous mes événements
              <Icon name="arrow-right" size={15} />
            </Link>
          </>
        )}

        {action.note && (
          <p className={cx("type-small", action.past && "inline-flex items-start gap-1.5 font-bold text-muted")}>
            {action.past && <Icon name="check" size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" />}
            {action.note}
          </p>
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
          <RegisterButton action={cta} size="lg" block>
            {ACTION_LABEL[cta]}
          </RegisterButton>
        )}

        {canSave && actions && <SaveToggle />}
        {showNotice && <EventDemoNotice />}

        {action.past &&
          (recap ? (
            <ButtonLink href={routes.post(recap.slug)} variant="secondary" icon="arrow-right" block>
              Lire le récap
            </ButtonLink>
          ) : (
            <p className="type-small text-muted">Pas de récap publié pour celui-ci.</p>
          ))}
      </div>
    </section>
  );
}

/** Member vs full price, as big numerals. Free is said in words. */
function Price({
  price,
  memberNote,
}: {
  price: EventItem["price"];
  /** Card number when the viewer's carte cotisante gets them the member price. */
  memberNote: string | null;
}) {
  const eur = (n: number) => n.toLocaleString("fr-FR");
  if (!price) {
    return (
      <div className="flex items-baseline justify-between gap-4 border-t border-line px-5 py-4 sm:px-6">
        <p className="type-label text-muted">Prix</p>
        <p className="type-headline">Gratuit</p>
      </div>
    );
  }
  const member = price.member !== undefined && price.member !== price.standard ? price.member : null;
  const tiers = member !== null
    ? [
        { label: "Adhérent·e", value: member },
        { label: "Plein tarif", value: price.standard },
      ]
    : [{ label: "Tarif unique", value: price.standard }];

  return (
    <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:px-6">
      <dl className={cx("grid", tiers.length > 1 && "grid-cols-2")}>
        {tiers.map((t, i) => (
          <div key={t.label} className={cx("flex flex-col gap-1.5", i > 0 && "border-l border-line pl-4")}>
            <dt className="type-label text-muted">{t.label}</dt>
            <dd className={cx("flex items-baseline gap-1 type-numeral", i === 0 ? "text-[2.75rem]" : "text-[2.25rem] text-muted")}>
              {eur(t.value)}
              <span className="text-[0.55em]">€</span>
            </dd>
          </div>
        ))}
      </dl>
      {memberNote && member !== null && (
        <p className="type-small text-muted">
          Ta carte cotisante <span className="type-meta text-fg">{memberNote}</span> te donne le tarif adhérent.
        </p>
      )}
    </div>
  );
}
