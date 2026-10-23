import type { ReactNode } from "react";
import type { PostEditor, RevisionInfo } from "@/lib/posts/editor";
import { restorePostRevision } from "@/app/actions/posts";
import { cx } from "@/lib/cx";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { REVISION_STATUS_LABEL, REVISION_STATUS_TONE, reviewSentence, stamp } from "./labels";
import { previewHref } from "./workflow";

/**
 * Every version of a post, newest first, as the database keeps them: who
 * started and edited it, who sent it for review and who decided, when it
 * went online, where it was restored from. Each opens in the private
 * preview; those who may edit can take one up again as a new draft
 * (public.restore_post_revision: history is never rewritten, nothing
 * changes online, and the restored text goes through review and
 * publication like any other).
 */
export function RevisionList({ data, canRestore }: { data: PostEditor; canRestore: boolean }) {
  const { post, working, history } = data;
  const liveId = post.publication !== "unpublished" ? post.published?.id ?? null : null;
  const next = Math.max(working.number, ...history.map((h) => h.number)) + 1;

  return (
    <ol className="flex flex-col gap-4">
      {history.map((r) => {
        const isWorking = r.id === working.id;
        const isLive = r.id === liveId;
        const scheduled = post.schedule?.revision === r.number;
        const lastPublished = !isLive && post.published?.id === r.id;
        return (
          <li
            key={r.id}
            className={cx(
              "flex flex-col gap-3 rounded-md border bg-raised px-4 py-4 sm:px-5",
              isWorking || isLive ? "border-line-strong" : "border-line",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h3 className="type-card">Version n°{r.number}</h3>
              <StatusBadge tone={REVISION_STATUS_TONE[r.status]}>{REVISION_STATUS_LABEL[r.status]}</StatusBadge>
              {isLive && <Tag tone="ok">{post.publication === "archived" ? "Publiée · archivée" : "En ligne"}</Tag>}
              {lastPublished && <Tag>Dernière publiée (retirée du site)</Tag>}
              {isWorking && <Tag tone="accent">Version de travail</Tag>}
              {scheduled && (
                <Tag tone={post.schedule?.status === "failed" ? "danger" : "info"}>
                  {post.schedule?.status === "failed" ? "Programmation échouée" : "Programmée"}
                </Tag>
              )}
            </div>
            <p className="break-words font-semibold">
              {r.title.trim() || <span className="italic text-subtle">Sans titre</span>}
              <span className="font-normal text-subtle"> · {POST_KIND_LABEL[r.kind]}</span>
            </p>

            <dl className="grid gap-x-6 gap-y-1.5 type-small sm:grid-cols-[minmax(9rem,auto)_1fr]">
              <Fact term="Commencée">
                le {stamp(r.created_at)} par {r.created_by_name}
                {r.restored_from !== null && `, en reprenant la version n°${r.restored_from}`}
              </Fact>
              {Date.parse(r.updated_at) - Date.parse(r.created_at) > 60_000 && (
                <Fact term="Dernière modification">
                  le {stamp(r.updated_at)} par {r.updated_by_name}
                </Fact>
              )}
              {r.contributors.length > 1 && <Fact term="Écrite par">{r.contributors.join(", ")}</Fact>}
              {r.submitted_at && (
                <Fact term="Envoyée en relecture">
                  le {stamp(r.submitted_at)}
                  {r.submitted_by_name && ` par ${r.submitted_by_name}`}
                </Fact>
              )}
              {r.reviewed_at && (
                <Fact term={reviewTerm(r)}>
                  le {stamp(r.reviewed_at)}
                  {r.reviewed_by_name && ` par ${r.reviewed_by_name}`}
                </Fact>
              )}
              {r.published_at && <Fact term="Mise en ligne">le {stamp(r.published_at)}</Fact>}
            </dl>

            {r.review_note && (
              <blockquote className="border-l-4 border-line-strong pl-3 type-small">
                <p className="type-label text-muted">Note de relecture</p>
                <p className="mt-1 whitespace-pre-line">{r.review_note}</p>
              </blockquote>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <ButtonLink
                href={previewHref(post.id, r.id, false)}
                variant="secondary"
                size="sm"
                icon="eye"
                iconPosition="start"
                className="self-start"
              >
                Aperçu
              </ButtonLink>
              {canRestore && !isWorking && (
                <Disclosure summary="Reprendre cette version" icon="history" className="sm:min-w-[20rem] sm:flex-1">
                  <ActionForm
                    action={restorePostRevision}
                    hidden={{ post_id: post.id, revision_id: r.id }}
                    submitLabel={`Reprendre comme version n°${next}`}
                    submitIcon="history"
                  >
                    <RestoreExplanation data={data} next={next} />
                  </ActionForm>
                </Disclosure>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function reviewTerm(r: RevisionInfo): string {
  if (r.review_mode === "direct") return "Validée sans relecture";
  if (r.review_mode === "review") return "Approuvée";
  return "Modifications demandées";
}

function RestoreExplanation({ data, next }: { data: PostEditor; next: number }) {
  const { working, settings, post } = data;
  const liveNumber = post.publication !== "unpublished" ? (post.published?.number ?? null) : null;
  const replaced = working.status === "draft" || working.status === "submitted";
  return (
    <div className="flex flex-col gap-2 type-small text-muted">
      <p>
        Son texte devient un nouveau brouillon, la version n°{next}. Rien ne change en ligne
        {liveNumber !== null ? ` : la version n°${liveNumber} y reste` : ""}. Relis-le, puis{" "}
        {settings.review_mode === "direct" && data.can.publish ? "publie-le" : "envoie-le en relecture"} comme
        n&apos;importe quelle version.
      </p>
      {replaced && (
        <p>
          La version en cours (n°{working.number}, {working.status === "submitted" ? "en relecture" : "brouillon"}) est
          remplacée&nbsp;; elle reste dans cet historique.
        </p>
      )}
    </div>
  );
}

/** The decisions taken on the post's versions, newest first. */
export function ReviewTimeline({ reviews }: { reviews: PostEditor["reviews"] }) {
  if (reviews.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-strong px-4 py-5 type-small text-muted">
        Aucune décision pour l&apos;instant. Les approbations, les demandes de modifications et les publications
        directes s&apos;inscrivent ici, avec leur date et leur note.
      </p>
    );
  }
  return (
    <ol className="flex flex-col border-l-2 border-line-strong">
      {reviews.map((v, i) => (
        <li key={`${v.created_at}-${i}`} className="relative flex flex-col gap-1 pb-5 pl-5 last:pb-0">
          <span
            aria-hidden
            className={cx(
              "absolute -left-[7px] top-1.5 size-3 rounded-full border-2 border-bg",
              v.decision === "changes_requested" ? "bg-warn" : "bg-ok",
            )}
          />
          <p className="type-meta text-subtle">{stamp(v.created_at)}</p>
          <p className="font-semibold">{reviewSentence(v)}</p>
          {v.note && (
            <p className="flex items-start gap-2 type-small text-muted">
              <Icon name="quote" size={14} className="mt-1 shrink-0" />
              <span className="whitespace-pre-line">{v.note}</span>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-subtle">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Tag({ tone = "neutral", children }: { tone?: "ok" | "accent" | "info" | "danger" | "neutral"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-xs border px-1.5 py-0.5 type-label text-[0.65rem]",
        tone === "ok" && "border-ok/50 text-ok",
        tone === "accent" && "border-accent-text/50 text-accent-text",
        tone === "info" && "border-info/50 text-info",
        tone === "danger" && "border-danger/50 text-danger",
        tone === "neutral" && "border-line-strong text-muted",
      )}
    >
      {children}
    </span>
  );
}
