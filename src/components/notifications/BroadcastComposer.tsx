"use client";

import { useActionState, useState } from "react";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { cancelBroadcast, createBroadcast, submitBroadcast, type BroadcastActionState } from "@/app/actions/notifications";
import type { BroadcastAudience, BroadcastOptions } from "@/lib/notifications/data";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  all_students: "Tous les étudiant·es",
  members: "Les membres de l'équipe",
  followers: "Les personnes qui suivent l'asso",
};

const AUDIENCE_DETAIL: Record<BroadcastAudience, string> = {
  all_students: "Chaque compte du site. Arrive dans « Annonces du BDE », que chacun peut couper.",
  members: "Les membres actifs de l'équipe. Arrive dans « Messages de tes équipes ».",
  followers: "Celles et ceux qui ont choisi de suivre l'asso. Arrive dans « Assos que tu suis », que chacun peut couper.",
};

const field = "w-full rounded-sm border-2 border-line-strong bg-bg px-3 py-2.5 focus:border-fg";

/**
 * Writing to an audience, in two steps: the person prepares the message
 * (a draft: nothing is sent), sees how many people it would reach and how
 * many would get it by e-mail given their own choices, then confirms. The
 * database freezes the list of recipients at that moment, checks the daily
 * limit and, for an e-mail to the whole campus, waits for a second BDE
 * approval. Plain text only; a link only to a public page of the site.
 */
export function BroadcastComposer({ organizationId, options }: { organizationId: string; options: BroadcastOptions }) {
  const [created, create, creating] = useActionState<BroadcastActionState, FormData>(createBroadcast, { status: "idle" });
  const [submitted, submit, submitting] = useActionState<BroadcastActionState, FormData>(submitBroadcast, { status: "idle" });
  const [dropped, drop, dropping] = useActionState(cancelBroadcast, { status: "idle" });
  const [audience, setAudience] = useState<BroadcastAudience>(options.options[0]?.audience ?? "members");
  const [email, setEmail] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const left = Math.max(options.limit_per_day - options.sent_last_24h, 0);
  const chosen = options.options.find((o) => o.audience === audience);

  // Step 2: the draft exists; confirm or drop it.
  // A draft dropped to be edited goes back to the form (with its words); a new one shows again.
  const droppedAfter = dropped.status === "done" && (dropped.at ?? 0) > (created.at ?? 0);
  const draft = created.status === "done" && created.draft && !droppedAfter ? created.draft : null;
  if (submitted.status === "done") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-sm border-2 border-ok/60 bg-ok/10 p-5">
        <p className="flex items-start gap-2 font-bold">
          <Icon name="check" size={18} className="mt-0.5 shrink-0 text-ok" />
          {submitted.message}
        </p>
        <p className="type-small text-muted">Son avancement s&apos;affiche dans l&apos;historique ci-dessous (rechargé à chaque visite).</p>
      </div>
    );
  }
  if (draft) {
    return (
      <div className="flex flex-col gap-5 rounded-sm border-2 border-fg p-5">
        <p className="type-label text-muted">Avant d&apos;envoyer</p>
        <p className="type-lead">
          Ce message partira à <strong>{plural(draft.recipients, "personne")}</strong>
          {email ? (
            <>
              {" "}
              dont <strong>{plural(draft.email, "par e-mail", "par e-mail")}</strong> (selon leurs propres choix)
            </>
          ) : (
            " dans leurs notifications sur le site"
          )}
          .
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <form action={submit}>
            <input type="hidden" name="id" value={draft.id} />
            <Button type="submit" icon="arrow-right" disabled={submitting || draft.recipients === 0}>
              {submitting ? "Envoi…" : `Envoyer à ${plural(draft.recipients, "personne")}`}
            </Button>
          </form>
          <form action={drop}>
            <input type="hidden" name="id" value={draft.id} />
            <Button type="submit" variant="secondary" disabled={dropping}>
              {dropping ? "Un instant…" : "Modifier (abandonner ce brouillon)"}
            </Button>
          </form>
        </div>
        <p role="status" className="text-[0.9rem] text-danger">
          {submitted.status === "error" ? submitted.message : dropped.status === "error" ? dropped.message : ""}
        </p>
      </div>
    );
  }

  return (
    <form action={create} className="flex flex-col gap-6">
      <input type="hidden" name="organization_id" value={organizationId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-bold">À qui</legend>
        {options.options.map((o) => (
          <label
            key={o.audience}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-sm border-2 p-3",
              audience === o.audience ? "border-fg" : "border-line-strong hover:border-fg/60",
            )}
          >
            <input
              type="radio"
              name="audience"
              value={o.audience}
              checked={audience === o.audience}
              onChange={() => setAudience(o.audience)}
              className="mt-1 size-4 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-bold">
                {AUDIENCE_LABEL[o.audience]} <span className="font-mono font-normal text-muted">· {o.recipients}</span>
              </span>
              <span className="type-small text-muted">{AUDIENCE_DETAIL[o.audience]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="font-bold">Titre</span>
        <input
          name="title"
          required
          minLength={3}
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={field}
          placeholder="Ex : Réunion d'équipe déplacée à jeudi"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${organizationId}-body`} className="font-bold">
            Message
          </label>
          <span id={`${organizationId}-count`} className={cx("font-mono text-[0.8rem]", body.length > 2000 ? "text-danger" : "text-muted")}>
            {body.length} / 2 000 caractères
          </span>
        </span>
        <textarea
          id={`${organizationId}-body`}
          name="body"
          required
          rows={6}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={`${organizationId}-count`}
          className={field}
          placeholder="Texte simple, sans mise en forme. Les liens se mettent dans le champ ci-dessous."
        />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-bold">
          Lien <span className="font-normal text-muted">(facultatif)</span>
        </span>
        <input
          name="link_path"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          pattern="/(events|campus|associations|recruitment)/[a-z0-9]+(-[a-z0-9]+)*"
          className={cx(field, "font-mono")}
          placeholder="Ex : /events/nom-de-l-evenement"
        />
        <span className="type-small text-muted">Une page publique du site seulement : un événement, un article, une asso ou un recrutement.</span>
      </label>

      <div className="flex flex-col gap-2">
        <label className="inline-flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="email" checked={email} onChange={(e) => setEmail(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
          <span className="flex flex-col gap-0.5">
            <span className="font-bold">Aussi par e-mail</span>
            <span className="type-small text-muted">
              {chosen ? `${plural(chosen.email, "personne")} l'accepte${chosen.email > 1 ? "nt" : ""} aujourd'hui pour ce type de message. ` : ""}
              {audience === "all_students"
                ? "Un e-mail à tout le campus doit être approuvé par une autre personne du bureau du BDE, avec la double authentification."
                : "Demande la double authentification."}
            </span>
          </span>
        </label>
        {audience === "all_students" && (
          <label className="inline-flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="important" className="mt-1 size-4 accent-[var(--accent)]" />
            <span className="flex flex-col gap-0.5">
              <span className="font-bold">Marquer comme important</span>
              <span className="type-small text-muted">À garder pour ce qui compte vraiment (sécurité, changement majeur).</span>
            </span>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" icon="arrow-right" disabled={creating || left === 0}>
          {creating ? "Un instant…" : "Préparer l'envoi"}
        </Button>
        <span className="type-small text-muted">
          {left === 0
            ? "Limite du jour atteinte : réessaie demain."
            : `${plural(left, "envoi possible", "envois possibles")} aujourd'hui (${options.limit_per_day} par 24 h).`}
        </span>
      </div>
      <p role="status" className="text-[0.9rem] text-danger">
        {created.status === "error" ? created.message : ""}
      </p>
    </form>
  );
}
