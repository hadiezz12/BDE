import Link from "next/link";
import type { ContentDashboard } from "@/lib/posts/editor";
import { SCHEDULE_ERROR_LABEL } from "@/lib/posts/model";
import { formatScheduled } from "@/lib/posts/schedule";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { editedWhen, postTitle, shortDate } from "./ContentCells";
import type { ContentTask, ContentTaskKind } from "./desk";

const TASK: Record<ContentTaskKind, { label: string; tone: "danger" | "warn"; icon: IconName }> = {
  hidden: { label: "Masqué par le BDE", tone: "danger", icon: "shield" },
  failed: { label: "Programmation échouée", tone: "danger", icon: "alert" },
  review: { label: "À relire", tone: "warn", icon: "eye" },
  changes: { label: "Modifications demandées", tone: "warn", icon: "edit" },
};

/**
 * What waits for someone in the association's content, one ruled line per
 * post (content desk and workspace home): hidden by the BDE's moderation
 * (with its reason: only the BDE can show it again), a scheduled publication
 * that did not go out (with why, in words), a version waiting for the
 * reader's review, the reader's post sent back with changes requested. The
 * whole line opens the post; the reviewer is never shown their own work.
 */
export function ContentTasks({
  tasks,
  asso,
  can,
  now = new Date(),
}: {
  tasks: ContentTask[];
  asso: string;
  can: ContentDashboard["can"];
  now?: Date;
}) {
  return (
    <ul className="border-b border-line">
      {tasks.map(({ kind, post }) => {
        const t = TASK[kind];
        const action =
          kind === "review" ? "Relire" : kind === "changes" ? "Corriger" : kind === "failed" && can.publish ? "Reprogrammer" : "Voir";
        return (
          <li
            key={post.id}
            className="group relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 border-t border-line py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-x-4"
          >
            <span
              aria-hidden
              className={cx(
                "mt-0.5 grid size-10 place-items-center rounded-sm bg-sunken",
                t.tone === "danger" ? "text-danger" : "text-warn",
              )}
            >
              <Icon name={t.icon} size={18} />
            </span>

            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge tone={t.tone}>{t.label}</StatusBadge>
                <span className="type-meta text-subtle">{POST_KIND_LABEL[post.kind]}</span>
              </p>
              <Link
                href={routes.manageContentPost(asso, post.id)}
                className="w-fit font-bold leading-snug break-words after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
              >
                {postTitle(post)}
              </Link>

              {kind === "hidden" && post.hidden && (
                <>
                  <p className="type-small break-words">
                    <span className="font-semibold">Raison donnée par le BDE&nbsp;:</span> {post.hidden.reason}
                  </p>
                  <p className="type-small text-muted">
                    Masqué le {shortDate(post.hidden.at, now)}&nbsp;: il n&apos;est plus visible sur le site. Seul le
                    bureau du BDE peut le rétablir&nbsp;: contacte-le pour qu&apos;il revoie sa décision, en lui disant
                    ce que vous avez corrigé.
                  </p>
                </>
              )}

              {kind === "failed" && post.schedule && (
                <p className="type-small text-muted">
                  Prévue {formatScheduled(post.schedule.at)}, elle n&apos;est pas partie&nbsp;:{" "}
                  {SCHEDULE_ERROR_LABEL[post.schedule.error ?? ""] ?? SCHEDULE_ERROR_LABEL.unexpected}.{" "}
                  {can.publish
                    ? "Règle ce qui bloque, puis reprogramme ou publie."
                    : "Préviens un poste qui publie les articles : il pourra la reprogrammer."}
                </p>
              )}

              {kind === "review" && (
                <p className="type-small text-muted">
                  Version {post.working.number}, modifiée en dernier par {post.working.updated_by_name}{" "}
                  {editedWhen(post.working.updated_at, now)}. Relis cette version exacte, puis approuve-la ou demande
                  des modifications.
                </p>
              )}

              {kind === "changes" && (
                <p className="type-small text-muted">
                  La note de relecture t&apos;attend dans l&apos;éditeur. Corrige, puis renvoie l&apos;article en
                  relecture.
                </p>
              )}
            </div>

            <span
              aria-hidden
              className="hidden items-center gap-1.5 self-center type-small font-semibold text-muted group-hover:text-fg sm:inline-flex"
            >
              {action}
              <Icon name="arrow-right" size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
