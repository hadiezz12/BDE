import Link from "next/link";
import type { ApplicationItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { APPLICATION_STATUS_LABEL } from "@/lib/format";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { APPLICATION_TONE } from "@/components/recruitment/campaign-facts";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { applicationHint } from "./account-facts";
import { CANDIDATE_STAGE, type CandidateStageKey } from "@/lib/recruitment/candidate";
import { formatDayMonth } from "@/lib/format";

/**
 * One of the student's applications: who and which role, where it stands in
 * words (a draft's deadline and completion, when it was sent). The whole row
 * is one link (stretched from the role) to the application page. Lays itself
 * out from its own width (container query), so it fits the home column and
 * the full list alike.
 */
export function ApplicationRow({
  application,
  headingLevel = 3,
  now = new Date(),
  className,
}: {
  application: ApplicationItem;
  headingLevel?: 2 | 3 | 4;
  now?: Date;
  className?: string;
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const { campaign, position, status, progress } = application;
  const association = campaign.association;
  const over = status === "retiree";
  const key = application.stage?.key as CandidateStageKey | undefined;
  // A sent application says where it stands (Phase 9); a draft keeps its own words.
  const stage = status === "envoyee" && key && key in CANDIDATE_STAGE ? CANDIDATE_STAGE[key] : null;

  return (
    <article
      data-accent={association.accent}
      className={cx(
        "@container group focus-ring-within relative border-t border-line-strong transition-colors hover:bg-raised/70",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute -top-px left-0 h-[3px] w-full origin-left scale-x-0 bg-assoc transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-within:scale-x-100"
      />
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3.5 gap-y-3 py-4 @2xl:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,15rem)_1.25rem] @2xl:gap-x-5 @2xl:py-5">
        <AssociationLogo association={association} size={40} />

        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-[0.8125rem] font-bold text-assoc-text">
            {association.name} · {campaign.title}
          </p>
          <H className={cx("type-card break-words", over && "text-muted")}>
            <Link
              href={routes.accountApplication(application.id)}
              className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
            >
              {position.title}
            </Link>
          </H>
          {position.team && <p className="type-small text-muted">{position.team}</p>}
        </div>

        <div className="col-start-2 flex min-w-0 flex-col gap-1.5 @2xl:col-start-3">
          {stage ? (
            <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
          ) : (
            <StatusBadge tone={APPLICATION_TONE[status]}>{APPLICATION_STATUS_LABEL[status]}</StatusBadge>
          )}
          <p className="type-small text-muted">{applicationHint(application, now)}</p>
          {stage?.action && (
            <p className="type-small font-semibold">
              {stage.action}
              {application.stage?.deadline ? ` avant le ${formatDayMonth(application.stage.deadline)}` : ""}
            </p>
          )}
          {status === "brouillon" && progress && progress.required > 0 && (
            <p className="type-small font-semibold">
              {progress.complete
                ? "Prête à envoyer"
                : `${progress.missing} point${progress.missing > 1 ? "s" : ""} à compléter avant l'envoi`}
            </p>
          )}
        </div>

        <Icon
          name="arrow-right"
          size={20}
          className="hidden self-center text-assoc-text transition-transform group-hover:translate-x-0.5 @2xl:block"
        />
      </div>
    </article>
  );
}

/** Same footprint as an ApplicationRow, for loading.tsx. */
export function ApplicationRowSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("@container border-t border-line-strong", className)}>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3.5 gap-y-3 py-4 @2xl:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,15rem)] @2xl:gap-x-5 @2xl:py-5">
        <Skeleton className="size-10 rounded-full" />
        <span className="flex flex-col gap-2">
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-5 w-3/5" />
        </span>
        <span className="col-start-2 flex flex-col gap-2 @2xl:col-start-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-40" />
        </span>
      </div>
    </div>
  );
}
