import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationEditor } from "@/lib/associations/editor";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { Notice } from "@/components/manage/governance/Notices";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { ContactForm, IdentityForm, PresentationForm } from "@/components/manage/page-editor/ContentForms";
import { AppearanceForm } from "@/components/manage/page-editor/AppearanceForm";
import { CompletenessList, editorCompleteness } from "@/components/manage/page-editor/PageStatus";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ etape?: string }>;

export const metadata: Metadata = { title: "Démarrer la page" };

const STEPS = [
  { key: "identite", label: "Qui vous êtes" },
  { key: "presentation", label: "Ce que vous faites" },
  { key: "images", label: "Votre image" },
  { key: "contact", label: "Où vous joindre" },
  { key: "verifier", label: "Vérifier et publier" },
] as const;

/**
 * /manage/[asso]/demarrer — the first setup of a page, one short step at a
 * time (?etape=identite…verifier). Each step saves into the same draft as the
 * editor, with the same checks; "Passer" moves on without saving. The last
 * step shows what is still missing, the preview and who can publish.
 */
export default async function PageSetupWizard({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const { etape } = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!ctx.can("organization.settings.update")) return <SectionDenied section="settings" ctx={ctx} />;
  const editor = await getAssociationEditor(ctx.organization.id);
  if (!editor.ok) return <SectionDenied section="settings" ctx={ctx} code={editor.code} />;
  const e = editor.data;

  const index = Math.max(0, STEPS.findIndex((s) => s.key === etape));
  const step = STEPS[index];
  const hrefFor = (i: number) => `${routes.manageSetup(asso)}?etape=${STEPS[i].key}`;
  const next = index < STEPS.length - 1 ? hrefFor(index + 1) : undefined;
  const common = { organizationId: e.organization.id, draft: e.draft, next, submitLabel: "Enregistrer et continuer" };
  const { publishable } = editorCompleteness(e);

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={ctx.organization.shortName ?? ctx.organization.name}
        title="Démarrer la page de l'asso"
        description={
          <p>
            Cinq étapes courtes. Tout est enregistré en brouillon&nbsp;: rien n&apos;est visible avant la publication, et
            tout reste modifiable ensuite dans <Link href={routes.manageSettings(asso)} className="link">Page publique</Link>.
          </p>
        }
      />

      <nav aria-label="Étapes">
        <ol className="grid gap-2 sm:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <Link
                href={hrefFor(i)}
                aria-current={i === index ? "step" : undefined}
                className={cx(
                  "flex min-h-12 items-center gap-2.5 rounded-sm border-2 px-3 py-2 type-small font-semibold",
                  i === index ? "border-fg bg-raised" : "border-line text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "grid size-6 shrink-0 place-items-center rounded-full text-[0.75rem]",
                    i === index ? "bg-fg text-bg" : "bg-sunken",
                  )}
                >
                  {i + 1}
                </span>
                {s.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <ManageSection title={`${index + 1}. ${step.label}`}>
        {step.key === "identite" && (
          <IdentityForm {...common} categories={e.categories} isBde={e.organization.kind === "bde"} />
        )}
        {step.key === "presentation" && <PresentationForm {...common} />}
        {step.key === "images" && (
          <AppearanceForm
            {...common}
            asso={asso}
            media={e.media}
            kindLabel={e.draft.kind_label ?? "Association étudiante"}
            canUpload={e.can.media}
          />
        )}
        {step.key === "contact" && <ContactForm {...common} />}
        {step.key === "verifier" && (
          <div className="flex flex-col gap-6">
            <CompletenessList editor={e} />
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={routes.associationPreview(asso)} icon="eye" iconPosition="start">
                Voir l&apos;aperçu
              </ButtonLink>
              {e.can.publish ? (
                <ButtonLink href={routes.managePagePublication(asso)} variant="secondary" icon="arrow-right">
                  {publishable ? "Aller à la publication" : "Voir ce qui manque"}
                </ButtonLink>
              ) : (
                <ButtonLink href={routes.manageSettings(asso)} variant="secondary" icon="arrow-right">
                  Continuer dans l&apos;éditeur
                </ButtonLink>
              )}
            </div>
            {!e.can.publish && (
              <Notice tone="info" icon="info" title="La publication revient à la présidence ou au secrétariat.">
                <p>Quand le brouillon te va, préviens-les : ils le relisent dans l&apos;aperçu et publient.</p>
              </Notice>
            )}
            <p className="type-small text-muted">
              Envie d&apos;ajouter des photos ou de présenter l&apos;équipe&nbsp;?{" "}
              <Link href={routes.managePageGallery(asso)} className="link font-semibold text-fg">
                Galerie
              </Link>{" "}
              et{" "}
              <Link href={routes.managePageTeam(asso)} className="link font-semibold text-fg">
                Équipe présentée
              </Link>
              .
            </p>
          </div>
        )}
      </ManageSection>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        {index > 0 ? (
          <Link href={hrefFor(index - 1)} className="inline-flex min-h-11 items-center gap-1.5 type-label hover:text-assoc-text">
            <Icon name="arrow-left" size={14} />
            Étape précédente
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={next} className="inline-flex min-h-11 items-center gap-1.5 type-label text-muted hover:text-fg">
            Passer cette étape
            <Icon name="arrow-right" size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
