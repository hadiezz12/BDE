import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getCampaignPage, getOpenCampaigns } from "@/lib/data/recruitment";
import { applicationsFor, getMyApplications } from "@/lib/recruitment/me";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { CampaignCard } from "@/components/recruitment/CampaignCard";
import { isOpen, isOver } from "@/components/recruitment/campaign-facts";
import { CampaignFiche } from "../_components/CampaignFiche";
import { getRelatedPosts } from "@/lib/data/posts";
import { isSaved } from "@/lib/saved/data";
import { withNext } from "@/lib/auth/next-path";
import { SaveButton } from "@/components/saved/SaveButton";
import { RelatedPosts } from "@/components/campus/RelatedPosts";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCampaignPage(slug);
  if (page.state !== "ok") return { title: "Recrutement introuvable" };
  const { campaign } = page;
  return {
    title: `${campaign.title} · ${campaign.association.name}`,
    description: campaign.intro,
    alternates: { canonical: routes.campaign(campaign.slug) },
    openGraph: campaign.cover ? { images: [{ url: campaign.cover.src, alt: campaign.cover.alt }] } : undefined,
  };
}

/**
 * /recruitment/[slug] — a campaign's fiche (CampaignFiche), read as a visitor
 * (public_recruitment_campaign); a former address redirects to the new one.
 * A signed-in student sees their own applications to it; when it does not
 * take applications now, the campaigns that do follow.
 */
export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;
  const page = await getCampaignPage(slug);
  if (page.state === "moved") permanentRedirect(routes.campaign(page.slug));
  if (page.state !== "ok") notFound();
  const { campaign } = page;

  const now = new Date();
  const session = await getSession();
  const open = isOpen(campaign.status);
  const [applications, others, saved, announcements] = await Promise.all([
    getMyApplications(),
    open ? Promise.resolve([]) : getOpenCampaigns(8),
    isSaved("campaign", campaign.id),
    // The fiche never fails because its articles could not load.
    getRelatedPosts("campaign", campaign.id, 3).catch(() => []),
  ]);
  const mine = applicationsFor(applications, campaign.id);
  const { association } = campaign;

  return (
    <div data-accent={association.accent} className="pb-[var(--section)]">
      <div className="wrap flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pb-5 pt-6 sm:pt-8">
        <Breadcrumbs
          items={[
            { href: routes.recruitment, label: "Recrutements" },
            { href: routes.campaign(campaign.slug), label: campaign.title },
          ]}
        />
        <SaveButton
          kind="campaign"
          id={campaign.id}
          initialSaved={saved}
          signedIn={Boolean(session.user)}
          loginHref={withNext(routes.login, routes.campaign(campaign.slug))}
        />
      </div>

      <CampaignFiche campaign={campaign} mine={mine} signedIn={Boolean(session.user)} now={now} />

      <RelatedPosts
        posts={announcements}
        id="annonces"
        kicker={`Publié par ${association.shortName ?? association.name}`}
        title="Sur ce recrutement"
        className="pt-[var(--section)]"
      />

      {(isOver(campaign.status) || campaign.status === "a-venir" || campaign.status === "en-pause") &&
        others.filter((c) => c.id !== campaign.id).length > 0 && (
          <section aria-labelledby="encore-ouverts" className="wrap pt-[var(--section)]">
            <SectionHeader
              id="encore-ouverts"
              kicker={plural(others.length, "recrutement")}
              title={isOver(campaign.status) ? "Encore ouverts" : "Déjà ouverts"}
              action={{ href: `${routes.recruitment}?vue=ouverts`, label: "Tout voir" }}
            />
            <div className="rail mt-8">
              {others
                .filter((c) => c.id !== campaign.id)
                .map((c) => (
                  <CampaignCard key={c.id} campaign={c} className="w-[17.5rem] sm:w-[20rem]" />
                ))}
            </div>
          </section>
        )}
    </div>
  );
}
