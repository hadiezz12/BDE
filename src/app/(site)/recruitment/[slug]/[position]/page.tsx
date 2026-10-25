import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getPositionPage } from "@/lib/data/recruitment";
import { applicationsFor, getMyApplications } from "@/lib/recruitment/me";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplyPanel } from "@/components/recruitment/ApplyPanel";
import { DeadlineStamp } from "@/components/recruitment/DeadlineStamp";
import { PositionBlock } from "@/components/recruitment/PositionBlock";
import { STATUS_TONE } from "@/components/recruitment/campaign-facts";

type Props = { params: Promise<{ slug: string; position: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, position } = await params;
  const page = await getPositionPage(slug, position);
  if (page.state !== "ok") return { title: "Poste introuvable" };
  return {
    title: `${page.position.title} · ${page.campaign.association.name}`,
    description: page.position.summary ?? page.campaign.intro,
    alternates: { canonical: routes.campaignPosition(page.campaign.slug, page.position.slug) },
  };
}

/**
 * One position of a campaign, on its own page (to share "on recrute un·e
 * trésorier·e"): the same fiche as on the campaign page, with its campaign's
 * deadline and the way back to the other positions.
 */
export default async function PositionPage({ params }: Props) {
  const { slug, position: positionSlug } = await params;
  const page = await getPositionPage(slug, positionSlug);
  if (page.state === "moved") permanentRedirect(routes.campaignPosition(page.slug, positionSlug));
  if (page.state !== "ok") notFound();
  const { campaign, position } = page;

  const now = new Date();
  const session = await getSession();
  const mine = applicationsFor(await getMyApplications(), campaign.id);
  const index = campaign.positions.findIndex((p) => p.id === position.id);
  const others = campaign.positions.filter((p) => p.id !== position.id);
  const back = routes.campaignPosition(campaign.slug, position.slug);

  return (
    <div data-accent={campaign.association.accent} className="pb-[var(--section)]">
      <div className="wrap pb-5 pt-6 sm:pt-8">
        <Breadcrumbs
          items={[
            { href: routes.recruitment, label: "Recrutements" },
            { href: routes.campaign(campaign.slug), label: campaign.title },
            { href: back, label: position.title },
          ]}
        />
      </div>

      <div className="mx-auto w-full max-w-[var(--wrap)] sm:px-[var(--gutter)]">
        <article data-surface="paper" aria-labelledby="poste-titre" className="grain relative sm:rounded-sm">
          <span aria-hidden className="absolute inset-x-0 top-0 h-2 bg-assoc sm:rounded-t-sm" />
          <div className="px-[var(--gutter)] sm:px-8 lg:px-12 xl:px-16">
            <header className="flex flex-col gap-5 border-b-2 border-fg pb-8 pt-10 sm:pt-12">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <AssociationIdentity association={campaign.association} showKind />
                <StatusBadge tone={STATUS_TONE[campaign.status]} pulse={campaign.status === "derniere-chance"}>
                  {CAMPAIGN_STATUS_LABEL[campaign.status]}
                </StatusBadge>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="type-label text-assoc-text">
                    <Link href={routes.campaign(campaign.slug)} className="hover:underline">
                      {campaign.title}
                    </Link>
                  </p>
                  <h1 id="poste-titre" className="type-title break-words hyphens-auto">
                    {position.title}
                  </h1>
                </div>
                <DeadlineStamp closesAt={position.closesAt} opensAt={campaign.opensAt} status={campaign.status} size="sm" tilt={-4} />
              </div>
            </header>

            <div className="grid gap-x-12 gap-y-12 py-10 sm:py-12 lg:grid-cols-12">
              <div className="flex min-w-0 flex-col gap-10 lg:col-span-8">
                <PositionBlock
                  position={position}
                  campaign={campaign}
                  index={index + 1}
                  total={campaign.positions.length}
                  mine={mine.find((a) => a.position.id === position.id)}
                  back={back}
                  linkToPage={false}
                />
                {others.length > 0 && (
                  <nav aria-labelledby="autres-postes" className="flex flex-col gap-3 border-t border-line pt-6">
                    <h2 id="autres-postes" className="type-label text-muted">
                      Les autres postes de ce recrutement
                    </h2>
                    <ul className="flex flex-wrap gap-2">
                      {others.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={routes.campaignPosition(campaign.slug, p.slug)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xs border border-line-strong px-3 type-small font-semibold hover:border-fg"
                          >
                            {p.title}
                            <Icon name="arrow-right" size={14} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link href={routes.campaign(campaign.slug)} className="link self-start type-small font-bold">
                      Toute la fiche du recrutement (déroulé, questions fréquentes, contact)
                    </Link>
                  </nav>
                )}
              </div>
              <div className="lg:col-span-4">
                <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
                  <ApplyPanel campaign={campaign} mine={mine} signedIn={Boolean(session.user)} headingId="candidater" positionsHref={`#poste-${position.id}`} now={now} />
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
