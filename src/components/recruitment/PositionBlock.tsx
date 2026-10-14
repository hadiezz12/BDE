import type { CampaignItem, RecruitmentPosition } from "@/lib/types";
import { cx } from "@/lib/cx";
import { formatDayFull, formatTime, plural } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { ApplyTrigger } from "./ApplyTrigger";
import { isOpen, isPositionOpen, positionAnchor } from "./campaign-facts";

/**
 * One role of the fiche de poste: what you'll do, what's expected, and the
 * time it really takes — set apart on a tinted strip because that's the
 * question every student asks first. "Candidater à ce poste" opens the
 * dialog with the role ticked (needs ApplyProvider around the page).
 */
export function PositionBlock({
  position,
  campaign,
  index,
  total,
  applied,
  now = new Date(),
}: {
  position: RecruitmentPosition;
  campaign: Pick<CampaignItem, "status" | "closesAt">;
  index: number;
  total: number;
  /** The signed-in student already applied to this role. */
  applied?: boolean;
  now?: Date;
}) {
  const anchor = positionAnchor(position.id);
  const campaignOpen = isOpen(campaign.status);
  const roleOpen = isPositionOpen(position, campaign, now);
  const closesEarly = position.closesAt && position.closesAt !== campaign.closesAt ? position.closesAt : null;
  /** Nothing more to apply for: the campaign is over, or this role closed first. */
  const dim = campaign.status === "cloturee" || (campaignOpen && !roleOpen);

  return (
    <article
      id={anchor}
      aria-labelledby={`${anchor}-titre`}
      className="flex scroll-mt-[calc(var(--header-h)+1.5rem)] flex-col gap-6 border-t border-line-strong py-9 first:border-t-0 first:pt-2"
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-2.5">
          <p className="type-label text-muted">
            {position.team ?? "Poste"}
            <span className="text-subtle">
              {" "}
              · {index}/{total}
            </span>
          </p>
          <h3
            id={`${anchor}-titre`}
            className="type-title text-[clamp(1.55rem,1.15rem+1.4vw,2.3rem)] break-words hyphens-auto"
          >
            {position.title}
          </h3>
        </div>
        <p className="flex flex-col items-end text-right">
          <span
            aria-hidden
            className={cx("type-numeral text-[3rem] sm:text-[3.75rem]", dim ? "text-subtle" : "text-assoc-text")}
          >
            {position.seats}
          </span>
          <span aria-hidden className="type-meta text-muted">
            {position.seats > 1 ? "places" : "place"}
          </span>
          <span className="sr-only">{plural(position.seats, "place")}</span>
        </p>
      </header>

      <p className="max-w-3xl type-lead">{position.summary}</p>

      <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
        <BulletList title="Tes missions" items={position.missions} />
        <BulletList title="Ce qu'on attend de toi" items={position.expectations} />
      </div>

      <div className="flex flex-col gap-5 rounded-sm bg-sunken p-4 sm:p-5 md:flex-row md:items-center md:justify-between md:gap-8">
        <dl className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Icon name="clock" size={20} className="mt-0.5 shrink-0" />
            <div>
              <dt className="type-label text-muted">Le temps que ça prend</dt>
              <dd className="mt-1 font-semibold leading-snug">{position.commitment}</dd>
            </div>
          </div>
          {closesEarly && (
            <div className="flex items-start gap-3">
              <Icon name="calendar" size={20} className="mt-0.5 shrink-0" />
              <div>
                <dt className="type-label text-muted">Ce poste ferme plus tôt</dt>
                <dd className="mt-1 font-semibold leading-snug">
                  {formatDayFull(closesEarly)} à {formatTime(closesEarly)}
                </dd>
              </div>
            </div>
          )}
        </dl>

        {campaignOpen &&
          (applied ? (
            <p className="flex shrink-0 items-center gap-2 type-meta font-bold">
              <Icon name="check" size={16} className="text-assoc-text" />
              Tu as candidaté à ce poste
            </p>
          ) : roleOpen ? (
            <ApplyTrigger positionId={position.id} variant="secondary" className="shrink-0 max-md:w-full">
              Candidater à ce poste
            </ApplyTrigger>
          ) : (
            <p className="shrink-0 type-meta font-bold text-muted">Candidatures closes pour ce poste</p>
          ))}
      </div>
    </article>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      <h4 className="type-label">{title}</h4>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-3 leading-relaxed">
            <span aria-hidden className="mt-[0.62rem] size-1.5 shrink-0 bg-assoc" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
