import Link from "next/link";
import { routes } from "@/lib/routes";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * "Mode d'emploi" of the recruitment index, printed on a paper band between
 * the open campaigns and the rest: four numbered lines, ruled like a notice
 * pinned to the board, not a grid of feature cards.
 */
const STEPS = [
  {
    title: "Tu lis la fiche",
    text: "Missions, heures par semaine, places et date limite : tout est écrit avant que tu te lances.",
  },
  {
    title: "Tu candidates ici",
    text: "Le poste, quelques lignes, parfois un CV ou une démo audio. Ça se remplit depuis ton téléphone.",
  },
  {
    title: "Tu rencontres l'équipe",
    text: "Entretien, appel ou café : chaque asso annonce son process sur sa fiche, dates comprises.",
  },
  {
    title: "Tu suis la réponse",
    text: "Envoyée, lue, entretien, réponse : ta candidature avance sous tes yeux, dans ton espace.",
  },
];

export function HowItWorks({ signedIn }: { signedIn: boolean }) {
  return (
    <section data-surface="paper" aria-labelledby="mode-emploi" className="grain py-14 sm:py-20">
      <div className="wrap grid gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-6 lg:col-span-4">
          <SectionHeader
            id="mode-emploi"
            kicker="Mode d'emploi"
            title="Comment on recrute ici"
            className="self-stretch"
            description="Chaque asso recrute pour elle-même. Le BDE rassemble toutes les fiches au même endroit, pour que tu n'aies plus à fouiller les stories."
          />
          {signedIn ? (
            <Link
              href={routes.accountApplications}
              className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
            >
              Mes candidatures
              <Icon name="arrow-right" size={14} />
            </Link>
          ) : (
            <ButtonLink href={routes.login} variant="secondary" size="sm" icon="arrow-right">
              Se connecter pour candidater
            </ButtonLink>
          )}
        </div>
        <ol className="grid border-t-2 border-fg sm:grid-cols-2 lg:col-span-8">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-5 border-b border-line py-6 sm:even:border-l sm:even:pl-8 sm:odd:pr-8"
            >
              <span aria-hidden className="type-numeral text-[2.75rem] text-accent-text">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1.5 pt-1">
                <p className="type-card">{step.title}</p>
                <p className="type-small text-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
