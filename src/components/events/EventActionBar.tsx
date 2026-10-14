import type { CampusEvent } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EventDemoNotice, RegisterButton, SaveToggle } from "./EventActions";
import { ACTION_SHORT_LABEL, type EventAction } from "./event-action";
import { registrationFacts } from "./event-facts";

/**
 * Phone action bar of the event page: price and where registration stands on
 * the left, the action on the right, docked just above the tab bar. It is
 * `sticky`, not `fixed`, and must be the last child of the event article: it
 * travels with the reader, then settles at the article's end instead of
 * covering the related events and the footer. Hidden from lg (the side panel
 * is sticky there).
 */
export function EventActionBar({
  event,
  action,
  signedIn,
  canSave,
  loginHref,
  now = new Date(),
}: {
  event: Pick<CampusEvent, "registration" | "startsAt" | "endsAt" | "price">;
  action: EventAction;
  signedIn: boolean;
  canSave: boolean;
  loginHref: string;
  now?: Date;
}) {
  const facts = registrationFacts(event, now);
  const cta = action.kind === "register" || action.kind === "waitlist" ? action.kind : null;
  const registered = action.kind === "registered";

  // Short enough for 360 px next to two buttons; the panel above has the detail.
  const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;
  const price = event.price;
  const priceText = !price
    ? "Gratuit"
    : price.member !== undefined && price.member < price.standard
      ? `Dès ${eur(price.member)}`
      : eur(price.standard);

  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 border-t border-line-strong bg-bg/95 backdrop-blur-sm lg:hidden">
      <div className="px-[var(--gutter)] py-3">
        {signedIn && <EventDemoNotice className="mb-3" />}
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 flex-1 flex-col gap-0.5">
            {registered ? (
              <span className="inline-flex items-center gap-1.5 type-small font-bold text-ok">
                <Icon name="check" size={15} strokeWidth={2.25} />
                Tu es inscrit·e
              </span>
            ) : (
              <span className="truncate type-meta font-bold">{priceText}</span>
            )}
            <span className={cx("truncate type-caption", facts.tone === "warn" && "font-bold text-warn")}>
              {cta && !signedIn ? "Connecte-toi pour t'inscrire" : (facts.detail ?? facts.label)}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {canSave && <SaveToggle compact />}
            {registered && (
              <ButtonLink href={routes.accountEvents} variant="secondary">
                Mes billets
              </ButtonLink>
            )}
            {cta &&
              (signedIn ? (
                <RegisterButton action={cta} arrow={false}>
                  {ACTION_SHORT_LABEL[cta]}
                </RegisterButton>
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
