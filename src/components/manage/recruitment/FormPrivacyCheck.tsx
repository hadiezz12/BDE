import { getFormPrivacyCheck } from "@/lib/privacy/data";
import { FORM_SENSITIVE_TERM } from "@/lib/privacy/labels";
import { recordFormPrivacyReview } from "@/app/actions/privacy";
import { Field, Textarea } from "@/components/ui/Field";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Notice } from "@/components/manage/governance/Notices";

/**
 * The form builder's privacy check (Phase 14), above the questions and the
 * publication: what the draft asks that is sensitive (the database's own
 * word list, private.form_sensitive_terms), the reminder to ask only what
 * the recruitment needs, and — when something is flagged — the
 * justification without which the database refuses to publish. The officer
 * in charge of personal data is told of every justification.
 */
export async function FormPrivacyCheck({ campaignId, asso, writable }: { campaignId: string; asso: string; writable: boolean }) {
  const read = await getFormPrivacyCheck(campaignId);
  if (!read.ok || !read.data.draft) return null;
  const { flagged, reviewed, justification } = read.data;
  if (flagged.length === 0) {
    return (
      <Notice tone="info" icon="shield" title="Ne demande que ce qui sert ce recrutement">
        <p>
          Pas de question sur la santé, la religion, les opinions, l&apos;origine ou la vie privée, pas de pièce d&apos;identité, de date de
          naissance, d&apos;adresse ou de téléphone sans vraie nécessité : le compte de l&apos;école suffit pour joindre les candidat·es.
        </p>
      </Notice>
    );
  }
  return (
    <Notice
      tone={reviewed ? "info" : "warn"}
      icon="shield"
      title={reviewed ? "Questions sensibles justifiées" : "Ce brouillon pose des questions sensibles"}
    >
      <p>Thèmes repérés : {flagged.map((t) => FORM_SENSITIVE_TERM[t] ?? t).join(", ")}.</p>
      {reviewed ? (
        <p className="mt-2">Justification enregistrée : « {justification} ». La publication est possible.</p>
      ) : (
        <>
          <p className="mt-2">
            Retire ces questions si elles ne sont pas indispensables. Sinon, explique pourquoi chacune est nécessaire : la publication
            est bloquée sans cette explication, et la personne chargée des données en est informée.
          </p>
          {writable && (
            <div className="mt-3">
              <ActionForm action={recordFormPrivacyReview} hidden={{ campaign_id: campaignId, asso }} submitLabel="Enregistrer la justification" variant="secondary" size="sm">
                <Field label="Pourquoi ces questions sont nécessaires">
                  {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="justification" rows={3} required minLength={20} maxLength={1000} />}
                </Field>
              </ActionForm>
            </div>
          )}
        </>
      )}
    </Notice>
  );
}
