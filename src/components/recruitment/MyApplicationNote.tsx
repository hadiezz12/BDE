import Link from "next/link";
import type { ApplicationItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, formatDayMonth } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { APPLICATION_TONE } from "./campaign-facts";

/**
 * The signed-in student's own applications, pinned at the top of the fiche
 * they applied to: status in words and the way to each application page.
 * "Envoyée" never means read or accepted, and the note never says otherwise.
 */
export function MyApplicationNote({ applications }: { applications: ApplicationItem[] }) {
  if (applications.length === 0) return null;
  const drafts = applications.filter((a) => a.status === "brouillon");
  return (
    <aside
      aria-label="Tes candidatures à ce recrutement"
      className="flex items-start gap-4 rounded-sm border-2 border-fg bg-raised p-4 shadow-sticker sm:p-5"
    >
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-assoc text-assoc-fg">
        <Icon name={drafts.length > 0 ? "edit" : "check"} size={20} strokeWidth={2.25} />
      </span>
      <ul className="flex min-w-0 flex-col gap-4">
        {applications.map((a) => (
          <li key={a.id} className="flex flex-col gap-2">
            <p className="font-bold leading-snug">
              {a.status === "brouillon"
                ? `Tu as commencé une candidature au poste ${a.position.title}. Elle n'est pas encore envoyée.`
                : `Tu as envoyé ta candidature au poste ${a.position.title}${a.submittedAt ? ` le ${formatDayMonth(a.submittedAt)}` : ""}.`}
            </p>
            <StatusBadge tone={APPLICATION_TONE[a.status]}>{APPLICATION_STATUS_LABEL[a.status]}</StatusBadge>
            <Link
              href={routes.accountApplication(a.id)}
              className="inline-flex items-center gap-1.5 self-start type-small font-bold hover:text-assoc-text"
            >
              {a.status === "brouillon" ? "Reprendre mon brouillon" : "Relire ma candidature"}
              <Icon name="arrow-right" size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
