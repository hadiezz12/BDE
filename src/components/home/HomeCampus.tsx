import type { PostItem as Post } from "@/lib/types";
import { routes } from "@/lib/routes";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PostItem } from "@/components/campus/PostItem";
import { PostBrief } from "@/components/campus/PostBrief";

/**
 * The latest from the campus fil, set like a front page in miniature: one
 * story with its photo, then the next ones as a ruled column of briefs.
 * Brèves never lead — they have no photo and a one-line title.
 */
export function HomeCampus({ posts, index }: { posts: Post[]; index?: string }) {
  if (posts.length === 0) return null;
  const lead = posts.find((p) => p.kind !== "breve") ?? posts[0];
  const rest = posts.filter((p) => p !== lead).slice(0, 4);

  return (
    <section aria-labelledby="le-fil" className="wrap pt-section">
      <SectionHeader
        id="le-fil"
        index={index}
        kicker="Le fil du campus"
        title="Ce qui se dit au campus"
        action={{ href: routes.campus, label: "Tout le fil" }}
      />
      <div className="mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-12">
        <PostItem post={lead} withImage className="lg:col-span-7" />
        {rest.length > 0 && (
          <ul className="divide-y divide-line border-y border-line lg:col-span-5 lg:self-start lg:border-y-0 lg:border-l lg:pl-10">
            {rest.map((p) => (
              <li key={p.id}>
                <PostBrief post={p} excerpt="wide" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
