"use client";

import type { ReactNode } from "react";
import type { PostEditor } from "@/lib/posts/editor";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { stamp } from "./labels";

/** Why the version on screen opens read-only. */
export type Frozen = "submitted" | "changes_requested" | "approved" | "live";

export function frozenReason(data: PostEditor): Frozen | null {
  const { working, post } = data;
  if (post.published?.id === working.id && post.publication !== "unpublished") return "live";
  if (working.status === "submitted" || working.status === "changes_requested" || working.status === "approved") {
    return working.status;
  }
  return null;
}

/**
 * Above a frozen version (sent for review, sent back, approved, online):
 * who did what and when, the reviewer's note, and "Modifier", which unlocks
 * the text. Nothing changes until the first edit, which the database turns
 * into a new version: the frozen one stays exactly as it was reviewed or
 * published (and leaves the review queue, if it was in it).
 */
export function VersionBanner({
  data,
  frozen,
  canEdit,
  onUnlock,
}: {
  data: PostEditor;
  frozen: Frozen;
  canEdit: boolean;
  onUnlock: () => void;
}) {
  const { working, settings, post } = data;
  const next = Math.max(...data.history.map((h) => h.number), working.number) + 1;
  const scheduledHere = post.schedule && post.schedule.revision === working.number;

  let title: string;
  let facts: ReactNode;
  let edit: string;
  switch (frozen) {
    case "submitted":
      title = `Version n°${working.number} en relecture`;
      facts =
        working.submitted_at &&
        `Envoyée${working.submitted_by_name ? ` par ${working.submitted_by_name}` : ""} le ${stamp(working.submitted_at)}. Elle ne change plus pendant la relecture.`;
      edit = `Modifier la retire de la relecture : tes changements deviennent la version n°${next}, à renvoyer en relecture.`;
      break;
    case "changes_requested":
      title = `Modifications demandées sur la version n°${working.number}`;
      facts = (
        <>
          {working.reviewed_at && (
            <span className="block">
              Par {working.reviewed_by_name ?? "la relecture"} le {stamp(working.reviewed_at)}
              {working.review_note ? " :" : "."}
            </span>
          )}
          {working.review_note && (
            <q className="mt-1.5 block border-l-4 border-warn pl-3 font-semibold text-fg [quotes:none]">{working.review_note}</q>
          )}
        </>
      );
      edit = `Clique sur « Modifier » pour corriger : tes changements deviennent la version n°${next}, à renvoyer en relecture.`;
      break;
    case "approved":
      title = `Version n°${working.number} approuvée`;
      facts =
        working.reviewed_at &&
        `${working.review_mode === "direct" ? "Validée" : "Approuvée"}${
          working.reviewed_by_name ? ` par ${working.reviewed_by_name}` : ""
        } le ${stamp(working.reviewed_at)}. Ce texte exact peut être publié${scheduledHere ? " : il est programmé" : ""}.`;
      edit = `Modifier crée la version n°${next}${
        settings.review_mode === "approval" ? ", qui devra être approuvée à son tour" : ""
      }. Celle-ci reste approuvée${scheduledHere ? " et garde sa programmation" : ""}.`;
      break;
    default:
      title =
        post.publication === "archived"
          ? `Version n°${working.number} publiée, article archivé`
          : `Version n°${working.number} en ligne`;
      facts = `${working.published_at ? `Publiée le ${stamp(working.published_at)}. ` : ""}${
        post.publication === "archived" ? "Hors du fil, l'article reste lisible à son adresse." : ""
      }`.trim();
      edit = `Modifier crée un brouillon (version n°${next}) : l'article en ligne ne change pas avant sa prochaine publication.`;
  }

  return (
    <div
      className={
        frozen === "changes_requested"
          ? "flex flex-col gap-3 rounded-md border-2 border-warn/70 bg-raised px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5"
          : "flex flex-col gap-3 rounded-md border border-line-strong bg-raised px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5"
      }
    >
      <Icon name={frozen === "changes_requested" ? "edit" : "lock"} size={20} className="shrink-0 text-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="font-bold">{title}</p>
        {facts && <div className="type-small text-muted">{facts}</div>}
        <p className="type-small text-muted">
          {canEdit
            ? edit
            : frozen === "submitted" && data.can.review_this
              ? "À toi de la relire : décide dans « Publication », après l'avoir lue dans l'aperçu."
              : "Tu peux la lire. La modifier demande le droit « Modifier tous les articles », ou d'avoir commencé l'article avec « Écrire des articles »."}
        </p>
      </div>
      {canEdit && (
        <Button type="button" icon="edit" iconPosition="start" onClick={onUnlock} className="self-start">
          Modifier
        </Button>
      )}
    </div>
  );
}

/** Once "Modifier" is pressed, until the first change is saved. */
export function UnlockedNote({ number, next, submitted }: { number: number; next: number; submitted: boolean }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-md border border-info/40 bg-raised px-4 py-3 type-small">
      <Icon name="info" size={16} className="mt-0.5 shrink-0 text-info" />
      <span>
        Tu modifies une copie de la version n°{number}&nbsp;: ta première modification crée la version n°{next}
        {submitted ? " et retire la n°" + number + " de la relecture" : ""}. Tant que tu ne changes rien, rien ne se
        passe.
      </span>
    </p>
  );
}
