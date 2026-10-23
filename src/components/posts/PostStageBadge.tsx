import type { PostSummary } from "@/lib/posts/model";
import { postStage, STAGE_LABEL, STAGE_TONE } from "@/lib/posts/model";
import { formatScheduled } from "@/lib/posts/schedule";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * Where a post stands, in words, for the desk and the editor: the most
 * urgent state wins (hidden by moderation, failed schedule, scheduled, in
 * review…). A scheduled post says when, in Paris time.
 */
export function PostStageBadge({
  post,
  className,
}: {
  post: Pick<PostSummary, "hidden" | "schedule" | "working" | "publication" | "published" | "first_published_at">;
  className?: string;
}) {
  const stage = postStage(post);
  return (
    <StatusBadge tone={STAGE_TONE[stage]} className={className}>
      {stage === "scheduled" && post.schedule
        ? `Programmé · ${formatScheduled(post.schedule.at)}`
        : STAGE_LABEL[stage]}
    </StatusBadge>
  );
}
