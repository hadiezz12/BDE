import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDayShort, formatTime, plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getRecruitmentDashboard, type CampaignSummary, type RecruitmentRights } from "@/lib/recruitment/editor";
import { STAGE_LABEL, STAGE_TONE, campaignStage, recruitmentDoneMessage } from "@/lib/recruitment/desk";
import { duplicateCampaign } from "@/app/actions/recruitment";
import { ButtonLink } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenSection } from "@/components/manage/sections";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { DoneNotice, MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "Recrutement" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const when = (iso: string | null) => (iso ? `${formatDayShort(iso)} ${formatTime(iso)}` : "—");

/**
 * /manage/[asso]/recruitment — the association's recruitment desk: its
 * campaigns, where each stands, its dates, positions and the number of
 * applications sent. public.recruitment_dashboard checks the right
 * (recruitment.campaigns.manage, .questions.manage or .publish in this
 * association) and returns counts only: never a candidate, an answer, a
 * draft or a file. Reading applications comes with the review phase.
 */
export default async function RecruitmentDeskPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("recruitment", ctx.membership.permissions)) return <SectionDenied section="recruitment" ctx={ctx} />;
  const dashboard = await getRecruitmentDashboard(ctx.organization.id);
  if (!dashboard.ok) return <SectionDenied section="recruitment" ctx={ctx} code={dashboard.code} />;

  const { organization, can, campaigns } = dashboard.data;
  const short = organization.short_name ?? organization.name;
  const readOnly = readOnlyReason(ctx);
  const writable = !readOnly;
  const needsMfa = writable && ctx.aal !== "aal2" && can.publish;
  const done = recruitmentDoneMessage(first(sp.fait));
  const current = campaigns.filter((c) => !c.archived_at);
  const archived = campaigns.filter((c) => c.archived_at);
  const hidden = campaigns.filter((c) => c.hidden);
  const submitted = campaigns.reduce((n, c) => n + c.submitted, 0);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={short}
        title="Recrutement"
        description={
          <p>
            Les recrutements de {organization.name} : la fiche, les postes, le formulaire, les dates. Un brouillon reste privé
            jusqu&apos;à sa publication.
          </p>
        }
        meta={
          campaigns.length > 0 ? (
            <>
              <span>{plural(campaigns.length, "recrutement")}</span>
              <span>{plural(submitted, "candidature envoyée", "candidatures envoyées")}</span>
            </>
          ) : undefined
        }
        actions={
          can.manage && writable ? (
            <ButtonLink href={routes.manageRecruitmentNew(asso)} icon="plus" iconPosition="start">
              Nouveau recrutement
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3">
        <DoneNotice message={done} />
        {readOnly && <ReadOnlyNotice reason={readOnly} />}
        {needsMfa && <MfaNotice what="Publier, mettre en pause, clôturer ou annuler un recrutement" />}
        {!organization.page_public && organization.status !== "suspended" && organization.status !== "archived" && (
          <Notice tone="info" icon="globe" title="La page publique de l'asso n'est pas en ligne : ses recrutements non plus">
            <p>
              Tu peux déjà préparer un recrutement. Il ne pourra être publié qu&apos;une fois{" "}
              {organization.status === "setup" ? "l'asso rendue active par le BDE et sa page publiée" : "la page publiée"}.
            </p>
          </Notice>
        )}
        <Notice tone="info" icon="lock" title="Les candidatures restent privées pour l'instant">
          <p>
            Les candidatures envoyées sont enregistrées, avec leurs documents. Ici, tu vois combien il y en a, jamais qui ni quoi :
            la lecture des candidatures par les personnes que l&apos;asso désignera arrive avec le module de sélection.
          </p>
        </Notice>
      </div>

      {hidden.length > 0 && (
        <ManageSection title="À traiter" count={hidden.length}>
          <ul className="flex flex-col gap-3">
            {hidden.map((c) => (
              <li key={c.id}>
                <Notice
                  tone="danger"
                  icon="eye"
                  title={`« ${c.title} » est masqué par la modération du BDE`}
                  action={
                    <ButtonLink href={routes.manageCampaign(asso, c.id)} size="sm" variant="secondary" icon="arrow-right">
                      Ouvrir
                    </ButtonLink>
                  }
                >
                  <p>
                    Il n&apos;apparaît plus sur le site et ne prend plus de candidature ; celles déjà envoyées sont gardées.
                    Raison donnée&nbsp;: {c.hidden?.reason}
                  </p>
                </Notice>
              </li>
            ))}
          </ul>
        </ManageSection>
      )}

      {campaigns.length === 0 ? (
        <ManageEmpty
          as="h2"
          icon="megaphone"
          title="Pas encore de recrutement"
          actions={
            can.manage && writable ? (
              <ButtonLink href={routes.manageRecruitmentNew(asso)} icon="plus" iconPosition="start">
                Nouveau recrutement
              </ButtonLink>
            ) : undefined
          }
        >
          <p>
            Un recrutement se prépare en quelques étapes : la présentation, les postes, le formulaire, les dates. Tu le vérifies en
            aperçu, tel que les étudiant·es le verront, puis tu le publies.
          </p>
          {!can.manage && <p>Les postes qui ont le droit «&nbsp;Préparer les recrutements&nbsp;» les commencent.</p>}
        </ManageEmpty>
      ) : (
        <>
          <ManageSection title="Recrutements" count={current.length}>
            {current.length > 0 ? (
              <CampaignList campaigns={current} asso={asso} can={can} writable={writable} />
            ) : (
              <p className="type-small text-muted">Tous les recrutements sont archivés.</p>
            )}
          </ManageSection>
          {archived.length > 0 && (
            <ManageSection title="Archivés" count={archived.length}>
              <CampaignList campaigns={archived} asso={asso} can={can} writable={writable} />
            </ManageSection>
          )}
        </>
      )}
    </div>
  );
}

function CampaignList({
  campaigns,
  asso,
  can,
  writable,
}: {
  campaigns: CampaignSummary[];
  asso: string;
  can: RecruitmentRights;
  writable: boolean;
}) {
  return (
    <ul className="flex flex-col border-y border-line">
      {campaigns.map((c) => {
        const stage = campaignStage(c);
        return (
          <li key={c.id} className="grid gap-x-6 gap-y-3 border-b border-line py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <StatusBadge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</StatusBadge>
                {c.academic_year && <span className="type-meta text-muted">{c.academic_year.replace("-", "–")}</span>}
              </div>
              <h3 className="type-card break-words">
                <Link href={routes.manageCampaign(asso, c.id)} className="hover:text-assoc-text">
                  {c.title.trim() || "Sans titre"}
                </Link>
              </h3>
              <dl className="flex flex-wrap gap-x-6 gap-y-1 type-small text-muted">
                <div className="flex gap-1.5">
                  <dt>Ouverture</dt>
                  <dd className="font-semibold text-fg">{when(c.opens_at)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Date limite</dt>
                  <dd className="font-semibold text-fg">{when(c.closes_at)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Postes</dt>
                  <dd className="font-semibold text-fg">{c.positions}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Candidatures envoyées</dt>
                  <dd className="font-semibold text-fg">{c.submitted}</dd>
                </div>
                {c.withdrawn > 0 && (
                  <div className="flex gap-1.5">
                    <dt>Retirées</dt>
                    <dd className="font-semibold text-fg">{c.withdrawn}</dd>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <dt>Formulaire</dt>
                  <dd className="font-semibold text-fg">
                    {c.form.live ? `version ${c.form.live}` : "pas encore publié"}
                    {c.form.draft && c.form.live ? " · brouillon en cours" : ""}
                  </dd>
                </div>
              </dl>
              {c.blocker && stage === "brouillon" && (
                <p className="flex items-center gap-1.5 type-small text-muted">
                  <Icon name="info" size={14} className="shrink-0" />
                  Pas encore publiable : il reste des étapes à compléter.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-start gap-2 md:justify-end">
              <ButtonLink href={routes.manageCampaign(asso, c.id)} size="sm" variant="secondary" icon="arrow-right">
                Ouvrir
              </ButtonLink>
              <ButtonLink href={routes.campaignPreview(c.id)} size="sm" variant="ghost" icon="eye" iconPosition="start">
                Aperçu
              </ButtonLink>
              {c.is_public && c.slug && (
                <ButtonLink href={routes.campaign(c.slug)} size="sm" variant="ghost" icon="arrow-up-right">
                  En ligne
                </ButtonLink>
              )}
              {can.manage && writable && (
                <details className="group w-full md:w-auto">
                  <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-2 type-small font-bold hover:underline [&::-webkit-details-marker]:hidden">
                    <Icon name="copy" size={14} />
                    Dupliquer
                  </summary>
                  <ActionForm
                    action={duplicateCampaign}
                    hidden={{ campaign_id: c.id, organization_slug: asso }}
                    submitLabel="Créer la copie"
                    submitIcon="arrow-right"
                    size="sm"
                    className="mt-3 md:w-80"
                  >
                    <Field label="Titre de la copie" hint="Postes et formulaire repris ; dates et candidatures non.">
                      {({ id, describedBy }) => (
                        <Input id={id} aria-describedby={describedBy} name="title" maxLength={120} defaultValue={nextTitle(c.title)} required />
                      )}
                    </Field>
                  </ActionForm>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** "Recrutement 2027 (exemple)" → "Recrutement 2028 (exemple)": next year's title, as a suggestion. */
function nextTitle(title: string): string {
  const next = title.replace(/\b(20\d{2})\b/g, (y) => String(Number(y) + 1));
  return next !== title ? next : `${title} (copie)`;
}
