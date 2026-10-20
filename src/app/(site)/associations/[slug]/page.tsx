import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAssociationPage } from "@/lib/data/associations";
import { toAssociation } from "@/lib/associations/model";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { AssociationProfile } from "../_components/AssociationProfile";
import { getProfileViewer, loadProfileModules } from "../_components/profile-modules";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getAssociationPage(slug);
  if (page.state === "archived") return { title: page.name, robots: { index: false } };
  if (page.state !== "ok") return { title: "Association introuvable", robots: { index: false } };
  const a = toAssociation(page.association);
  const description = [a.tagline, `${a.kind} · GEM Alpine Business School, Paris.`].filter(Boolean).join(" ");
  const image = a.cover ?? a.logo;
  return {
    title: a.name,
    description,
    alternates: { canonical: routes.association(a.slug) },
    openGraph: {
      type: "profile",
      title: a.name,
      description,
      url: routes.association(a.slug),
      images: image ? [{ url: image.src, alt: image.alt, width: image.width, height: image.height }] : undefined,
    },
  };
}

/**
 * /associations/[slug] — an association's public page (public.public_association,
 * read as a visitor): only published pages of active associations, never a
 * draft. A former address redirects for good to the current one; an archived
 * association gets a short notice; anything else (unknown, not published,
 * suspended, withheld by the BDE) is a plain 404, saying nothing about why.
 */
export default async function AssociationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = await getAssociationPage(slug);
  if (page.state === "moved") permanentRedirect(routes.association(page.slug));
  if (page.state === "archived") return <ArchivedAssociation name={page.name} slug={slug} />;
  if (page.state !== "ok") notFound();

  const association = toAssociation(page.association);
  const viewer = await getProfileViewer(association);
  const modules = await loadProfileModules(association, viewer.user?.id);
  const justPublished = (await searchParams).publiee === "1" && Boolean(viewer.manageHref);

  return (
    <>
      {justPublished && (
        <p role="status" className="wrap flex items-start gap-2 pt-6 type-small font-semibold text-ok">
          <Icon name="check" size={16} className="mt-0.5 shrink-0" />
          C&apos;est en ligne : voici la page telle que tout le monde la voit maintenant.
        </p>
      )}
      <AssociationProfile association={association} modules={modules} viewer={viewer} />
    </>
  );
}

function ArchivedAssociation({ name, slug }: { name: string; slug: string }) {
  return (
    <div className="wrap pb-[var(--section)] pt-6 sm:pt-8">
      <Breadcrumbs
        items={[
          { href: routes.associations, label: "Associations" },
          { href: routes.association(slug), label: name },
        ]}
      />
      <EmptyState
        className="mt-10"
        mark={<Icon name="file" size={44} />}
        title={`${name} n'est plus active`}
        actions={
          <ButtonLink href={routes.associations} icon="arrow-right">
            Les associations actives
          </ButtonLink>
        }
      >
        Cette association a été archivée sur la plateforme : sa page n&apos;est plus publiée.
      </EmptyState>
    </div>
  );
}
