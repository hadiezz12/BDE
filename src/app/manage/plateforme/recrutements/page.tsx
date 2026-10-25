import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { CAMPAIGN_STATUS_LABEL, formatDayShort, plural } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getPlatformRecruitment, type PlatformCampaign } from "@/lib/recruitment/editor";
import { getRecruitmentPrivacy } from "@/lib/data/recruitment";
import { campaignStatus, retentionLines, retentionUndecided } from "@/lib/recruitment/model";
import { organizationRef } from "@/lib/posts/model";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { hideCampaign, restoreCampaign, setRecruitmentSettings } from "@/app/actions/recruitment";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "Recrutements" };

const VIEWS = [
  { key: "en-cours", label: "En cours", rpc: "current" },
  { key: "passes", label: "Passés", rpc: "past" },
  { key: "masques", label: "Masqués", rpc: "hidden" },
] as const;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /manage/plateforme/recrutements — the site's recruitment for the BDE.
 *  - platform.content.moderate: the campaigns associations published
 *    (public information and counts only: platform_recruitment never returns
 *    a candidate, an answer or a file); hide one that breaks the rules, or
 *    restore it, with a reason the association reads. Hiding is not
 *    cancelling: applications already sent are kept.
 *  - platform.organizations.manage: the privacy notice candidates read
 *    before sending, the contact for their questions, and how long
 *    applications are kept (empty = not decided: nothing is erased).
 * Both need the second factor and are recorded in the audit.
 */
export default async function PlatformRecruitmentPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  const canModerate = hasPlatform(access, "platform.content.moderate");
  const canSettings = hasPlatform(access, "platform.organizations.manage");
  if (!canModerate && !canSettings) return <PlatformDenied title="Recrutements" right="Modérer les contenus" />;

  const viewKey = VIEWS.find((v) => v.key === first(sp.vue))?.key ?? "en-cours";
  const view = VIEWS.find((v) => v.key === viewKey)!;
  const q = (first(sp.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const [list, privacy] = await Promise.all([
    canModerate ? getPlatformRecruitment(q || null, view.rpc) : Promise.resolve(null),
    getRecruitmentPrivacy(),
  ]);
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const href = (key: string) => {
    const p = new URLSearchParams();
    if (key !== "en-cours") p.set("vue", key);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `${routes.managePlatformRecruitment}?${qs}` : routes.managePlatformRecruitment;
  };

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Recrutements"
        description={
          <p>
            Les recrutements publiés par les assos, tels que tout le monde les voit, et leurs nombres de candidatures. Le BDE ne voit
            ni les candidat·es, ni leurs réponses, ni leurs documents, et ne modifie jamais le recrutement d&apos;une asso.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="Masquer ou rétablir un recrutement, modifier la notice ou les durées de conservation" />}

      {canSettings && (
        <ManageSection title="Données des candidat·es">
          {retentionUndecided(privacy) && (
            <Notice tone="warn" icon="alert" title="Durées de conservation à décider">
              <p>
                Tant qu&apos;une durée n&apos;est pas fixée, rien n&apos;est effacé automatiquement. La décision revient au BDE (et à
                l&apos;école si elle le demande) : le site applique ce qui est enregistré ici, chaque nuit.
              </p>
            </Notice>
          )}
          <ActionForm action={setRecruitmentSettings} submitLabel="Enregistrer" className="max-w-3xl">
            <Field
              label="Notice de confidentialité"
              optional
              hint="Lue par chaque candidat·e avant l'envoi, sur le formulaire. Qui reçoit la candidature, pourquoi, combien de temps, à qui écrire. 6 000 caractères au plus."
            >
              {({ id, describedBy }) => (
                <Textarea id={id} aria-describedby={describedBy} name="privacy_notice" rows={10} maxLength={6000} defaultValue={privacy.notice ?? ""} />
              )}
            </Field>
            <Field label="Contact pour les questions sur les données" optional hint="Une adresse du BDE, de préférence.">
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} name="privacy_contact" maxLength={254} defaultValue={privacy.contact ?? ""} autoComplete="off" />
              )}
            </Field>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-[0.95rem] font-bold">Durées de conservation (en mois, vide = pas encore décidée)</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <MonthsField name="submitted_months" label="Envoyées, après la clôture" value={privacy.submitted_months} />
                <MonthsField name="withdrawn_months" label="Retirées, après le retrait" value={privacy.withdrawn_months} />
                <MonthsField name="draft_months" label="Brouillons, après la clôture" value={privacy.draft_months} />
              </div>
              <ul className="flex flex-col gap-1 type-small text-muted">
                {retentionLines(privacy).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </fieldset>
          </ActionForm>
        </ManageSection>
      )}

      {canModerate && list && (
        <ManageSection title="Les recrutements publiés">
          <div className="flex flex-col gap-4">
            <nav aria-label="Vues" className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:px-0">
              <ul className="flex min-w-max gap-1 border-b border-line">
                {VIEWS.map((v) => {
                  const active = v.key === viewKey;
                  return (
                    <li key={v.key}>
                      <Link
                        href={href(v.key)}
                        scroll={false}
                        aria-current={active ? "true" : undefined}
                        className={cx(
                          "relative flex min-h-11 items-center whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors",
                          active ? "text-fg" : "text-muted hover:text-fg",
                        )}
                      >
                        {v.label}
                        <span aria-hidden className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc", active ? "opacity-100" : "opacity-0")} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <Form action={routes.managePlatformRecruitment} role="search" className="flex max-w-xl items-stretch gap-2">
              {viewKey !== "en-cours" && <input type="hidden" name="vue" value={viewKey} />}
              <label htmlFor="rec-q" className="sr-only">
                Chercher un recrutement
              </label>
              <Input key={q} id="rec-q" name="q" type="search" defaultValue={q} placeholder="Titre ou asso" autoComplete="off" maxLength={80} className="min-w-0 flex-1" />
              <Button type="submit" variant="secondary" icon="search">
                <span className="max-sm:sr-only">Chercher</span>
              </Button>
            </Form>
          </div>
          {!list.ok ? (
            <Notice tone="danger" icon="alert" title="La liste n'a pas pu être chargée.">
              <p>{governanceErrorMessage(list.code)}</p>
            </Notice>
          ) : list.data.length === 0 ? (
            <ManageEmpty icon="megaphone" title={q ? "Aucun recrutement ne correspond" : viewKey === "masques" ? "Aucun recrutement masqué" : "Aucun recrutement ici"}>
              <p>Seuls les recrutements déjà publiés par une asso apparaissent ici.</p>
            </ManageEmpty>
          ) : (
            <ul className="flex flex-col gap-3">
              {list.data.map((c) => (
                <li key={c.id}>
                  <CampaignModerationCard campaign={c} />
                </li>
              ))}
            </ul>
          )}
        </ManageSection>
      )}
    </div>
  );
}

function MonthsField({ name, label, value }: { name: string; label: string; value: number | null }) {
  return (
    <Field label={label} optional>
      {({ id }) => <Input id={id} name={name} type="number" min={1} max={60} step={1} inputMode="numeric" defaultValue={value ?? ""} className="max-w-32" />}
    </Field>
  );
}

function CampaignModerationCard({ campaign: c }: { campaign: PlatformCampaign }) {
  const status = campaignStatus(c.state, c.closes_at);
  const hold = { campaign_id: c.id };
  return (
    <article className="flex flex-col gap-4 rounded-md border border-line bg-raised px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <AssociationLogo association={organizationRef(c.organization)} size={40} className="shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-bold leading-snug">
            {c.is_public ? (
              <Link href={routes.campaign(c.slug)} className="hover:underline">
                {c.title}
              </Link>
            ) : (
              c.title
            )}
          </h2>
          <p className="type-meta text-muted">
            {c.organization.short_name ?? c.organization.name} · clôture {formatDayShort(c.closes_at)} ·{" "}
            {plural(c.positions.length, "poste")} · {plural(c.submitted, "candidature envoyée", "candidatures envoyées")}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            {c.hidden && <StatusBadge tone="danger">Masqué</StatusBadge>}
            {c.publication !== "published" && <StatusBadge tone="neutral">Retiré par l&apos;asso</StatusBadge>}
            <StatusBadge tone="neutral">{CAMPAIGN_STATUS_LABEL[status]}</StatusBadge>
          </p>
          {c.hidden && (
            <p className="type-small text-muted">
              Masqué le {formatDayShort(c.hidden.at)}
              {c.hidden.by_name ? ` par ${c.hidden.by_name}` : ""} : {c.hidden.reason}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 lg:w-80">
        {c.hidden ? (
          <Disclosure summary="Rétablir" icon="eye" tone="primary">
            <ActionForm action={restoreCampaign} hidden={hold} submitLabel="Rétablir" variant="secondary">
              <Field label="Raison, lue par l'asso">
                {({ id }) => <Textarea id={id} name="reason" rows={2} minLength={3} maxLength={500} required />}
              </Field>
            </ActionForm>
          </Disclosure>
        ) : (
          <Disclosure summary="Masquer" icon="eye" tone="danger">
            <ActionForm action={hideCampaign} hidden={hold} submitLabel="Masquer le recrutement" variant="danger">
              <p className="type-small text-muted">
                Il quitte le site et ne prend plus de candidature. Ce n&apos;est pas une annulation : l&apos;asso le garde, et les
                candidatures déjà envoyées aussi.
              </p>
              <Field label="Raison, lue par l'asso" hint="Ex : contenu contraire à la charte du site.">
                {({ id }) => <Textarea id={id} name="reason" rows={2} minLength={3} maxLength={500} required />}
              </Field>
            </ActionForm>
          </Disclosure>
        )}
      </div>
    </article>
  );
}
