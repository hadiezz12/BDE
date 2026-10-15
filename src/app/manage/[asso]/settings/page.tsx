import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { PublicLink } from "@/components/manage/links/PublicLink";
import { DemoNotice } from "@/components/manage/DemoNotice";
import { SettingsForm } from "@/components/manage/settings/SettingsForm";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Réglages" };

/**
 * /manage/[asso]/settings — the association's public profile as it is
 * online: name, type, tagline, presentation, key points, contact, socials,
 * colour (closed palette), logo and cover. Empty fields stay empty: the
 * bureau fills them. Phase 1: a demo form, nothing is saved.
 */
export default async function ManageSettingsPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association } = ctx;
  const publicPath = routes.association(association.slug);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={association.shortName ?? association.name}
        title="Réglages"
        description={
          <p>
            Le profil public de {association.name}&nbsp;: ce que les étudiant·es lisent sur ta page, dans l&apos;annuaire
            et sur chaque événement. Tout le bureau peut le modifier.
          </p>
        }
        actions={<PublicLink href={publicPath} title={association.name} label="Voir la page" />}
      />

      <DemoNotice className="max-w-2xl">
        le formulaire montre le profil tel qu&apos;il est en ligne, mais tes modifications ne sont pas encore
        enregistrées. Les champs vides attendent que le bureau les remplisse.
      </DemoNotice>

      <SettingsForm
        publicPath={publicPath}
        association={{
          slug: association.slug,
          name: association.name,
          shortName: association.shortName,
          kind: association.kind,
          tagline: association.tagline,
          description: association.description,
          contactEmail: association.contactEmail,
          meetingInfo: association.meetingInfo,
          highlights: association.highlights,
          pillars: association.pillars,
          socials: association.socials,
          accent: association.accent,
          logo: association.logo,
          cover: association.cover,
        }}
      />
    </div>
  );
}
