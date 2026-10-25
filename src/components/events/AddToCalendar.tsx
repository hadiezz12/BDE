import type { CalendarEventInput } from "@/lib/events/ics";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/events/ics";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * "Ajouter à mon agenda": the .ics file (Apple Calendar, Thunderbird, any
 * phone), Google Agenda and Outlook. Plain links, no script, no account
 * linking: the student's calendar app saves the event itself. Public
 * information only (the joining link of an online event stays on the site).
 */
export function AddToCalendar({
  event,
  icsHref,
  className,
}: {
  event: CalendarEventInput;
  /** /events/[slug]/ics */
  icsHref: string;
  className?: string;
}) {
  const links = [
    { href: icsHref, label: "Fichier .ics", hint: "Apple, Android, Thunderbird", download: true },
    { href: googleCalendarUrl(event), label: "Google Agenda", hint: null, download: false },
    { href: outlookCalendarUrl(event), label: "Outlook", hint: null, download: false },
  ];
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <p className="inline-flex items-center gap-2 type-label text-muted">
        <Icon name="calendar" size={15} />
        Ajouter à mon agenda
      </p>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              {...(l.download ? { download: "" } : { target: "_blank", rel: "noopener noreferrer" })}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-sm border-2 border-line-strong/60 px-3 type-button text-[0.78rem] hover:border-fg"
            >
              {l.label}
              {!l.download && <Icon name="external" size={13} />}
              {l.download ? (
                <span className="sr-only"> (téléchargement{l.hint ? ` : ${l.hint}` : ""})</span>
              ) : (
                <span className="sr-only"> (nouvel onglet)</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
