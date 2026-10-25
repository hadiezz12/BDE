import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { getAuthContext } from "@/lib/auth/context";
import { withNext } from "@/lib/auth/next-path";
import { getFormPreview, getRecruitmentEditor } from "@/lib/recruitment/editor";
import { previewCampaign } from "@/lib/recruitment/preview";
import { governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { FormPreview } from "@/components/recruitment/FormPreview";
import { CampaignFiche } from "../../_components/CampaignFiche";

type Props = {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = {
  title: "Aperçu du recrutement",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /recruitment/apercu/[campaign] — the campaign's fiche exactly as its public
 * page will show it, for its team only (recruitment_editor checks the right;
 * any refusal is the lock below, never data), and with ?poste= the form that
 * position's candidates fill, from the draft (recruitment_form_preview).
 * Never indexed; nothing on it acts: no application, no file, no message.
 * ?cadre=1 is the framed fiche itself, without this banner.
 */
export default async function CampaignPreviewPage({ params, searchParams }: Props) {
  const { campaign: raw } = await params;
  const sp = await searchParams;
  const valid = UUID.test(raw);
  const campaignId = raw.toLowerCase();
  const self = routes.campaignPreview(valid ? campaignId : raw);

  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") redirect(withNext(routes.login, self));
  if (!valid) return <Refusal code="campaign_not_found" />;

  const editor = await getRecruitmentEditor(campaignId);
  if (!editor.ok) return <Refusal code={editor.code} />;
  const data = editor.data;
  const now = new Date();
  const asso = data.organization.slug;
  const poste = first(sp.poste);

  if (poste && UUID.test(poste)) {
    const form = await getFormPreview(campaignId, poste.toLowerCase(), "draft");
    if (!form.ok) return <Refusal code={form.code} />;
    const f = form.data;
    return (
      <>
        <Banner
          title={`Formulaire · ${f.position.title}`}
          detail={`Version ${f.number ?? 1}${data.form.draft ? " (brouillon)" : ""} : ce que verra une personne qui candidate à ce poste. Rien n'est enregistré.`}
          back={routes.manageCampaign(asso, campaignId, "formulaire")}
          others={data.positions
            .filter((p) => !p.retired_at)
            .map((p) => ({ href: routes.campaignPreview(campaignId, p.id), label: p.title, active: p.id === poste.toLowerCase() }))}
          fiche={self}
        />
        <div data-accent={data.organization.accent} className="wrap max-w-3xl py-10">
          <FormPreview form={f.form} positionId={f.position.id} />
        </div>
      </>
    );
  }

  const campaign = previewCampaign(data, now);
  if (!campaign) {
    return (
      <div className="wrap py-[var(--section)]">
        <EmptyState
          mark={<Icon name="calendar" size={44} />}
          title="Pas encore d'aperçu"
          actions={
            <ButtonLink href={routes.manageCampaign(asso, campaignId, "regles")} icon="arrow-right">
              Ajouter les dates
            </ButtonLink>
          }
        >
          L&apos;aperçu se construit autour des dates : ajoute l&apos;ouverture et la date limite, puis reviens ici.
        </EmptyState>
      </div>
    );
  }

  const fiche = <CampaignFiche campaign={campaign} mine={[]} signedIn preview now={now} />;
  if (first(sp.cadre) === "1") return <div className="py-6">{fiche}</div>;

  return (
    <>
      <Banner
        title={`Aperçu · ${data.summary.is_public ? "en ligne" : data.campaign.publication === "draft" ? "brouillon" : "hors ligne"}`}
        detail={
          data.summary.is_public
            ? "C'est ce que tout le monde voit à l'adresse du recrutement."
            : "Seule l'équipe de l'asso le voit ici. Les dates et les places sont montrées comme elles le seront une fois publié."
        }
        back={routes.manageCampaign(asso, campaignId, "apercu")}
        others={data.positions
          .filter((p) => !p.retired_at)
          .map((p) => ({ href: routes.campaignPreview(campaignId, p.id), label: `Formulaire · ${p.title}`, active: false }))}
        live={data.summary.is_public && data.campaign.slug ? routes.campaign(data.campaign.slug) : undefined}
      />
      <div data-accent={data.organization.accent} className="pb-[var(--section)] pt-6">
        {fiche}
      </div>
    </>
  );
}

function Banner({
  title,
  detail,
  back,
  others,
  fiche,
  live,
}: {
  title: string;
  detail: string;
  back: string;
  others: { href: string; label: string; active: boolean }[];
  fiche?: string;
  live?: string;
}) {
  return (
    <section aria-label="Aperçu du recrutement" data-surface="paper" className="border-b-2 border-dashed border-fg">
      <div className="wrap flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-1">
          <p className="type-label">{title}</p>
          <p className="type-small text-muted">{detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href={back} variant="secondary" size="sm" icon="edit" iconPosition="start">
            Revenir à l&apos;éditeur
          </ButtonLink>
          {fiche && (
            <ButtonLink href={fiche} variant="ghost" size="sm" icon="eye" iconPosition="start">
              La fiche
            </ButtonLink>
          )}
          {live && (
            <ButtonLink href={live} variant="ghost" size="sm" icon="arrow-up-right">
              Voir en ligne
            </ButtonLink>
          )}
          {others.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              aria-current={o.active ? "page" : undefined}
              className={cx(
                "inline-flex min-h-9 items-center rounded-xs border px-3 type-small font-semibold",
                o.active ? "border-fg bg-fg text-bg" : "border-line-strong hover:border-fg",
              )}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Refusal({ code }: { code: GovernanceErrorCode }) {
  return (
    <div className="wrap py-[var(--section)]">
      <EmptyState
        mark={<Icon name="lock" size={44} />}
        title="Cet aperçu ne s'ouvre pas pour toi"
        actions={
          <ButtonLink href={routes.manage} variant="secondary" icon="arrow-right">
            Mes espaces
          </ButtonLink>
        }
      >
        {governanceErrorMessage(code)}
      </EmptyState>
    </div>
  );
}
