import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";

export const metadata: Metadata = {
  title: "Cookies",
  description: "Les deux cookies du site, à quoi ils servent, et pourquoi il n'y a pas de bandeau.",
};

/** Everything the site stores on your device (checked in the code and by a test: nothing else is written). */
const TRACKERS = [
  {
    name: "sb-…-auth-token (parfois découpé en .0, .1)",
    who: "Ce site (session gérée avec Supabase)",
    what: "Garde ta session ouverte une fois connecté·e. Sans lui, impossible d'utiliser ton espace.",
    kind: "Nécessaire",
    lasts: "400 jours au plus, effacé à la déconnexion ; la session elle-même peut expirer plus tôt",
  },
  {
    name: "vpc-theme",
    who: "Ce site",
    what: "Retient le thème clair ou sombre que tu as choisi.",
    kind: "Choisi par toi (personnalisation de l'affichage)",
    lasts: "1 an",
  },
];

/**
 * /cookies — the inventory of what the site reads or writes on a device
 * (Phase 14). Two cookies, both strictly necessary or chosen by the person;
 * no audience measurement, no advertising, no social widget, no third-party
 * script or font: so no consent banner (CNIL: only trackers that need
 * consent call for one). If an optional tracker is ever added, it needs
 * prior consent and this page changes first.
 */
export default function CookiesPage() {
  return (
    <div data-surface="paper" className="grain pb-[var(--section)]">
      <PageHeader
        variant="document"
        kicker="Vie privée"
        title="Cookies"
        intro="Deux cookies, rien d'autre : pas de mesure d'audience, pas de publicité, pas de bouton de réseau social. C'est pour ça qu'il n'y a pas de bandeau à accepter."
      />
      <div className="wrap flex max-w-4xl flex-col gap-14">
        <section aria-labelledby="liste-titre">
          <SectionHeader id="liste-titre" index="01" title="Ce que le site garde sur ton appareil" />
          <div className="mt-6 overflow-x-auto rounded-md border border-line bg-raised">
            <table className="w-full min-w-[40rem] border-collapse text-left type-small">
              <thead>
                <tr className="border-b border-line bg-sunken/60">
                  {["Nom", "Qui", "À quoi il sert", "Nature", "Durée"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2.5 type-label text-[0.7rem] text-subtle">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TRACKERS.map((t) => (
                  <tr key={t.name} className="border-b border-line align-top last:border-b-0">
                    <th scope="row" className="px-4 py-3 font-mono text-[0.8rem] font-semibold">
                      {t.name}
                    </th>
                    <td className="px-4 py-3">{t.who}</td>
                    <td className="px-4 py-3">{t.what}</td>
                    <td className="px-4 py-3">{t.kind}</td>
                    <td className="px-4 py-3">{t.lasts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-prose type-small text-muted">
            Rien n&apos;est gardé dans le stockage local du navigateur. Les polices sont servies par le site lui-même, les images aussi :
            aucune page ne contacte un autre service en ton nom.
          </p>
        </section>

        <section aria-labelledby="choix-titre">
          <SectionHeader id="choix-titre" index="02" title="Tes choix" />
          <div className="mt-5 flex max-w-prose flex-col gap-4">
            <p>
              Il n&apos;y a rien de facultatif à accepter ou refuser. Pour effacer le cookie de session, déconnecte-toi ; pour le thème,
              rechoisis-le ou efface les données du site dans ton navigateur.
            </p>
            <p>
              Les e-mails que tu reçois se règlent dans{" "}
              <Link href={routes.accountNotificationSettings} className="link font-semibold">
                tes réglages de notifications
              </Link>
              , et tes données dans{" "}
              <Link href={routes.accountPrivacy} className="link font-semibold">
                Mes données
              </Link>
              . Le reste est expliqué dans la{" "}
              <Link href={routes.privacy} className="link font-semibold">
                notice de confidentialité
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
