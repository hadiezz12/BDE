import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getRecruitmentEditor } from "@/lib/recruitment/editor";
import { EMPTY_FORM } from "@/lib/recruitment/form";
import {
  STAGE_LABEL,
  STAGE_TONE,
  WIZARD_STEPS,
  campaignChecklist,
  campaignStage,
  recruitmentDoneMessage,
  type WizardStep,
} from "@/lib/recruitment/desk";
import { instantToParisLocal } from "@/lib/posts/schedule";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { DoneNotice, MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { DerouleStep, InfosStep, ReglesStep, type StepBase } from "@/components/manage/recruitment/CampaignSteps";
import { PositionsEditor } from "@/components/manage/recruitment/PositionsEditor";
import { FormBuilder } from "@/components/manage/recruitment/FormBuilder";
import { CampaignPublication } from "@/components/manage/recruitment/CampaignPublication";

type Params = Promise<{ asso: string; campaign: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const local = (iso: string | null) => (iso ? instantToParisLocal(iso) : { date: "", time: "" });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { campaign } = await params;
  if (!UUID.test(campaign)) return { title: "Recrutement introuvable" };
  const editor = await getRecruitmentEditor(campaign.toLowerCase());
  if (!editor.ok) return { title: "Recrutement" };
  return { title: editor.data.campaign.title.trim() || "Recrutement sans titre" };
}

/**
 * /manage/[asso]/recruitment/[campaign] — one campaign in the wizard
 * (?etape= infos, deroule, postes, formulaire, regles, apercu, publication).
 * public.recruitment_editor decides who may read it (recruitment.* in its
 * own association) and returns counts only; a campaign of another
 * association opens in its own workspace. Each step saves through its own
 * database function, which checks the right, the version and every rule.
 */
export default async function CampaignWizardPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso, campaign: campaignId } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("recruitment", ctx.membership.permissions)) return <SectionDenied section="recruitment" ctx={ctx} />;
  if (!UUID.test(campaignId)) return <Unavailable asso={asso} message={governanceErrorMessage("campaign_not_found")} />;

  const editor = await getRecruitmentEditor(campaignId.toLowerCase());
  if (!editor.ok) return <Unavailable asso={asso} message={governanceErrorMessage(editor.code)} />;
  const data = editor.data;
  if (data.organization.slug !== asso) redirect(routes.manageCampaign(data.organization.slug, data.campaign.id));

  const now = new Date();
  const { campaign, summary, can, positions } = data;
  const rawStep = first(sp.etape);
  const step: WizardStep = WIZARD_STEPS.some((s) => s.key === rawStep) ? (rawStep as WizardStep) : "infos";
  const readOnly = readOnlyReason(ctx);
  const cancelled = campaign.status === "cancelled";
  const writable = !readOnly && !cancelled;
  const editable = can.manage && writable;
  const published = Boolean(campaign.first_published_at);
  const stage = campaignStage(summary);
  const short = data.organization.short_name ?? data.organization.name;
  const done = recruitmentDoneMessage(first(sp.fait));
  const base: StepBase = { campaignId: campaign.id, asso, version: campaign.version, disabled: !editable };
  const formSchema = data.form.draft?.schema ?? data.form.live?.schema ?? EMPTY_FORM;
  const checklist = campaignChecklist({ ...campaign, positions, form: formSchema }, now);
  const live = positions.filter((p) => !p.retired_at);

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={
          <Link href={routes.manageRecruitment(asso)} className="inline-flex items-center gap-1.5 hover:underline">
            <Icon name="arrow-left" size={14} />
            Recrutement de {short}
          </Link>
        }
        title={campaign.title.trim() || "Sans titre"}
        meta={
          <>
            <StatusBadge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</StatusBadge>
            {published && <span>{plural(summary.submitted, "candidature envoyée", "candidatures envoyées")}</span>}
          </>
        }
        actions={
          <>
            <ButtonLink href={routes.campaignPreview(campaign.id)} variant="secondary" icon="eye" iconPosition="start">
              Aperçu
            </ButtonLink>
            {summary.is_public && campaign.slug && (
              <ButtonLink href={routes.campaign(campaign.slug)} variant="ghost" icon="arrow-up-right">
                En ligne
              </ButtonLink>
            )}
          </>
        }
      />

      <DoneNotice message={done} />

      {(readOnly || summary.hidden || cancelled || (can.publish && ctx.aal !== "aal2" && !readOnly)) && (
        <div className="flex flex-col gap-3">
          {readOnly && <ReadOnlyNotice reason={readOnly} />}
          {summary.hidden && (
            <Notice tone="danger" icon="eye" title="Masqué par la modération du BDE">
              <p>
                Il n&apos;apparaît plus sur le site et ne prend plus de candidature ; celles déjà envoyées sont gardées. Raison donnée
                par le BDE&nbsp;: {summary.hidden.reason}
              </p>
            </Notice>
          )}
          {cancelled && (
            <Notice tone="danger" icon="close" title="Recrutement annulé">
              <p>
                Sa fiche reste lisible avec la mention «&nbsp;Annulé&nbsp;»{campaign.cancellation_reason ? ` et la raison : ${campaign.cancellation_reason}` : ""}.
                Il ne se modifie plus.
              </p>
            </Notice>
          )}
          {can.publish && ctx.aal !== "aal2" && !readOnly && <MfaNotice what="Publier, mettre en pause, clôturer ou annuler un recrutement" />}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Étapes du recrutement" className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0">
          <ol className="flex min-w-max gap-1 border-b border-line lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:min-w-0 lg:flex-col lg:border-b-0 lg:border-l">
            {WIZARD_STEPS.map((s, i) => {
              const items = checklist.filter((c) => c.step === s.key && c.required);
              const ok = items.length > 0 && items.every((c) => c.ok);
              const todo = items.some((c) => !c.ok);
              const active = s.key === step;
              return (
                <li key={s.key}>
                  <Link
                    href={routes.manageCampaign(asso, campaign.id, s.key)}
                    aria-current={active ? "step" : undefined}
                    className={cx(
                      "relative flex min-h-11 items-center gap-2.5 whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors lg:-ml-px lg:border-l-[3px] lg:border-transparent",
                      active ? "text-fg lg:border-assoc" : "text-muted hover:text-fg",
                    )}
                  >
                    <span className="type-meta text-[0.75rem] text-subtle">{i + 1}</span>
                    {s.label}
                    {ok && <Icon name="check" size={14} strokeWidth={2.5} className="text-ok" aria-label="complet" />}
                    {todo && <span className="size-1.5 rounded-full bg-warn" aria-label="à compléter" role="img" />}
                    <span aria-hidden className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc lg:hidden", active ? "opacity-100" : "opacity-0")} />
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 max-w-3xl">
          {!can.manage && step !== "formulaire" && step !== "apercu" && step !== "publication" && !readOnly && (
            <Notice tone="info" icon="lock" title="Lecture seule pour toi" className="mb-6">
              <p>Modifier le recrutement demande le droit «&nbsp;Préparer les recrutements&nbsp;».</p>
            </Notice>
          )}
          {step === "infos" && (
            <InfosStep
              base={base}
              values={{
                title: campaign.title,
                summary: campaign.summary ?? "",
                description: campaign.description ?? "",
                academic_year: campaign.academic_year ?? "",
                cover_media_id: campaign.cover_media_id ?? "",
              }}
              media={data.media}
              canUpload={editable}
            />
          )}
          {step === "deroule" && (
            <DerouleStep
              base={base}
              values={{
                process: campaign.process ?? [],
                faq: campaign.faq ?? [],
                contact_name: campaign.contact_name ?? "",
                contact_role: campaign.contact_role ?? "",
                contact_email: campaign.contact_email ?? "",
              }}
            />
          )}
          {step === "postes" && (
            <PositionsEditor
              campaignId={campaign.id}
              asso={asso}
              positions={positions}
              campaign={{ opensAt: campaign.opens_at, closesAt: campaign.closes_at }}
              templates={data.templates}
              disabled={!editable}
              published={published}
              canPublish={can.publish}
              openId={first(sp.poste)}
            />
          )}
          {step === "formulaire" && (
            <FormBuilder
              campaignId={campaign.id}
              asso={asso}
              schema={formSchema}
              editVersion={data.form.draft?.edit_version ?? 0}
              draftNumber={data.form.draft?.number ?? null}
              live={data.form.live ? { number: data.form.live.number, publishedAt: data.form.live.published_at } : null}
              positions={live.map((p) => ({ id: p.id, title: p.title }))}
              editable={can.questions && writable}
              canPublishVersion={can.publish && writable && ctx.aal === "aal2"}
              firstPublished={published}
              hasDraft={Boolean(data.form.draft)}
            />
          )}
          {step === "regles" && (
            <ReglesStep
              base={base}
              values={{
                opens: local(campaign.opens_at),
                closes: local(campaign.closes_at),
                closes_was: campaign.closes_at ?? "",
                max_applications: campaign.max_applications,
                eligible_years: campaign.eligible_years,
                eligibility_note: campaign.eligibility_note ?? "",
              }}
              published={published}
              canChangeLive={can.publish}
            />
          )}
          {step === "apercu" && (
            <div className="flex flex-col gap-8">
              <section aria-labelledby="pret" className="flex flex-col gap-3">
                <h2 id="pret" className="type-label text-muted">
                  Avant de publier
                </h2>
                <ul className="flex flex-col border-y border-line">
                  {checklist.map((c) => (
                    <li key={c.label} className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
                      <span className="inline-flex items-center gap-2.5">
                        {c.ok ? (
                          <Icon name="check" size={16} strokeWidth={2.5} className="text-ok" />
                        ) : (
                          <Icon name={c.required ? "alert" : "info"} size={16} className={c.required ? "text-warn" : "text-subtle"} />
                        )}
                        <span className={cx("type-small", c.ok && "text-muted")}>{c.label}</span>
                        <span className="sr-only">{c.ok ? " : fait" : c.required ? " : à faire" : " : conseillé"}</span>
                      </span>
                      {!c.ok && (
                        <Link href={routes.manageCampaign(asso, campaign.id, c.step)} className="link type-small font-bold">
                          Compléter
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="apercu-titre" className="flex flex-col gap-4">
                <h2 id="apercu-titre" className="type-label text-muted">
                  Tel que les étudiant·es le verront
                </h2>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={routes.campaignPreview(campaign.id)} variant="secondary" icon="eye" iconPosition="start">
                    La fiche
                  </ButtonLink>
                  {live.map((p) => (
                    <ButtonLink key={p.id} href={routes.campaignPreview(campaign.id, p.id)} variant="ghost" icon="arrow-up-right">
                      Formulaire · {p.title}
                    </ButtonLink>
                  ))}
                </div>
                <p className="type-small text-muted">
                  L&apos;aperçu du formulaire montre la version en préparation, sans rien enregistrer : il ne crée aucune candidature.
                </p>
                <iframe
                  src={`${routes.campaignPreview(campaign.id)}?cadre=1`}
                  title={`Aperçu de « ${campaign.title || "le recrutement"} » sur téléphone`}
                  className="h-[720px] max-h-[75dvh] w-[390px] max-w-full self-center rounded-[2rem] border-[10px] border-fg bg-bg lg:self-start"
                />
              </section>
              <div>
                <ButtonLink href={routes.manageCampaign(asso, campaign.id, "publication")} icon="arrow-right">
                  Passer à la publication
                </ButtonLink>
              </div>
            </div>
          )}
          {step === "publication" && <CampaignPublication data={data} asso={asso} checklist={checklist} writable={writable} now={now} />}
        </div>
      </div>
    </div>
  );
}

/** The campaign cannot be opened (deleted draft, wrong link, another association's): says so, nothing about it. */
function Unavailable({ asso, message }: { asso: string; message: string }) {
  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader title="Recrutement" />
      <ManageEmpty
        as="h2"
        icon="lock"
        title="Ce recrutement ne s'ouvre pas ici"
        actions={
          <ButtonLink href={routes.manageRecruitment(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
            Recrutement
          </ButtonLink>
        }
      >
        <p>{message}</p>
      </ManageEmpty>
    </div>
  );
}
