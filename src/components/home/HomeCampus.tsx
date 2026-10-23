import Link from "next/link";
import type { PostItem as Post } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDateLong } from "@/lib/format";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { PostItem } from "@/components/campus/PostItem";
import { PostBrief } from "@/components/campus/PostBrief";
import { publishedPhrase } from "@/components/campus/labels";

/** Stories under the lead, as a ruled column. */
const BRIEFS = 4;

/**
 * The campus fil on the homepage, set like a front page in miniature: the
 * BDE's important notices first (a paper slip, the only part that looks
 * urgent — only the BDE's leadership can mark its own posts important), then
 * one story with its photo (one the BDE put "à la une", otherwise the latest
 * that is not a brève: brèves have no photo and a one-line title), then the
 * next ones as a ruled column of briefs. A story appears once; nothing at
 * all when nothing is published.
 */
export function HomeCampus({
  posts,
  featured,
  important,
  index,
}: {
  /** The latest published posts, newest first. */
  posts: Post[];
  /** Stories "à la une", while they last. */
  featured: Post[];
  /** The BDE's important notices, while they last. */
  important: Post[];
  index?: string;
}) {
  const shown = new Set(important.map((p) => p.id));
  const lead = [...featured, ...posts].find((p) => p.kind !== "breve" && !shown.has(p.id)) ?? null;
  if (lead) shown.add(lead.id);
  const rest = posts.filter((p) => !shown.has(p.id)).slice(0, BRIEFS);
  if (important.length === 0 && !lead && rest.length === 0) return null;

  return (
    <section aria-labelledby="le-fil" className="wrap pt-section">
      <SectionHeader
        id="le-fil"
        index={index}
        kicker="Le fil du campus"
        title="Ce qui se dit au campus"
        action={{ href: routes.campus, label: "Tout le fil" }}
      />

      {important.length > 0 && <ImportantNotices posts={important} className="mt-10" />}

      {(lead || rest.length > 0) && (
        <div className="mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-12">
          {lead && (
            <div className="flex flex-col gap-4 lg:col-span-7">
              {lead.prominence === "featured" && <p className="type-label text-accent-text">À la une</p>}
              <PostItem post={lead} withImage />
            </div>
          )}
          {rest.length > 0 && (
            <ul
              className={cx(
                "divide-y divide-line border-y border-line lg:self-start",
                lead ? "lg:col-span-5 lg:border-y-0 lg:border-l lg:pl-10" : "lg:col-span-8",
              )}
            >
              {rest.map((p) => (
                <li key={p.id}>
                  <PostBrief post={p} excerpt="wide" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The BDE's notices as one paper slip with a heavy top rule, headed
 * "Important · Le bureau des étudiants". Each notice is one link (stretched
 * title).
 */
function ImportantNotices({ posts, className }: { posts: Post[]; className?: string }) {
  return (
    <section
      data-surface="paper"
      aria-labelledby="important-accueil"
      className={cx("grain border-2 border-fg px-5 py-5 sm:px-7 sm:py-6", className)}
    >
      <h3 id="important-accueil" className="flex items-start gap-2 type-label">
        <Icon name="alert" size={18} className="shrink-0 text-accent-text" />
        <span>
          Important <span className="text-muted">· Le bureau des étudiants</span>
        </span>
      </h3>
      <ul className={cx("mt-4 grid gap-6", posts.length > 1 && "md:grid-cols-2 md:gap-10")}>
        {posts.map((p) => (
          <li key={p.id}>
            <article className="group relative flex flex-col gap-2">
              <h4 className="type-title break-words text-[clamp(1.35rem,1rem+1.2vw,2rem)]">
                <Link
                  href={routes.post(p.slug)}
                  className="decoration-[3px] underline-offset-[0.12em] after:absolute after:inset-0 group-hover:underline"
                >
                  {p.title}
                </Link>
              </h4>
              {p.excerpt && <p className="max-w-2xl text-muted">{p.excerpt}</p>}
              <p className="type-meta text-subtle">
                <time dateTime={p.publishedAt} title={formatDateLong(p.publishedAt)}>
                  {publishedPhrase(p.publishedAt)}
                </time>
              </p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
