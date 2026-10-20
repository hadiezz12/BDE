import { routes } from "@/lib/routes";
import type { AssociationEditor, MyPublicProfile } from "@/lib/associations/editor";
import { saveMyPublicProfile } from "@/app/actions/association-page";
import { ButtonLink } from "@/components/ui/Button";
import { Checkbox, Field, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { editorCompleteness, pageState } from "./PageStatus";

/** Workspace home: where the public page stands, and the next useful step. */
export function PageCard({ editor: e }: { editor: AssociationEditor }) {
  const asso = e.organization.slug;
  const state = pageState(e);
  const { percent, publishable } = editorCompleteness(e);
  const neverPublished = e.page.published_revision === null;
  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        <span className="type-meta text-subtle">Complète à {percent} %</span>
      </div>
      <div
        role="progressbar"
        aria-label="Complétude de la page"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-sunken"
      >
        <span className="block h-full rounded-full bg-assoc" style={{ width: `${percent}%` }} />
      </div>
      <p className="type-small text-muted">
        {state.detail}
        {neverPublished && !publishable && " Il manque encore l'essentiel pour la publier."}
      </p>
      <div className="flex flex-wrap gap-2">
        {neverPublished && e.can.edit ? (
          <ButtonLink href={routes.manageSetup(asso)} size="sm" icon="arrow-right">
            Démarrer la page
          </ButtonLink>
        ) : e.can.edit || e.can.publish ? (
          <ButtonLink href={routes.manageSettings(asso)} size="sm" icon="edit" iconPosition="start">
            Modifier la page
          </ButtonLink>
        ) : (
          <ButtonLink href={routes.manageMedia(asso)} size="sm" icon="image" iconPosition="start">
            Médiathèque
          </ButtonLink>
        )}
        {(e.can.edit || e.can.publish) && (
          <ButtonLink href={routes.associationPreview(asso)} size="sm" variant="secondary" icon="eye" iconPosition="start">
            Aperçu
          </ButtonLink>
        )}
        {e.page.is_public && (
          <ButtonLink href={routes.association(asso)} size="sm" variant="ghost" icon="arrow-up-right">
            En ligne
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

/**
 * Each member's own say on the public team section: appear or not, with
 * their account photo or initials, and one line about them. Only they can
 * change it (public.set_my_public_team_profile); the page editors can hide
 * someone, never show someone who said no. Saved immediately, no
 * publication needed: it is consent, not page content.
 */
export function MyPublicProfileCard({
  membershipId,
  profile,
  holdsPosition,
  hasPhoto,
}: {
  membershipId: string;
  profile: MyPublicProfile;
  holdsPosition: boolean;
  hasPhoto: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
      <p className="type-small text-muted">
        {holdsPosition
          ? "Tu occupes un poste : tu peux apparaître dans l'équipe sur la page publique de l'asso. C'est toi qui décides."
          : "Tu n'occupes pas de poste en ce moment : tu n'apparais pas sur la page publique, quel que soit ce réglage. Il s'appliquera si un poste t'est attribué."}
      </p>
      <ActionForm
        action={saveMyPublicProfile}
        hidden={{ membership_id: membershipId }}
        submitLabel="Enregistrer mes choix"
        size="sm"
      >
        <Checkbox
          name="visible"
          defaultChecked={!profile.hidden}
          label="M'afficher dans l'équipe"
          description="Ton nom et ton titre. Décoche pour ne pas apparaître du tout."
        />
        <Checkbox
          name="show_photo"
          defaultChecked={profile.show_photo}
          label="Montrer ma photo de profil"
          description={
            hasPhoto
              ? "La photo de ton compte, recadrée en carré. Sinon, tes initiales."
              : "Tu n'as pas de photo de profil : tes initiales s'affichent. Tu peux en ajouter une dans ton profil."
          }
        />
        <Field label="Une ligne sur toi" optional hint="Publique, 280 caractères au plus. Ex : en master finance, je gère les partenariats.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              name="bio"
              maxLength={280}
              defaultValue={profile.bio ?? ""}
              rows={3}
              className="min-h-20"
            />
          )}
        </Field>
      </ActionForm>
    </div>
  );
}
