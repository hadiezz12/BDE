import Link from "next/link";
import type { RecruitmentEditor } from "@/lib/recruitment/editor";
import { STAGE_LABEL, campaignStage, type ChecklistItem } from "@/lib/recruitment/desk";
import { AUDIT_ACTION_LABEL } from "@/lib/governance/labels";
import { routes } from "@/lib/routes";
import { formatDayFull, formatTime, plural } from "@/lib/format";
import {
  archiveCampaign,
  cancelCampaign,
  changeCampaignSlug,
  deleteCampaignDraft,
  publishCampaign,
  setCampaignStatus,
  unpublishCampaign,
} from "@/app/actions/recruitment";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { Notice } from "@/components/manage/governance/Notices";

/** What stops a campaign from going online now, in words (private.recruitment_blocker). */
const BLOCKER_LABEL: Record<string, string> = {
  campaign_hidden: "il est masqué par la modération du BDE",
  campaign_cancelled: "il est annulé",
  organization_inactive: "l'asso n'est pas active (le BDE l'active)",
  page_not_public: "la page publique de l'asso n'est pas en ligne",
  campaign_incomplete: "il manque le titre, la phrase de présentation ou les dates",
  campaign_past: "la date limite est déjà passée",
  campaign_needs_position: "il n'a aucun poste",
  media_not_found: "son visuel n'est plus dans la médiathèque",
};

const dayAndTime = (iso: string) => `${formatDayFull(iso)} à ${formatTime(iso)}`;

/**
 * The wizard's last step: where the campaign stands, the one thing to do
 * next (publish, or what is missing first), then the rarer actions folded
 * behind their name — pause, close, reopen, take it off the site, change its
 * address, cancel it (irreversible, every candidate is told), archive,
 * delete a draft that was never online — its form versions and its history.
 * Every button is a database function that checks the right again
 * (recruitment.campaigns.publish and a second factor for what goes online).
 */
export function CampaignPublication({
  data,
  asso,
  checklist,
  writable,
  now,
}: {
  data: RecruitmentEditor;
  asso: string;
  checklist: ChecklistItem[];
  writable: boolean;
  now: Date;
}) {
  const { campaign, summary, can } = data;
  const stage = campaignStage(summary);
  const missing = checklist.filter((c) => c.required && !c.ok);
  const published = campaign.publication === "published";
  const cancelled = campaign.status === "cancelled";
  const hold = { campaign_id: campaign.id, organization_slug: asso };
  const open = summary.state === "open" || summary.state === "upcoming";
  const people = summary.submitted;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="statut" className="flex flex-col gap-4">
        <h2 id="statut" className="type-label text-muted">
          Où il en est
        </h2>
        <p className="type-headline text-[1.6rem]">{STAGE_LABEL[stage]}</p>
        <p className="type-small text-muted">
          {plural(summary.submitted, "candidature envoyée", "candidatures envoyées")}
          {summary.withdrawn > 0 ? ` · ${plural(summary.withdrawn, "retirée", "retirées")}` : ""}. Les brouillons des étudiant·es
          ne sont ni montrés ni comptés.
        </p>
        {summary.is_public && campaign.slug && (
          <p className="flex flex-wrap items-center gap-2 type-small">
            <Icon name="globe" size={15} className="text-muted" />
            En ligne à l&apos;adresse{" "}
            <Link href={routes.campaign(campaign.slug)} className="link font-mono text-[0.85rem]">
              {routes.campaign(campaign.slug)}
            </Link>
          </p>
        )}
      </section>

      {writable && can.publish && !published && !cancelled && (
        <section aria-labelledby="publier" className="flex flex-col gap-4">
          <h2 id="publier" className="type-title text-[1.5rem]">
            {campaign.first_published_at ? "Remettre en ligne" : "Publier"}
          </h2>
          {missing.length > 0 ? (
            <Notice tone="info" icon="info" title="Encore quelques éléments avant de publier">
              <ul className="mt-1 flex flex-col gap-1">
                {missing.map((m) => (
                  <li key={m.label}>
                    <Link href={routes.manageCampaign(asso, campaign.id, m.step)} className="link">
                      {m.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Notice>
          ) : summary.blocker ? (
            <Notice tone="warn" icon="alert" title={`Publication impossible pour l'instant : ${BLOCKER_LABEL[summary.blocker] ?? summary.blocker}.`} />
          ) : (
            <ActionForm
              action={publishCampaign}
              hidden={hold}
              submitLabel={campaign.first_published_at ? "Remettre en ligne" : "Publier le recrutement"}
              submitIcon="arrow-right"
            >
              <p className="max-w-2xl type-small text-muted">
                La fiche paraît dans les recrutements et sur la page de l&apos;asso ; les candidatures ouvrent à la date prévue.
                {!campaign.first_published_at &&
                  " Le formulaire part avec elle : sa version 1 est figée. Son adresse est fixée à partir du titre."}
              </p>
            </ActionForm>
          )}
        </section>
      )}

      {writable && !can.publish && !published && !cancelled && (
        <Notice tone="info" icon="lock" title="La publication revient à un autre poste">
          <p>
            Les postes qui ont le droit «&nbsp;Publier les recrutements&nbsp;» le mettent en ligne. Préviens-les quand il est prêt :
            ils le verront sur le bureau des recrutements.
          </p>
        </Notice>
      )}

      {writable && can.publish && published && !cancelled && (
        <section aria-labelledby="plus" className="flex flex-col gap-3">
          <h2 id="plus" className="type-label text-muted">
            Pendant le recrutement
          </h2>
          {campaign.status === "scheduled" && open && (
            <div className="flex flex-wrap gap-3">
              <ActionForm action={setCampaignStatus} hidden={{ ...hold, status: "paused" }} submitLabel="Mettre en pause" variant="secondary" size="sm" inline />
              <ActionForm action={setCampaignStatus} hidden={{ ...hold, status: "closed" }} submitLabel="Clôturer maintenant" variant="secondary" size="sm" inline />
            </div>
          )}
          {campaign.status === "paused" && (
            <ActionForm action={setCampaignStatus} hidden={{ ...hold, status: "scheduled" }} submitLabel="Rouvrir" submitIcon="arrow-right" size="sm">
              <p className="type-small text-muted">Les dates décident de nouveau : il rouvre s&apos;il est avant sa date limite.</p>
            </ActionForm>
          )}
          {campaign.status === "closed" && campaign.closes_at && Date.parse(campaign.closes_at) > now.getTime() && (
            <ActionForm action={setCampaignStatus} hidden={{ ...hold, status: "scheduled" }} submitLabel="Rouvrir jusqu'à la date limite" size="sm" variant="secondary" />
          )}
          {campaign.slug && (
            <Disclosure summary="Changer l'adresse" icon="link">
              <ActionForm action={changeCampaignSlug} hidden={hold} submitLabel="Changer l'adresse" variant="secondary">
                <Field label="Nouvelle adresse" hint="Minuscules, chiffres et tirets. L'ancienne redirige vers la nouvelle.">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="slug" defaultValue={campaign.slug ?? ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} required />
                  )}
                </Field>
              </ActionForm>
            </Disclosure>
          )}
          <Disclosure summary="Retirer du site" icon="eye">
            {people > 0 || summary.withdrawn > 0 ? (
              <p className="max-w-2xl type-small text-muted">
                Plus possible : des candidatures ont été envoyées. Mets-le en pause, clôture-le ou annule-le, pour que chaque
                candidat·e garde une fiche à relire.
              </p>
            ) : (
              <ActionForm action={unpublishCampaign} hidden={hold} submitLabel="Retirer du site" variant="secondary">
                <p className="max-w-2xl type-small text-muted">
                  La fiche disparaît du site ; tu pourras la remettre en ligne. Les brouillons des étudiant·es ne peuvent plus être
                  envoyés d&apos;ici là.
                </p>
                <Field label="Raison (pour l'historique)" optional>
                  {({ id }) => <Input id={id} name="reason" maxLength={500} />}
                </Field>
              </ActionForm>
            )}
          </Disclosure>
          <Disclosure summary="Annuler le recrutement" icon="close" tone="danger">
            <ActionForm action={cancelCampaign} hidden={hold} submitLabel="Annuler le recrutement" variant="danger">
              <p className="max-w-2xl type-small">
                <strong>Irréversible.</strong> La fiche reste en ligne avec la mention «&nbsp;Annulé&nbsp;» et ta raison ; plus personne
                ne peut candidater, et chaque personne qui a une candidature (envoyée ou en brouillon) est prévenue. Les candidatures
                sont gardées.
              </p>
              <Field label="Raison, lue par les candidat·es" hint="Ex : le bureau a changé d'organisation, report à une date à fixer…">
                {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={3} maxLength={500} required minLength={3} />}
              </Field>
            </ActionForm>
          </Disclosure>
        </section>
      )}

      {writable && can.manage && (stage === "cloture" || stage === "annule" || stage === "retire" || stage === "archive") && (
        <ActionForm
          action={archiveCampaign}
          hidden={{ campaign_id: campaign.id, archived: campaign.archived_at ? "0" : "1" }}
          submitLabel={campaign.archived_at ? "Sortir des archives" : "Archiver"}
          variant="secondary"
          size="sm"
        >
          <p className="type-small text-muted">
            {campaign.archived_at
              ? "Il revient dans la liste des recrutements de l'asso."
              : "Il quitte la liste des recrutements en cours de l'asso. Sa fiche reste lisible à son adresse, ses candidatures sont gardées."}
          </p>
        </ActionForm>
      )}

      {writable && can.manage && !campaign.first_published_at && (
        <Disclosure summary="Supprimer le brouillon" icon="close" tone="danger">
          <ActionForm action={deleteCampaignDraft} hidden={hold} submitLabel="Supprimer définitivement" variant="danger">
            <p className="max-w-2xl type-small">
              Il n&apos;a jamais été en ligne : il est supprimé pour de bon, avec ses postes et son formulaire.
            </p>
          </ActionForm>
        </Disclosure>
      )}

      <section aria-labelledby="versions" className="flex flex-col gap-4">
        <h2 id="versions" className="type-label text-muted">
          Versions du formulaire
        </h2>
        {data.form.versions.length > 0 ? (
          <ol className="flex flex-col border-y border-line">
            {data.form.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3 last:border-b-0">
                <span className="font-semibold">
                  Version {v.number}
                  <span className="ml-2 type-meta font-normal text-muted">
                    {v.status === "draft" ? "brouillon" : v.status === "published" ? "en ligne" : "remplacée"}
                  </span>
                </span>
                <span className="type-meta text-muted">
                  {v.published_at ? `publiée le ${dayAndTime(v.published_at)}` : "pas publiée"} ·{" "}
                  {plural(v.submitted, "candidature", "candidatures")}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="type-small text-muted">Pas encore de version.</p>
        )}
      </section>

      <section aria-labelledby="historique" className="flex flex-col gap-4">
        <h2 id="historique" className="type-label text-muted">
          Historique
        </h2>
        <p className="max-w-2xl type-small text-subtle">
          Commencé par {summary.created_by_name ?? "un membre de l'asso"}. À partir de la première publication, chaque changement est
          gardé ici, avec qui l&apos;a fait. Les démarches des candidat·es n&apos;y figurent pas.
        </p>
        {data.history.length > 0 ? (
          <ol className="flex flex-col border-y border-line">
            {data.history.map((h, i) => (
              <li key={`${h.occurred_at}-${i}`} className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0">
                <span className="type-meta text-muted">{dayAndTime(h.occurred_at)}</span>
                <span className="type-small">
                  <strong>{h.actor_name ?? "Le système"}</strong> {AUDIT_ACTION_LABEL[h.action] ?? h.action}
                </span>
                {h.reason && <span className="type-small text-muted">Raison : {h.reason}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="type-small text-muted">Rien encore : l&apos;historique commence à la première publication.</p>
        )}
      </section>
    </div>
  );
}
