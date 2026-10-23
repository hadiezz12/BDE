"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import type { GovernanceActionState } from "@/app/actions/governance";
import type { PostEditor } from "@/lib/posts/editor";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { formatScheduled, instantToParisLocal } from "@/lib/posts/schedule";
import {
  archivePost,
  cancelPostSchedule,
  changePostSlug,
  deletePostDraft,
  publishPost,
  reviewPost,
  schedulePost,
  setPostPin,
  submitPost,
  unpublishPost,
  withdrawPost,
} from "@/app/actions/posts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PostStageBadge } from "@/components/posts/PostStageBadge";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { stamp } from "./labels";
import { ScheduleFields } from "./ScheduleFields";
import { previewHref, type PublishBlocker, type WorkflowPlan } from "./workflow";

/**
 * Why the buttons wait: the text on screen is not saved yet, the page is
 * catching up with the version this editor just started, or someone else
 * saved (conflict) or started a newer version (stale) meanwhile: the page
 * must be reloaded.
 */
export type WorkflowPause = "unsaved" | "refreshing" | "conflict" | "stale" | null;

const PAUSE_TEXT: Record<Exclude<WorkflowPause, "stale" | null>, string> = {
  unsaved: "Enregistre d'abord : les actions portent sur la version enregistrée.",
  refreshing: "Mise à jour de la version enregistrée…",
  conflict:
    "Quelqu'un d'autre a enregistré ce texte pendant que tu écrivais : copie ce que tu veux garder, puis recharge la dernière version.",
};

type Action = (prev: GovernanceActionState, form: FormData) => Promise<GovernanceActionState>;

/**
 * The post's next steps for this person, and nothing they could not do: the
 * status in words with what happens next, then the actions the rules allow
 * (send for review, review, publish or schedule, the scheduled publication,
 * what to do with an article online, delete a draft). Every button is a
 * form bound to the SAVED version; while the text on screen differs from
 * it, the buttons wait ("Enregistre d'abord"). The database checks it all
 * again: rights, editorial policy, exact approval, moderation.
 */
export function WorkflowPanel({
  asso,
  data,
  plan,
  revisionId,
  complete,
  pause,
  onSaveNow,
  onDone,
  mfa,
  canPublishPage,
  today,
}: {
  asso: string;
  data: PostEditor;
  plan: WorkflowPlan;
  /** The saved working version every action applies to. */
  revisionId: string;
  /** The saved text has a title and words enough to be sent or published. */
  complete: boolean;
  pause: WorkflowPause;
  onSaveNow: () => void;
  /**
   * The confirmation of a step whose form goes away once it worked (sent for
   * review, published, scheduled…): the page refreshes into the next step,
   * and the confirmation is shown above it.
   */
  onDone: (message: string) => void;
  /** The session passed the second factor (publish, schedule, review, address). */
  mfa: boolean;
  /** May put the association's page online (organization.page.publish). */
  canPublishPage: boolean;
  today: string;
}) {
  const { post, working, settings } = data;
  const ids = { post_id: post.id, revision_id: revisionId };
  const act = useMemo(() => {
    const report =
      (action: Action): Action =>
      async (prev, form) => {
        const result = await action(prev, form);
        if (result.status === "done" && result.message) onDone(result.message);
        return result;
      };
    return {
      submit: report(submitPost),
      withdraw: report(withdrawPost),
      review: report(reviewPost),
      publish: report(publishPost),
      schedule: report(schedulePost),
      cancel: report(cancelPostSchedule),
      unpublish: report(unpublishPost),
      archive: report(archivePost),
    };
  }, [onDone]);
  const needsMfa =
    !mfa &&
    (plan.publish ||
      plan.schedule ||
      plan.review === "open" ||
      Boolean(plan.scheduled?.reschedule || plan.scheduled?.publishNow) ||
      plan.online.slug);
  const live = post.published && post.publication !== "unpublished" ? post.published.number : null;
  const hasActions =
    plan.submit ||
    plan.withdraw ||
    plan.review !== null ||
    plan.publish ||
    plan.schedule ||
    plan.blocker !== null ||
    plan.scheduled !== null ||
    Object.values(plan.online).some(Boolean) ||
    plan.delete;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <PostStageBadge post={post} />
        <p className="type-small text-muted">{plan.next}</p>
      </div>

      {needsMfa && <MfaNotice what="Publier, programmer, relire ou changer l'adresse d'un article" />}

      {pause && hasActions && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-warn/50 bg-raised px-4 py-3">
          <p className="flex items-start gap-2 type-small font-semibold">
            <Icon name="clock" size={16} className="mt-0.5 shrink-0 text-warn" />
            {pause === "stale"
              ? `Quelqu'un a commencé une version plus récente (n°${working.number}) pendant que la page était ouverte. Recharge-la pour travailler dessus.`
              : PAUSE_TEXT[pause]}
          </p>
          {pause === "unsaved" && (
            <Button type="button" size="sm" variant="secondary" icon="check" iconPosition="start" onClick={onSaveNow} className="self-start">
              Enregistrer maintenant
            </Button>
          )}
          {(pause === "stale" || pause === "conflict") && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon="history"
              iconPosition="start"
              onClick={() => window.location.reload()}
              className="self-start"
            >
              Recharger la page
            </Button>
          )}
        </div>
      )}

      <fieldset disabled={pause !== null} className="flex min-w-0 flex-col gap-5 disabled:opacity-60">
        <legend className="sr-only">Étapes de publication</legend>

        {plan.review === "open" && (
          <Step title={`Relire la version n°${working.number}`}>
            <p className="type-small text-muted">
              {working.submitted_by_name && working.submitted_at
                ? `Envoyée par ${working.submitted_by_name} le ${stamp(working.submitted_at)}. `
                : ""}
              Relis-la dans l&apos;aperçu&nbsp;: tu approuves ce texte exact, et toute modification ultérieure repassera
              en relecture.
            </p>
            <a
              href={previewHref(post.id, revisionId, false)}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-10 items-center gap-1.5 self-start type-label hover:text-assoc-text"
            >
              <Icon name="eye" size={14} />
              Lire la version n°{working.number}
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
            <ActionForm action={act.review} hidden={{ ...ids, decision: "approve" }} submitLabel="Approuver" submitIcon="check" />
            <Disclosure summary="Demander des modifications" icon="edit">
              <ActionForm
                action={act.review}
                hidden={{ ...ids, decision: "request_changes" }}
                submitLabel="Envoyer la demande"
                variant="secondary"
              >
                <Field label="Ce qu'il faut changer" hint="Lue par l'auteur ou l'autrice dans l'éditeur. 500 caractères au plus.">
                  {({ id, describedBy }) => (
                    <Textarea id={id} aria-describedby={describedBy} name="note" required minLength={3} maxLength={500} rows={4} />
                  )}
                </Field>
              </ActionForm>
            </Disclosure>
          </Step>
        )}

        {plan.review === "self" && (
          <p className="flex items-start gap-2 type-small text-muted">
            <Icon name="users" size={16} className="mt-0.5 shrink-0" />
            Tu as écrit ou envoyé cette version&nbsp;: tu ne peux pas la relire toi-même. Une autre personne qui peut
            approuver les articles s&apos;en charge.
          </p>
        )}

        {plan.submit &&
          (complete ? (
            <ActionForm action={act.submit} hidden={ids} submitLabel="Envoyer en relecture" submitIcon="arrow-right">
              <p className="type-small text-muted">
                La version n°{working.number} ne change plus ensuite&nbsp;: une personne qui peut approuver la relit
                {settings.review_mode === "approval" ? " avant toute publication" : ""}.
              </p>
            </ActionForm>
          ) : (
            <Incomplete what="l'envoyer en relecture" />
          ))}

        {plan.withdraw && (
          <ActionForm action={act.withdraw} hidden={ids} submitLabel="Retirer de la relecture" variant="secondary" submitIcon="undo">
            <p className="type-small text-muted">
              Elle redevient un brouillon que tu peux modifier, sans nouvelle version. Personne ne la relit plus.
            </p>
          </ActionForm>
        )}

        {plan.publish && (
          <ActionForm
            action={act.publish}
            hidden={ids}
            submitLabel={post.first_published_at ? "Publier cette version" : "Publier maintenant"}
            submitIcon="check"
          >
            <p className="type-small text-muted">
              {live !== null
                ? `Elle remplace tout de suite la version en ligne (n°${live}).`
                : post.first_published_at
                  ? "L'article revient en ligne tout de suite, à sa date de première publication."
                  : "L'article paraît tout de suite dans le fil Campus et sur la page de l'asso."}
              {working.status === "draft" && " Ta publication vaut validation : elle est notée dans l'historique."}
            </p>
          </ActionForm>
        )}

        {plan.schedule && (
          <Disclosure summary="Programmer la publication" icon="calendar" open={!plan.publish}>
            <ActionForm action={act.schedule} hidden={ids} submitLabel="Programmer" submitIcon="calendar">
              {plan.scheduled && !plan.scheduled.isWorking && (
                <p className="type-small text-muted">
                  Remplace la programmation de la version n°{plan.scheduled.revisionNumber}.
                </p>
              )}
              <ScheduleFields today={today} />
            </ActionForm>
          </Disclosure>
        )}

        {plan.blocker && (
          <BlockerNote
            blocker={plan.blocker}
            asso={asso}
            canPublishPage={canPublishPage}
            canSubmit={plan.submit}
            setup={data.organization.status === "setup"}
          />
        )}

        {plan.scheduled && (
          <Step title={plan.scheduled.failed ? "Publication programmée : échec" : "Publication programmée"} tone={plan.scheduled.failed ? "danger" : "default"}>
            <p className="flex items-start gap-2">
              <Icon name="calendar" size={18} className="mt-0.5 shrink-0 text-muted" />
              <span>
                <span className="font-bold">{formatScheduled(plan.scheduled.at, true)}</span>
                <span className="block type-small text-muted">
                  Version n°{plan.scheduled.revisionNumber}
                  {plan.scheduled.isWorking
                    ? " (celle-ci)"
                    : ` — pas celle que tu as sous les yeux (n°${working.number}), qui n'est pas programmée`}
                  .{" "}
                  {plan.scheduled.revisionId && (
                    <Link href={routes.postPreview(post.id, plan.scheduled.revisionId)} className="link">
                      Voir son aperçu
                    </Link>
                  )}
                </span>
              </span>
            </p>
            {plan.scheduled.failed && (
              <p role="alert" className="type-small font-semibold text-danger">
                Elle n&apos;a pas eu lieu&nbsp;: {plan.scheduled.error}.{" "}
                {plural(plan.scheduled.attempts, "tentative")}. Règle le problème, puis reprogramme-la ou annule-la.
              </p>
            )}
            {plan.scheduled.publishNow && plan.scheduled.revisionId && (
              <ActionForm
                action={act.publish}
                hidden={{ post_id: post.id, revision_id: plan.scheduled.revisionId }}
                submitLabel="Publier maintenant"
                submitIcon="check"
                variant="secondary"
              />
            )}
            {plan.scheduled.reschedule && plan.scheduled.revisionId && (
              <Disclosure summary={plan.scheduled.failed ? "Reprogrammer" : "Changer le jour ou l'heure"} icon="calendar" open={plan.scheduled.failed}>
                <ActionForm
                  action={schedulePost}
                  hidden={{ post_id: post.id, revision_id: plan.scheduled.revisionId }}
                  submitLabel="Reprogrammer"
                  submitIcon="calendar"
                >
                  <ScheduleFields
                    today={today}
                    initial={plan.scheduled.failed ? undefined : instantToParisLocal(plan.scheduled.at)}
                  />
                </ActionForm>
              </Disclosure>
            )}
            {plan.scheduled.cancel && (
              <ActionForm action={act.cancel} hidden={{ post_id: post.id }} submitLabel="Annuler la programmation" variant="ghost" submitIcon="close">
                <p className="type-small text-muted">Rien n&apos;est publié ; la version reste approuvée.</p>
              </ActionForm>
            )}
          </Step>
        )}

        {(plan.online.view || plan.online.pin || plan.online.archive || plan.online.unarchive || plan.online.unpublish || plan.online.slug) && (
          <Step
            title={
              post.publication === "published"
                ? "Article en ligne"
                : post.publication === "archived"
                  ? "Article archivé"
                  : "Adresse de l'article"
            }
          >
            {plan.online.view && post.slug && (
              <ButtonLink href={routes.post(post.slug)} variant="secondary" size="sm" icon="arrow-up-right" className="self-start">
                Voir en ligne
              </ButtonLink>
            )}
            {plan.online.pin && (
              <ActionForm
                action={setPostPin}
                hidden={{ post_id: post.id, pinned: post.pinned ? "0" : "1" }}
                submitLabel={post.pinned ? "Désépingler" : "Épingler sur la page de l'asso"}
                submitIcon="pushpin"
                variant="secondary"
                size="sm"
              >
                <p className="type-small text-muted">
                  {post.pinned
                    ? "Épinglé en tête de la page de l'asso."
                    : "En tête de la page de l'asso, avant les plus récents. Trois articles épinglés au plus."}
                </p>
              </ActionForm>
            )}
            {plan.online.unarchive && (
              <ActionForm
                action={act.archive}
                hidden={{ post_id: post.id, archive: "0" }}
                submitLabel="Sortir des archives"
                submitIcon="history"
                variant="secondary"
                size="sm"
              >
                <p className="type-small text-muted">Il revient dans le fil, à sa date de première publication.</p>
              </ActionForm>
            )}
            {plan.online.archive && (
              <Disclosure summary="Archiver" icon="history">
                <ActionForm action={act.archive} hidden={{ post_id: post.id, archive: "1" }} submitLabel="Archiver" variant="secondary">
                  <p className="type-small text-muted">
                    Il quitte le fil et la page de l&apos;asso, mais son adresse marche toujours, avec un bandeau
                    «&nbsp;Archivé&nbsp;». Tu pourras l&apos;en sortir. Pour qu&apos;il ne soit plus lisible du tout,
                    retire-le du site.
                  </p>
                </ActionForm>
              </Disclosure>
            )}
            {plan.online.slug && post.slug && (
              <Disclosure summary="Changer l'adresse" icon="link">
                <ActionForm action={changePostSlug} hidden={{ post_id: post.id }} submitLabel="Changer l'adresse">
                  <p className="type-small text-muted">
                    Adresse actuelle&nbsp;: <span className="break-all font-mono text-fg">{routes.post(post.slug)}</span>.
                    L&apos;ancienne continuera de mener à l&apos;article. À faire rarement&nbsp;: les liens déjà partagés
                    passent alors par une redirection.
                  </p>
                  <Field label="Nouvelle adresse" hint="Minuscules sans accent, chiffres et tirets, 3 caractères au moins.">
                    {({ id, describedBy }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        name="slug"
                        required
                        defaultValue={post.slug ?? ""}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        minLength={3}
                        maxLength={100}
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="off"
                      />
                    )}
                  </Field>
                </ActionForm>
              </Disclosure>
            )}
            {plan.online.unpublish && (
              <Disclosure summary="Retirer du site" icon="eye" tone="danger">
                <ActionForm action={act.unpublish} hidden={{ post_id: post.id }} submitLabel="Retirer du site" variant="danger">
                  <p className="type-small text-muted">
                    Il disparaît tout de suite du fil, de la page de l&apos;asso et de la recherche, et son adresse ne
                    mène plus à rien. Il reste ici, modifiable, et revient à la prochaine publication. Une image déjà
                    affichée peut rester quelque temps dans le cache des navigateurs.
                  </p>
                  <Field label="Raison" optional hint="Gardée dans l'historique de l'asso.">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" maxLength={500} />}
                  </Field>
                </ActionForm>
              </Disclosure>
            )}
          </Step>
        )}

        {plan.delete && (
          <Disclosure summary="Supprimer ce brouillon" icon="close" tone="danger">
            <ActionForm
              action={deletePostDraft}
              hidden={{ post_id: post.id, organization_slug: asso }}
              submitLabel="Supprimer définitivement"
              variant="danger"
            >
              <p className="type-small text-muted">
                L&apos;article n&apos;a jamais été en ligne&nbsp;: il disparaît avec toutes ses versions (l&apos;historique
                de l&apos;asso garde la trace de la suppression). On ne peut pas revenir en arrière.
              </p>
            </ActionForm>
          </Disclosure>
        )}
      </fieldset>
    </div>
  );
}

/** A bordered group of actions with its heading. */
function Step({ title, tone = "default", children }: { title: string; tone?: "default" | "danger"; children: ReactNode }) {
  return (
    <section className={tone === "danger" ? "flex flex-col gap-3 rounded-md border-2 border-danger/60 p-4" : "flex flex-col gap-3 rounded-md border border-line-strong p-4"}>
      <h3 className="type-button text-[0.82rem]">{title}</h3>
      {children}
    </section>
  );
}

function Incomplete({ what }: { what: string }) {
  return (
    <p className="flex items-start gap-2 type-small text-muted">
      <Icon name="info" size={16} className="mt-0.5 shrink-0 text-info" />
      Pour {what}, il faut un titre (3 caractères au moins) et une introduction ou du texte.
    </p>
  );
}

/** Why a publisher cannot publish or schedule the version on screen, and what to do. */
function BlockerNote({
  blocker,
  asso,
  canPublishPage,
  canSubmit,
  setup,
}: {
  blocker: PublishBlocker;
  asso: string;
  canPublishPage: boolean;
  canSubmit: boolean;
  setup: boolean;
}) {
  if (blocker === "hidden") return null; // The moderation banner says it already.
  if (blocker === "incomplete") return <Incomplete what="la publier ou la programmer" />;
  if (blocker === "page_not_public") {
    return (
      <Notice
        tone="info"
        icon="globe"
        title={setup ? "L'asso est encore en préparation : publier attend" : "La page de l'asso n'est pas en ligne : publier attend"}
        action={
          !setup && canPublishPage ? (
            <ButtonLink href={routes.managePagePublication(asso)} size="sm" variant="secondary" icon="arrow-right">
              Publier la page
            </ButtonLink>
          ) : undefined
        }
      >
        <p>
          Un article paraît avec la page publique de son asso. Tu peux le programmer dès maintenant&nbsp;: il partira
          seulement si {setup ? "l'asso est active et sa page en ligne" : "la page est en ligne"} à l&apos;heure dite.
          {!setup && !canPublishPage && " La page est publiée par les postes qui ont le droit « Publier la page »."}
        </p>
      </Notice>
    );
  }
  const text: Record<Exclude<PublishBlocker, "hidden" | "incomplete" | "page_not_public">, string> = {
    in_review: "Cette version attend sa relecture : elle se publie une fois approuvée par une autre personne.",
    changes_requested: "Des modifications ont été demandées : corrige le texte, puis renvoie-le en relecture.",
    approval_required: canSubmit
      ? "Dans ton asso, chaque version est approuvée avant publication : envoie-la en relecture."
      : "Dans ton asso, chaque version est approuvée avant publication : la personne qui l'écrit l'envoie en relecture.",
    organization_inactive: "L'asso est suspendue ou archivée : rien ne peut être publié.",
  };
  return (
    <p className="flex items-start gap-2 type-small text-muted">
      <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
      {text[blocker]}
    </p>
  );
}
