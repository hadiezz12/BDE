import Link from "next/link";
import type { ModerationQueue, ReportReason } from "@/lib/posts/editor";
import type { PostCardPayload } from "@/lib/posts/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDateLong, plural } from "@/lib/format";
import { AUDIT_ACTION_LABEL } from "@/lib/governance/labels";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { DismissReportForm, HidePostForm, RestorePostForm } from "./ModerationForms";
import { moderatedPostHref, REPORT_REASON_LABEL, REPORT_REASONS, stamp } from "./labels";

/**
 * The BDE's moderation lists: posts with open reports, hidden posts, closed
 * reports and the moderation history. Only published content and what
 * moderation needs: never a draft, never who reported (the database does
 * not even send it), never a report count outside these screens.
 */

/** Association, kind and first publication of a post, in one quiet line. */
export function ModeratedPostMeta({ post }: { post: Pick<PostCardPayload, "organization" | "kind" | "first_published_at"> }) {
  const org = post.organization;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-subtle">
      {/* The monogram only: an association's logo is not public while its page is off the site. */}
      <AssociationLogo association={{ name: org.name, shortName: org.short_name ?? undefined, accent: org.accent }} size={22} />
      <span className="font-semibold text-muted">{org.name}</span>
      <span aria-hidden>·</span>
      <span>{POST_KIND_LABEL[post.kind]}</span>
      <span aria-hidden>·</span>
      <span>
        Publié le <time dateTime={post.first_published_at}>{formatDateLong(post.first_published_at)}</time>
      </span>
    </p>
  );
}

/** Where the post stands for visitors, in words. */
export function visibilityOf(p: { hidden: boolean; public: boolean; archived: boolean }): { tone: StatusTone; label: string } {
  if (p.hidden) return { tone: "danger", label: "Masqué par le BDE" };
  if (p.public) return p.archived ? { tone: "neutral", label: "Archivé, lien actif" } : { tone: "ok", label: "En ligne" };
  return { tone: "neutral", label: "Plus en ligne" };
}

/** "Vie privée 2 · Spam 1", in the order of the report form. */
export function ReasonBreakdown({ reasons }: { reasons: Partial<Record<ReportReason, number>> }) {
  const present = REPORT_REASONS.filter((r) => (reasons[r] ?? 0) > 0);
  if (present.length === 0) return null;
  return (
    <ul aria-label="Raisons données" className="flex flex-wrap gap-2">
      {present.map((r) => (
        <li key={r} className="inline-flex min-h-8 items-center gap-2 rounded-sm border border-line-strong/60 px-2.5 type-small">
          <span>{REPORT_REASON_LABEL[r]}</span>
          <span className="font-bold tabular-nums">{reasons[r]}</span>
        </li>
      ))}
    </ul>
  );
}

type OpenItem = ModerationQueue["open"][number];

/** Each open report on a post: the reason, its details as typed, when, and "Classer sans suite". */
export function OpenReportsList({ reports, className }: { reports: OpenItem["reports"]; className?: string }) {
  return (
    <ol aria-label="Signalements" className={cx("flex flex-col divide-y divide-line", className)}>
      {reports.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="font-semibold">{REPORT_REASON_LABEL[r.reason]}</span>
            <time dateTime={r.created_at} className="type-meta text-subtle">
              {stamp(r.created_at)}
            </time>
          </p>
          {r.details ? (
            <p className="whitespace-pre-line break-words type-small text-muted">«&nbsp;{r.details}&nbsp;»</p>
          ) : (
            <p className="type-small text-subtle">Sans précision.</p>
          )}
          <DismissReportForm reportId={r.id} />
        </li>
      ))}
    </ol>
  );
}

/** A post with open reports: what was reported, why, when, and the two decisions. */
export function OpenReportCard({ item }: { item: OpenItem }) {
  const { post } = item;
  const state = visibilityOf(post);
  return (
    <article data-accent={post.organization.accent} className="overflow-hidden rounded-md border border-line bg-raised">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <ModeratedPostMeta post={post} />
          <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        </div>
        <h3 className="type-card break-words">
          {post.public ? (
            <Link href={routes.post(post.slug)} className="link">
              {post.title}
            </Link>
          ) : (
            post.title
          )}
        </h3>
        <p className="type-small">
          <span className="font-bold">{plural(item.count, "signalement ouvert", "signalements ouverts")}</span>
          <span className="text-muted">
            {" "}
            · {item.count > 1 ? `le premier le ${stamp(item.first_at)}` : `le ${stamp(item.first_at)}`}
          </span>
        </p>
        <ReasonBreakdown reasons={item.reasons} />
      </div>

      <OpenReportsList reports={item.reports} className="border-t border-line" />

      <div className="flex flex-col gap-3 border-t border-line bg-sunken/40 px-4 py-4 sm:px-5">
        <div>
          <ButtonLink href={moderatedPostHref(post.id)} variant="secondary" size="sm" icon="file" iconPosition="start">
            Lire l&apos;article
          </ButtonLink>
        </div>
        {!post.hidden && <HidePostForm postId={post.id} live={post.public} />}
      </div>
    </article>
  );
}

type HiddenItem = ModerationQueue["hidden"][number];

/** A post hidden by the BDE: when, by whom, why, and the way back. */
export function HiddenPostCard({ post }: { post: HiddenItem }) {
  return (
    <article data-accent={post.organization.accent} className="flex flex-col gap-3 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <ModeratedPostMeta post={post} />
        <StatusBadge tone="danger">Masqué par le BDE</StatusBadge>
      </div>
      <h3 className="type-card break-words">{post.title}</h3>
      <p className="type-small text-muted">
        Masqué le {stamp(post.hidden_at)}
        {post.hidden_by_name ? ` par ${post.hidden_by_name}` : ""}.
      </p>
      <p className="break-words type-small">
        <span className="font-semibold">Raison&nbsp;:</span> {post.hidden_reason}
      </p>
      <div className="flex flex-col gap-3 pt-1">
        <div>
          <ButtonLink href={moderatedPostHref(post.id)} variant="secondary" size="sm" icon="file" iconPosition="start">
            Lire l&apos;article
          </ButtonLink>
        </div>
        <RestorePostForm postId={post.id} />
      </div>
    </article>
  );
}

type ResolvedItem = ModerationQueue["resolved"][number];

/** Closed reports: classed without action, or closed by hiding the post. */
export function ResolvedList({ items }: { items: ResolvedItem[] }) {
  return (
    <ol className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
      {items.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="break-words font-semibold">
              {r.post_title ?? "Article sans titre"}
              {r.organization && <span className="font-normal text-muted"> · {r.organization}</span>}
            </span>
            {r.status === "actioned" ? (
              <StatusBadge tone="danger">Article masqué</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Classé sans suite</StatusBadge>
            )}
          </p>
          <p className="type-small text-muted">
            Signalé pour «&nbsp;{REPORT_REASON_LABEL[r.reason]}&nbsp;» · {r.status === "actioned" ? "masqué" : "classé"} le{" "}
            {stamp(r.resolved_at)}
            {r.resolved_by_name ? ` par ${r.resolved_by_name}` : ""}
          </p>
          {r.note && (
            <p className="break-words type-small">
              <span className="font-semibold">{r.status === "actioned" ? "Raison du masquage" : "Note"}&nbsp;:</span> {r.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

type HistoryItem = ModerationQueue["history"][number];

/** One sentence per moderation event, newest first. A report has no author here: the reporter stays anonymous. */
export function ModerationHistory({ events }: { events: HistoryItem[] }) {
  return (
    <ol className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
      {events.map((e, i) => (
        <li key={`${e.occurred_at}-${i}`} className="flex flex-col gap-0.5 px-4 py-2.5">
          <span className="break-words type-small">
            {e.action === "content_reported" ? (
              <span className="font-semibold">Signalement reçu</span>
            ) : (
              <>
                <span className="font-semibold">{e.actor_name ?? "Un compte supprimé"}</span>{" "}
                {AUDIT_ACTION_LABEL[e.action] ?? "a agi sur un article"}
              </>
            )}
            {e.post_title && <> · «&nbsp;{e.post_title}&nbsp;»</>}
          </span>
          <span className="flex flex-wrap gap-x-3 type-meta text-subtle">
            <time dateTime={e.occurred_at}>{stamp(e.occurred_at)}</time>
            {e.reason && (
              <span className="inline-flex min-w-0 items-start gap-1 break-words">
                <Icon name="info" size={12} className="mt-0.5 shrink-0" />
                {e.reason}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
