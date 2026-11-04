import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Qui édite le site et qui l'héberge.",
};

/**
 * /legal — the legal notice (Phase 14). Only what is known and verified is
 * written; the publisher's legal details and the host are given by the BDE
 * before the site opens (a launch blocker, docs/privacy/launch-checklist.md),
 * never invented here.
 */
export default function LegalPage() {
  return (
    <div data-surface="paper" className="grain pb-[var(--section)]">
      <PageHeader variant="document" kicker="Informations" title="Mentions légales" />
      <div className="wrap flex max-w-3xl flex-col gap-14">
        <section aria-labelledby="editeur-titre">
          <SectionHeader id="editeur-titre" index="01" title="Éditeur" />
          <div className="mt-5 flex flex-col gap-4">
            <p>
              Ce site est celui du Very Pink Club, le bureau des étudiants du campus de Paris de GEM Alpine Business School. Ce
              n&apos;est pas un site de l&apos;école : GEM Alpine Business School ne l&apos;édite pas.
            </p>
            <p className="text-muted">
              La forme juridique, l&apos;adresse du siège, la personne directrice de la publication et le moyen de contact de
              l&apos;éditeur seront publiés ici par le bureau avant l&apos;ouverture du site au public.
            </p>
          </div>
        </section>
        <section aria-labelledby="hebergeur-titre">
          <SectionHeader id="hebergeur-titre" index="02" title="Hébergement" />
          <div className="mt-5 flex flex-col gap-4">
            <p>La base de données, les comptes et les fichiers sont hébergés par Supabase.</p>
            <p className="text-muted">L&apos;hébergeur du site en production et ses coordonnées seront indiqués ici avant l&apos;ouverture.</p>
          </div>
        </section>
        <section aria-labelledby="donnees-titre">
          <SectionHeader id="donnees-titre" index="03" title="Données personnelles et cookies" />
          <p className="mt-5">
            Voir la{" "}
            <Link href={routes.privacy} className="link font-semibold">
              notice de confidentialité
            </Link>{" "}
            et la page{" "}
            <Link href={routes.cookies} className="link font-semibold">
              Cookies
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
