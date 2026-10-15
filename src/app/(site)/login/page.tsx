import type { Metadata } from "next";
import { getDemoProfile, getSession } from "@/lib/demo-session";
import { getAssociationsByIds } from "@/lib/data/associations";
import { routes } from "@/lib/routes";
import { BrandMark } from "@/components/brand/BrandMark";
import { NeonText } from "@/components/brand/NeonText";
import { Sticker } from "@/components/ui/Sticker";
import { SignInForm } from "@/components/auth/SignInForm";
import { DemoRolePicker, type DemoChoice } from "@/components/auth/DemoRolePicker";
import { safeNextPath } from "@/components/auth/next-path";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connecte-toi avec ton adresse de l'école pour retrouver tes billets, tes soirées et tes candidatures.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const listFr = new Intl.ListFormat("fr", { style: "long", type: "conjunction" });

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNextPath((await searchParams).next);
  const [session, student, officer] = await Promise.all([
    getSession(),
    getDemoProfile("etudiant"),
    getDemoProfile("responsable"),
  ]);
  const managed = officer ? await getAssociationsByIds(officer.managedAssociationIds) : [];

  // The demo accounts are named by their demo label, never as a person, and start empty.
  const choices: DemoChoice[] = [
    {
      role: "visiteur",
      label: "Visiteur",
      icon: "eye",
      detail: "Sans compte : les événements, les assos et la page VSS / VDH. Pas d'espace perso.",
      redirectTo: next ?? routes.home,
    },
    {
      role: "etudiant",
      label: student?.demoLabel ?? "Compte démo — étudiant·e",
      icon: "user",
      detail: "Un espace étudiant vide : aucune inscription, aucune candidature, aucune notification.",
      redirectTo: next ?? routes.account,
    },
    {
      role: "responsable",
      label: officer?.demoLabel ?? "Compte démo — responsable d'asso",
      icon: "sliders",
      detail: managed.length
        ? `Le même espace vide, plus l'espace de gestion : ${listFr.format(managed.map((a) => a.name))}.`
        : "Le même espace vide, plus l'espace de gestion d'une association.",
      redirectTo: next ?? routes.account,
    },
  ];

  return (
    <div className="wrap grid gap-12 pb-section pt-10 sm:pt-16 lg:grid-cols-12 lg:gap-8">
      {/* Brand side: the door of the club. The panther checks you in. */}
      <div className="lg:col-span-6 xl:col-span-7">
        <p className="type-label text-accent-text">Connexion · étudiant·es GEM Paris</p>
        <h1 className="mt-4 type-display">
          Montre patte <NeonText flicker>rose</NeonText>.
        </h1>
        <p className="mt-6 max-w-xl type-lead text-muted">
          Ton adresse de l&apos;école suffit. De l&apos;autre côté : tes billets, tes soirées enregistrées, tes
          candidatures et ta carte cotisante.
        </p>
        <div aria-hidden className="relative mt-14 hidden w-fit lg:block">
          <BrandMark variant="panther" height={280} decorative className="-rotate-6" />
          <Sticker tone="cream" tilt={-5} className="absolute -right-6 bottom-6">
            Avec ton mail GEM
          </Sticker>
        </div>
      </div>

      <div className="flex flex-col gap-12 lg:col-span-6 xl:col-span-5">
        <section aria-labelledby="connexion-titre" className="rounded-md border border-line-strong bg-raised p-5 sm:p-8">
          <h2 id="connexion-titre" className="type-section">
            Se connecter
          </h2>
          <SignInForm className="mt-6" />
        </section>

        <section aria-labelledby="demo-titre">
          <div className="border-t-2 border-fg pt-3">
            <h2 id="demo-titre" className="type-label">
              Mode démo · Phase 1
            </h2>
            <p className="mt-3 text-muted">
              En attendant les vrais comptes, choisis comment afficher le site. Les comptes démo ne sont pas de vraies
              personnes et ne contiennent aucune donnée.{" "}
              {next
                ? "Tu reviendras ensuite sur la page que tu voulais ouvrir."
                : "Tu peux en changer à tout moment depuis le pied de page."}
            </p>
          </div>
          <DemoRolePicker choices={choices} current={session.role} className="mt-5" />
        </section>
      </div>
    </div>
  );
}
