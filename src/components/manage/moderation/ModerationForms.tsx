import { dismissReport, hidePost, restorePostVisibility } from "@/app/actions/posts";
import { Field, Textarea } from "@/components/ui/Field";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";

/**
 * The three moderation decisions, each folded behind its name. Hiding and
 * restoring need a reason (3 to 500 characters) and a session verified with
 * the second factor; the database checks both, the platform right, and that
 * the post is still in the state the button assumes.
 */

export function HidePostForm({ postId, live }: { postId: string; live: boolean }) {
  return (
    <Disclosure summary="Masquer l'article" icon="eye" tone="danger">
      <ActionForm action={hidePost} hidden={{ post_id: postId }} submitLabel="Masquer l'article" variant="danger">
        <p className="type-small text-muted">
          {live
            ? "L'article disparaît tout de suite du fil, de la page de l'asso, de la recherche et de son adresse. "
            : "L'article n'est déjà plus en ligne : le masquer l'empêche d'y revenir. "}
          L&apos;asso voit ta raison dans son espace et ne peut pas le remettre en ligne&nbsp;; seul le BDE peut le rétablir. Il
          perd son épingle et sa place à la une, et ses signalements ouverts sont clos avec ta raison.
        </p>
        <Field label="Raison" hint="Obligatoire, entre 3 et 500 caractères. L'asso la lit, et elle reste dans l'historique.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              className="min-h-24"
              placeholder="Ex : l'article montre des informations personnelles d'un·e étudiant·e"
            />
          )}
        </Field>
      </ActionForm>
    </Disclosure>
  );
}

export function RestorePostForm({ postId }: { postId: string }) {
  return (
    <Disclosure summary="Rétablir l'article" icon="check" tone="primary">
      <ActionForm action={restorePostVisibility} hidden={{ post_id: postId }} submitLabel="Rétablir">
        <p className="type-small text-muted">
          Il revient tel que l&apos;asso l&apos;a laissé&nbsp;: en ligne s&apos;il est toujours publié, à sa date de
          première publication, sans épingle ni place à la une (le masquage les a retirées). L&apos;asso retrouve la main
          dessus.
        </p>
        <Field label="Raison" hint="Obligatoire, entre 3 et 500 caractères. Elle reste dans l'historique.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              className="min-h-20"
              placeholder="Ex : l'asso a retiré les informations en cause"
            />
          )}
        </Field>
      </ActionForm>
    </Disclosure>
  );
}

export function DismissReportForm({ reportId }: { reportId: string }) {
  return (
    <Disclosure summary="Classer sans suite" icon="check">
      <ActionForm action={dismissReport} hidden={{ report_id: reportId }} submitLabel="Classer sans suite" variant="secondary">
        <p className="type-small text-muted">L&apos;article reste en ligne, sans rien changer pour l&apos;asso.</p>
        <Field label="Note" optional hint="Pour l'historique de la modération, que seul le BDE lit. 500 caractères au plus.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              name="note"
              maxLength={500}
              className="min-h-20"
              placeholder="Ex : rien de contraire aux règles du site"
            />
          )}
        </Field>
      </ActionForm>
    </Disclosure>
  );
}
