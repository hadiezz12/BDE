import Link from "next/link";
import type { AccentKey } from "@/lib/types";
import type { ContentDashboard } from "@/lib/posts/editor";
import type { PostSummary } from "@/lib/posts/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";
import {
  CoverThumb,
  PostByline,
  PostStatus,
  PostTitleLink,
  editedWhen,
  openLabel,
  postTitle,
  shortDate,
} from "./ContentCells";

/**
 * The association's posts. From md: up a real <table> (cover, title with
 * kind and author, status, then last edit and first publication from xl:
 * up, where there is room; below xl those two ride under the title). On
 * phones the same rows become stacked entries with labelled buttons, so
 * nothing scrolls sideways at 360 px. Only one of the two is displayed at a
 * time, so assistive tech never reads both (same pattern as DataTable).
 */
export function ContentTable({
  posts,
  asso,
  accent,
  can,
  userId,
  caption,
  now = new Date(),
}: {
  posts: PostSummary[];
  asso: string;
  accent: AccentKey;
  can: ContentDashboard["can"];
  userId: string;
  caption: string;
  now?: Date;
}) {
  return (
    <div>
      {/* md and up. `relative` keeps the cells' sr-only text inside the scroll box. */}
      <div className="relative hidden overflow-x-auto rounded-md border border-line bg-raised md:block">
        <table className="w-full border-collapse text-left type-small">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-sunken/60">
              <th scope="col" className="w-0 py-2.5 pl-4 pr-1">
                <span className="sr-only">Couverture</span>
              </th>
              <Th>Article</Th>
              <Th>Statut</Th>
              <Th className="hidden xl:table-cell">Dernière modification</Th>
              <Th className="hidden xl:table-cell">Publication</Th>
              <th scope="col" className="px-4 py-2.5 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id} className="border-b border-line align-top transition-colors last:border-b-0 hover:bg-bg/70">
                <td className="py-3 pl-4 pr-1">
                  <CoverThumb post={p} accent={accent} className="w-16" />
                </td>
                <th scope="row" className="min-w-[12rem] px-4 py-3 font-normal text-fg">
                  <div className="flex flex-col gap-0.5">
                    <PostTitleLink post={p} asso={asso} />
                    <PostByline post={p} />
                    <span className="type-meta text-subtle xl:hidden">
                      Modifié {editedWhen(p.working.updated_at, now)}
                      {p.first_published_at && ` · publié le ${shortDate(p.first_published_at, now)}`}
                    </span>
                  </div>
                </th>
                <td className="min-w-[11rem] px-4 py-3">
                  <PostStatus post={p} now={now} />
                </td>
                <td className="hidden px-4 py-3 xl:table-cell">
                  <span className="flex flex-col gap-0.5">
                    <time dateTime={p.working.updated_at} className="whitespace-nowrap first-letter:uppercase">
                      {editedWhen(p.working.updated_at, now)}
                    </time>
                    <span className="type-meta text-subtle">par {p.working.updated_by_name}</span>
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 xl:table-cell">
                  {p.first_published_at ? (
                    <time dateTime={p.first_published_at}>{shortDate(p.first_published_at, now)}</time>
                  ) : (
                    <span className="text-subtle">
                      <span aria-hidden>—</span>
                      <span className="sr-only">Jamais publié</span>
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <RowActions post={p} asso={asso} can={can} userId={userId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones */}
      <ul aria-label={caption} className="divide-y divide-line rounded-md border border-line bg-raised md:hidden">
        {posts.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <CoverThumb post={p} accent={accent} className="w-16" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <PostTitleLink post={p} asso={asso} />
                <PostByline post={p} />
              </div>
            </div>
            <PostStatus post={p} now={now} />
            <p className="type-meta text-subtle">
              Modifié {editedWhen(p.working.updated_at, now)} par {p.working.updated_by_name}
              {p.first_published_at && ` · publié le ${shortDate(p.first_published_at, now)}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={routes.manageContentPost(asso, p.id)} size="sm" variant="secondary" icon="edit" iconPosition="start">
                {openLabel(p, can, userId)}
              </ButtonLink>
              <ButtonLink href={routes.postPreview(p.id)} size="sm" variant="ghost" icon="eye" iconPosition="start">
                Aperçu
              </ButtonLink>
              {p.is_public && p.slug && (
                <ButtonLink href={routes.post(p.slug)} size="sm" variant="ghost" icon="arrow-up-right">
                  En ligne
                </ButtonLink>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Th({ children, className }: { children: string; className?: string }) {
  return (
    <th scope="col" className={cx("whitespace-nowrap px-4 py-2.5 type-label font-bold text-subtle", className)}>
      {children}
    </th>
  );
}

const actionLink =
  "inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 type-small font-semibold text-muted transition-colors hover:bg-fg/5 hover:text-fg";

/** Open (edit / review / look), preview, and the public article when it is online. */
function RowActions({
  post,
  asso,
  can,
  userId,
}: {
  post: PostSummary;
  asso: string;
  can: ContentDashboard["can"];
  userId: string;
}) {
  const title = postTitle(post);
  const open = openLabel(post, can, userId);
  return (
    <span className="inline-flex items-center gap-0.5">
      <Link href={routes.manageContentPost(asso, post.id)} className={actionLink} aria-label={`${open} « ${title} »`}>
        <Icon name="edit" size={16} />
        {open}
      </Link>
      <Link
        href={routes.postPreview(post.id)}
        className={actionLink}
        aria-label={`Aperçu de « ${title} »`}
        title="Aperçu"
      >
        <Icon name="eye" size={16} />
      </Link>
      {post.is_public && post.slug && (
        <Link
          href={routes.post(post.slug)}
          className={actionLink}
          aria-label={`Voir « ${title} » en ligne`}
          title="Voir en ligne"
        >
          <Icon name="arrow-up-right" size={16} />
        </Link>
      )}
    </span>
  );
}
