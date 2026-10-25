import type { CampusEvent } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { ordinal } from "@/lib/events/model";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EventActionNotice, RegisterButton, SaveToggle } from "./EventActions";
import { ACTION_SHORT_LABEL, type EventAction, type PersonalRegistration } from "./event-action";
import { registrationFacts } from "./event-facts";

/**
 * Phone action bar of the event page: where registration stands (or the
 * student's own seat / waiting place) on the left, the action on the right,
 * docked just above the tab bar. It is `sticky`, not `fixed`, and must be the
 * last child of the event article: it travels with the reader, then settles
 * at the article's end instead of covering the related events and the
 * footer. Hidden from lg (the side panel is sticky there). Cancelling lives
 * in the panel above (one more step, on purpose).
 */
export function EventActionBar({
  event,
  action,
  personal,
  signedIn,
  canSave,
  loginHref,
  now = new Date(),
}: {
  event: Pick<CampusEvent, "registration" | "startsAt" | "endsAt" | "status">;
  action: EventAction;
  personal: PersonalRegistration | null;
  signedIn: boolean;
  canSave: boolean;
  loginHref: string;
  now?: Date;
}) {
  const facts = registrationFacts(event, now);
  const cta = action.kind === "register" || action.kind === "waitlist" ? action.kind : null;

  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 border-t border-line-strong bg-bg/95 backdrop-blur-sm lg:hidden">
      <div className="px-[var(--gutter)] py-3">
        {signedIn && <EventActionNotice className="mb-3" />}
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 flex-1 flex-col gap-0.5">
            {action.kind === "confirmed" ? (
              <span className="inline-flex items-center gap-1.5 type-small font-bold text-ok">
                <Icon name="check" size={15} strokeWidth={2.25} />
                Tu es inscrit·e
              </span>
            ) : action.kind === "waitlisted" ? (
              <span className="inline-flex items-center gap-1.5 type-small font-bold text-info">
                <Icon name="clock" size={15} />
                Liste d&apos;attente{personal?.position ? ` · ${ordinal(personal.position)}` : ""}
              </span>
            ) : (
              <span className="truncate type-meta font-bold">{facts.label}</span>
            )}
            <span className={cx("truncate type-caption", facts.tone === "accent" && "font-bold text-accent-text")}>
              {cta && !signedIn ? "Connecte-toi pour t'inscrire" : (facts.detail ?? (event.registration.mode === "internal" ? "Sur inscription" : ""))}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {canSave && <SaveToggle compact />}
            {(action.kind === "confirmed" || action.kind === "waitlisted") && (
              <ButtonLink href={routes.accountEvents} variant="secondary">
                Mes événements
              </ButtonLink>
            )}
            {action.kind === "external" && event.registration.externalUrl && (
              <ButtonLink href={event.registration.externalUrl} variant="assoc" icon="external" target="_blank" rel="noopener noreferrer">
                {ACTION_SHORT_LABEL.external}
                <span className="sr-only"> (site extérieur, nouvel onglet)</span>
              </ButtonLink>
            )}
            {cta &&
              (signedIn ? (
                <RegisterButton arrow={false}>{ACTION_SHORT_LABEL[cta]}</RegisterButton>
              ) : (
                <ButtonLink href={loginHref} variant="assoc">
                  Se connecter
                </ButtonLink>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
