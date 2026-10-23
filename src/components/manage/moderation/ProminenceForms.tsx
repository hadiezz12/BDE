import { setPostProminence } from "@/app/actions/posts";
import { addDaysToKey, parisDateKey } from "@/lib/time";
import { Field, Input } from "@/components/ui/Field";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { PROMINENCE_MAX_DAYS } from "./labels";

/**
 * Campus-wide prominence (platform.content.feature, second factor): put a
 * published post "à la une" of the fil, mark a BDE post as an important
 * notice, or take either back to normal. The database checks the right, the
 * limits (3 and 2), that the post is online, and that only BDE posts are
 * marked important.
 */

function UntilField() {
  const today = parisDateKey(new Date());
  return (
    <Field
      label="Jusqu'au"
      optional
      hint="Il en sort ce jour-là à 23 h 59, dans 60 jours au plus. Sans date, il y reste jusqu'à ce que tu l'en retires."
    >
      {({ id, describedBy }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          type="date"
          name="until"
          min={today}
          max={addDaysToKey(today, PROMINENCE_MAX_DAYS)}
          className="max-w-56"
        />
      )}
    </Field>
  );
}

export function FeaturePostForm({ postId }: { postId: string }) {
  return (
    <Disclosure summary="Mettre à la une" icon="plus" tone="primary">
      <ActionForm action={setPostProminence} hidden={{ post_id: postId, prominence: "featured" }} submitLabel="Mettre à la une">
        <p className="type-small text-muted">En tête du fil Campus, pour toute l&apos;école. L&apos;asso n&apos;a rien à faire.</p>
        <UntilField />
      </ActionForm>
    </Disclosure>
  );
}

export function MarkImportantForm({ postId }: { postId: string }) {
  return (
    <Disclosure summary="Marquer important" icon="alert" tone="primary">
      <ActionForm action={setPostProminence} hidden={{ post_id: postId, prominence: "important" }} submitLabel="Marquer important">
        <p className="type-small text-muted">
          Imprimé sur papier tout en haut du fil&nbsp;: à garder pour ce que toute l&apos;école doit lire (une assemblée
          générale, un changement qui concerne tout le monde).
        </p>
        <UntilField />
      </ActionForm>
    </Disclosure>
  );
}

export function ClearProminenceForm({ postId, label }: { postId: string; label: string }) {
  return (
    <ActionForm
      action={setPostProminence}
      hidden={{ post_id: postId, prominence: "normal" }}
      submitLabel={label}
      submitIcon="minus"
      variant="secondary"
      size="sm"
      inline
    />
  );
}
