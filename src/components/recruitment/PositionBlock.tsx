import Link from "next/link";
import type { ApplicationItem, CampaignItem, RecruitmentPosition } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { formatDayFull, formatTime, plural } from "@/lib/format";
import { yearsLabel } from "@/lib/recruitment/model";
import { kindsLine } from "@/lib/recruitment/documents";
import { Icon } from "@/components/ui/Icon";
import { ApplyButton } from "./ApplyButton";
import { ButtonLink } from "@/components/ui/Button";
import { isOpen, isOver, positionAnchor } from "./campaign-facts";

/**
 * One role of the fiche de poste: what you'll do, what's expected, and the
 * time it really takes — set apart on a tinted strip because that's the
 * question every student asks first, with what the form will ask for and
 * who may apply. "Candidater à ce poste" opens the student's draft.
 */
export function PositionBlock({
  position,
  campaign,
  index,
  total,
  mine,
  back,
  linkToPage = true,
  preview = false,
}: {
  position: RecruitmentPosition;
  campaign: Pick<CampaignItem, "id" | "status" | "closesAt" | "slug" | "eligibleYears">;
  index: number;
  total: number;
  /** The signed-in student's application to this role (draft or sent), if any. */
  mine?: ApplicationItem;
  /** This page's path, to come back to after signing in. */
  back: string;
  /** Off on the position's own page. */
  linkToPage?: boolean;
  /** The team's preview: "Candidater" opens the form's preview instead. */
  preview?: boolean;
}) {
  const anchor = positionAnchor(position.id);
  const campaignOpen = isOpen(campaign.status);
  const roleOpen = campaignOpen && position.accepting;
  const dim = isOver(campaign.status) || (campaignOpen && !position.accepting);
  const years = position.eligibleYears ?? campaign.eligibleYears;
  const documents = position.form?.documents ?? [];

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
            {linkToPage && !preview ? (
              <Link href={routes.campaignPosition(campaign.slug, position.slug)} className="hover:text-assoc-text">
                {position.title}
              </Link>
            ) : (
              position.title
            )}
          </h3>
        </div>
        {position.openings !== undefined && (
          <p className="flex flex-col items-end text-right">
            <span
              aria-hidden
              className={cx("type-numeral text-[3rem] sm:text-[3.75rem]", dim ? "text-subtle" : "text-assoc-text")}
            >
              {position.openings}
            </span>
            <span aria-hidden className="type-meta text-muted">
              {position.openings > 1 ? "places" : "place"}
            </span>
            <span className="sr-only">{plural(position.openings, "place")}</span>
          </p>
        )}
      </header>

      {position.summary && <p className="max-w-3xl type-lead">{position.summary}</p>}
      {position.description.length > 0 && (
        <div className="flex max-w-3xl flex-col gap-3">
          {position.description.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {(position.missions.length > 0 || position.expectations.length > 0) && (
        <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
          {position.missions.length > 0 && <BulletList title="Tes missions" items={position.missions} />}
          {position.expectations.length > 0 && <BulletList title="Ce qu'on attend de toi" items={position.expectations} />}
        </div>
      )}

      <div className="flex flex-col gap-5 rounded-sm bg-sunken p-4 sm:p-5 md:flex-row md:items-start md:justify-between md:gap-8">
        <dl className="flex flex-col gap-4">
          {position.commitment && (
            <Fact icon="clock" label="Le temps que ça prend">
              {position.commitment}
            </Fact>
          )}
          {position.closesEarly && (
            <Fact icon="calendar" label="Ce poste ferme plus tôt">
              {formatDayFull(position.closesAt)} à {formatTime(position.closesAt)}
            </Fact>
          )}
          {years && (
            <Fact icon="users" label="Qui peut candidater">
              {yearsLabel(years)} (d&apos;après l&apos;année indiquée dans ton profil)
            </Fact>
          )}
          {documents.length > 0 && (
            <Fact icon="file" label="À joindre">
              <ul className="flex flex-col gap-0.5">
                {documents.map((d) => (
                  <li key={d.label}>
                    {d.label} — {kindsLine(d.fileTypes)}
                    {d.required ? "" : " (facultatif)"}
                  </li>
                ))}
              </ul>
            </Fact>
          )}
        </dl>

        {(campaignOpen || preview) && (
          <div className="flex shrink-0 flex-col items-stretch gap-2 md:w-60">
            {preview ? (
              <ButtonLinkPreview href={routes.campaignPreview(campaign.id, position.id)} />
            ) : mine ? (
              <>
                <p className="flex items-center gap-2 type-meta font-bold">
                  <Icon name={mine.status === "brouillon" ? "edit" : "check"} size={16} className="text-assoc-text" />
                  {mine.status === "brouillon" ? "Ton brouillon est enregistré" : "Tu as envoyé ta candidature"}
                </p>
                <Link href={routes.accountApplication(mine.id)} className="link type-small font-bold">
                  {mine.status === "brouillon" ? "Reprendre mon brouillon" : "Relire ma candidature"}
                </Link>
              </>
            ) : roleOpen ? (
              <ApplyButton positionId={position.id} back={back} variant="secondary" block>
                Candidater à ce poste
              </ApplyButton>
            ) : (
              <p className="type-meta font-bold text-muted">Candidatures closes pour ce poste</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function Fact({ icon, label, children }: { icon: "clock" | "calendar" | "users" | "file"; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icon} size={20} className="mt-0.5 shrink-0" />
      <div>
        <dt className="type-label text-muted">{label}</dt>
        <dd className="mt-1 font-semibold leading-snug">{children}</dd>
      </div>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      <h4 className="type-label">{title}</h4>
      <ul className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <li key={`${i}-${item}`} className="flex gap-3 leading-relaxed">
            <span aria-hidden className="mt-[0.62rem] size-1.5 shrink-0 bg-assoc" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** In the team's preview: the form this position's candidates fill, without saving anything. */
function ButtonLinkPreview({ href }: { href: string }) {
  return (
    <ButtonLink href={href} variant="secondary" icon="eye" iconPosition="start" block>
      Voir le formulaire
    </ButtonLink>
  );
}
