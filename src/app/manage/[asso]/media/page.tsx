import type { Metadata } from "next";
import Image from "next/image";
import { routes } from "@/lib/routes";
import { formatDateLong, plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationEditor, type EditorMedia } from "@/lib/associations/editor";
import { mediaUrl } from "@/lib/associations/model";
import { removeMedia, updateMediaAlt } from "@/app/actions/association-page";
import { Field, Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { ImageUploader } from "@/components/manage/page-editor/ImageUploader";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Médias" };

const USE_LABEL: Record<string, string> = {
  logo_draft: "Logo (brouillon)",
  logo_published: "Logo (en ligne)",
  cover_draft: "Couverture (brouillon)",
  cover_published: "Couverture (en ligne)",
  gallery_draft: "Galerie (brouillon)",
  gallery_published: "Galerie (en ligne)",
};

const KIND_LABEL: Record<EditorMedia["kind"], string> = { logo: "Logo", cover: "Couverture", image: "Photo" };

/** Total stored, in words ("4,2 Mo"). */
function size(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} Ko`
    : `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/**
 * /manage/[asso]/media — the association's image library (media.manage to
 * send and remove; the page team may look). Every image is private until a
 * published page uses it: drafts show through the preview route only. An
 * image still used by the draft or the published page cannot be removed:
 * the page would lose it without anyone deciding so.
 */
export default async function ManageMediaPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!["media.manage", "organization.settings.update", "organization.page.publish"].some(ctx.can)) {
    return <SectionDenied section="media" ctx={ctx} />;
  }
  const editor = await getAssociationEditor(ctx.organization.id);
  if (!editor.ok) return <SectionDenied section="media" ctx={ctx} code={editor.code} />;
  const { media, can } = editor.data;
  const total = media.reduce((n, m) => n + m.bytes, 0);
  const groups = (["logo", "cover", "image"] as const)
    .map((kind) => ({ kind, items: media.filter((m) => m.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={ctx.organization.shortName ?? ctx.organization.name}
        title="Médias"
        description={
          <p>
            Les images de ta page : logo, couvertures, photos. Elles restent privées tant qu&apos;une page publiée ne les
            utilise pas. Chaque envoi est converti en WebP, sans ses métadonnées (lieu, appareil).
          </p>
        }
        meta={media.length > 0 ? `${plural(media.length, "image")} · ${size(total)}` : undefined}
        actions={
          can.edit ? (
            <ButtonLink href={routes.managePageGallery(asso)} variant="secondary" icon="arrow-right">
              Composer la galerie
            </ButtonLink>
          ) : undefined
        }
      />

      {can.media ? (
        <ManageSection title="Envoyer une image">
          <div className="grid gap-6 lg:grid-cols-3">
            {(["image", "cover", "logo"] as const).map((kind) => (
              <div key={kind} className="flex flex-col gap-3">
                <h3 className="type-label text-subtle">{KIND_LABEL[kind]}</h3>
                <ImageUploader asso={asso} kind={kind} withAlt={kind !== "logo"} label={`Envoyer : ${KIND_LABEL[kind].toLowerCase()}`} />
              </div>
            ))}
          </div>
        </ManageSection>
      ) : (
        <p className="type-small text-muted">
          Tu peux voir les images ; les envoyer ou les retirer demande le droit « Gérer les images ».
        </p>
      )}

      {groups.length === 0 ? (
        <ManageEmpty icon="image" title="Pas encore d'image">
          <p>Envoie un logo, une couverture ou des photos : tu les choisiras ensuite dans l&apos;éditeur de la page.</p>
        </ManageEmpty>
      ) : (
        groups.map((g) => (
          <ManageSection key={g.kind} title={g.kind === "image" ? "Photos" : g.kind === "cover" ? "Couvertures" : "Logos"} count={g.items.length}>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((m) => (
                <li key={m.id} className="flex flex-col overflow-hidden rounded-md border border-line bg-raised">
                  <span className={g.kind === "logo" ? "relative block aspect-[4/3] bg-sunken" : "relative block aspect-[4/3] bg-sunken"}>
                    <Image
                      src={mediaUrl(m.path, true)}
                      alt={m.alt ?? `${KIND_LABEL[m.kind]} sans description`}
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw"
                      className={g.kind === "logo" ? "object-contain p-4" : "object-cover"}
                    />
                  </span>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <p className="type-meta text-subtle">
                      {m.width} × {m.height} · {size(m.bytes)} · envoyée le {formatDateLong(m.created_at)}
                    </p>
                    {m.uses.length > 0 ? (
                      <ul aria-label="Utilisée par" className="flex flex-wrap gap-1.5">
                        {m.uses.map((u) => (
                          <li key={u}>
                            <StatusBadge tone={u.endsWith("published") ? "ok" : "info"}>{USE_LABEL[u] ?? u}</StatusBadge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="type-small text-muted">Pas utilisée</p>
                    )}
                    <p className={m.alt ? "type-small" : "type-small text-warn"}>
                      {m.alt ? <>Description : {m.alt}</> : "Pas de description : ajoute-en une pour les lecteurs d'écran."}
                    </p>
                    {can.media && (
                      <div className="mt-auto flex flex-col gap-2">
                        <Disclosure summary={m.alt ? "Modifier la description" : "Ajouter une description"} icon="edit">
                          <ActionForm action={updateMediaAlt} hidden={{ media_id: m.id }} submitLabel="Enregistrer" size="sm">
                            <Field label="Description" hint="Ce que montre l'image, en une phrase. 200 caractères au plus.">
                              {({ id, describedBy }) => (
                                <Input id={id} aria-describedby={describedBy} name="alt" maxLength={200} defaultValue={m.alt ?? ""} />
                              )}
                            </Field>
                          </ActionForm>
                        </Disclosure>
                        {m.uses.length === 0 ? (
                          <Disclosure summary="Retirer de la médiathèque" icon="close" tone="danger">
                            <ActionForm action={removeMedia} hidden={{ media_id: m.id }} submitLabel="Retirer l'image" variant="danger" size="sm">
                              <p className="type-small text-muted">Le fichier est supprimé. Cette action ne s&apos;annule pas.</p>
                            </ActionForm>
                          </Disclosure>
                        ) : (
                          <p className="type-meta text-subtle">
                            Utilisée par la page : retire-la d&apos;abord du brouillon{m.uses.some((u) => u.endsWith("published")) ? " puis publie" : ""}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ManageSection>
        ))
      )}
    </div>
  );
}
