import Link from "next/link";
import type { ApplicationItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, formatDayMonth, formatWhen } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { APPLICATION_TONE } from "./campaign-facts";

/**
 * The signed-in student's own application, pinned at the top of the fiche
 * they applied to: status in words, the next step if there is one, and the
 * way to their application page.
 */
export function MyApplicationNote({ application, now = new Date() }: { application: ApplicationItem; now?: Date }) {
  const draft = application.status === "brouillon";
  const sentAt = application.submittedAt ?? application.updatedAt;
  const next = application.nextStep;

  return (
    <aside
      aria-label="Ta candidature à ce recrutement"
      className="flex items-start gap-4 rounded-sm border-2 border-fg bg-raised p-4 shadow-sticker sm:p-5"
    >
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-assoc text-assoc-fg">
        <Icon name={draft ? "edit" : "check"} size={20} strokeWidth={2.25} />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-bold leading-snug">
          {draft
            ? `Tu as commencé une candidature au poste ${application.position.title}.`
            : `Tu as candidaté au poste ${application.position.title} le ${formatDayMonth(sentAt)}.`}
        </p>
        <StatusBadge tone={APPLICATION_TONE[application.status]}>
          {APPLICATION_STATUS_LABEL[application.status]}
        </StatusBadge>
        {next && (
          <p className="type-small">
            Prochaine étape : <strong>{next.label}</strong>
            {next.date && ` · ${formatWhen(next.date, now)}`}
            {next.location && ` · ${next.location}`}
          </p>
        )}
        <Link
          href={routes.accountApplication(application.id)}
          className="inline-flex items-center gap-1.5 self-start type-small font-bold hover:text-assoc-text"
        >
          {draft ? "Reprendre mon brouillon" : "Suivre ma candidature"}
          <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </aside>
  );
}
