import type { Applicant, CampaignItem, PostItem } from "@/lib/types";
import { deadlineLabel, formatDayShort, plural } from "@/lib/format";
import { PublicationStatusBadge } from "@/components/manage/StatusBadges";
import { postDatePhrase } from "@/components/manage/content/PostCells";

/**
 * Short ruled lists for the side column of the workspace home. They only
 * report: the work itself happens in the section linked from each block head.
 */

/** Campaigns still running or about to open, with their applicant counts. */
export function CampaignDigest({
  campaigns,
  applicants,
  now = new Date(),
}: {
  campaigns: CampaignItem[];
  applicants: Applicant[];
  now?: Date;
}) {
  return (
    <ul className="border-b border-line">
      {campaigns.map((c) => {
        const mine = applicants.filter((a) => a.campaignId === c.id);
        const unread = mine.filter((a) => a.status === "envoyee").length;
        const when = c.status === "a-venir" ? `Ouvre le ${formatDayShort(c.opensAt)}` : deadlineLabel(c.closesAt, now);
        return (
          <li key={c.id} className="flex flex-col gap-1 border-t border-line py-3.5">
            <span className="font-bold leading-snug">{c.title}</span>
            <span className="type-small text-muted">
              {plural(c.seats, "place")} · {when}
            </span>
            <span className="flex flex-wrap gap-x-3 type-meta">
              <span>{plural(mine.length, "candidature")}</span>
              {unread > 0 && <span className="font-bold text-accent-text">{unread} à lire</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Drafts and scheduled posts: who wrote them, and since when / until when. */
export function PendingPosts({ posts, now = new Date() }: { posts: PostItem[]; now?: Date }) {
  return (
    <ul className="border-b border-line">
      {posts.map((p) => (
        <li key={p.id} className="flex flex-col gap-1.5 border-t border-line py-3.5">
          <PublicationStatusBadge status={p.publication} />
          <span className="font-bold leading-snug">{p.title}</span>
          <span className="type-small text-muted">
            {p.authorName} · {postDatePhrase(p, now).toLowerCase()}
          </span>
        </li>
      ))}
    </ul>
  );
}
