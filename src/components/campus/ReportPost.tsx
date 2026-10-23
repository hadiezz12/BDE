"use client";

import Link from "next/link";
import { useState } from "react";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { reportPost } from "@/app/actions/posts";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { REPORT_DETAILS_MAX, REPORT_REASONS } from "./report-reasons";

/**
 * "Signaler", at the very end of an article: signed-in students only (the
 * database refuses anyone else, and limits how often one person reports).
 * The report goes to the BDE's moderation; nothing changes on the article,
 * no count is shown anywhere, and the association never learns who sent it.
 * Visitors get the way to sign in and come back here.
 */
export function ReportPost({
  postId,
  signedIn,
  loginHref,
  className,
}: {
  postId: string;
  signedIn: boolean;
  /** The login page, with ?next= back to this article. */
  loginHref: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const linkClass = "inline-flex min-h-10 items-center gap-1.5 type-small text-muted hover:text-fg";

  if (!signedIn) {
    return (
      <Link href={loginHref} className={cx(linkClass, "underline-offset-[0.2em] hover:underline", className)}>
        <Icon name="flag" size={15} className="shrink-0" />
        Connecte-toi pour signaler
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cx(linkClass, "rounded-sm px-1 underline-offset-[0.2em] hover:underline", className)}
      >
        <Icon name="flag" size={15} className="shrink-0" />
        Signaler
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} label="Signaler cet article" variant="screen" surface="paper">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <h2 className="type-card text-[1.35rem]">
            Signaler cet article
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-sm hover:bg-fg/8"
          >
            <Icon name="close" size={20} />
            <span className="sr-only">Fermer</span>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 sm:max-h-[min(36rem,75dvh)] sm:px-6">
          <p className="text-muted">
            Le BDE lit chaque signalement et décide de la suite. L&apos;asso qui a publié l&apos;article ne saura
            jamais qui l&apos;a signalé.
          </p>

          <ActionForm
            action={reportPost}
            hidden={{ post_id: postId }}
            submitLabel="Envoyer le signalement"
            submitIcon="flag"
            resetOnDone
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[0.95rem] font-bold">Ce qui pose problème</legend>
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border-2 border-line bg-raised px-3.5 py-2 transition-colors hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent/8"
                >
                  <input type="radio" name="reason" value={r.value} required className="size-4 shrink-0 cursor-pointer accent-accent" />
                  <span className="font-semibold leading-snug">{r.label}</span>
                </label>
              ))}
            </fieldset>

            <Field
              label="Précisions"
              optional
              hint={`Ce que le BDE doit regarder, en quelques mots (${REPORT_DETAILS_MAX} caractères au plus).`}
            >
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  name="details"
                  maxLength={REPORT_DETAILS_MAX}
                  rows={3}
                  aria-describedby={describedBy}
                  className="min-h-24"
                />
              )}
            </Field>
          </ActionForm>

          <p className="flex items-start gap-2 border-t border-line pt-4 type-small text-muted">
            <Icon name="shield" size={16} className="mt-0.5 shrink-0" />
            <span>
              Si quelqu&apos;un est en danger ou subit des violences, n&apos;attends pas la modération :{" "}
              <Link href={routes.safety} className="link text-fg">
                la page VSS / VDH
              </Link>{" "}
              donne les contacts à joindre tout de suite.
            </span>
          </p>
        </div>
      </Dialog>
    </>
  );
}
