import type { Metadata } from "next";
import { getSafetyDirectory } from "@/lib/data/safety";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { Armband } from "@/components/safety/Armband";
import { CampusContact } from "@/components/safety/CampusContact";
import { HotlineRow } from "@/components/safety/HotlineRow";
import { ReportForm } from "@/components/safety/ReportForm";
import { StepList, type SafetyStep } from "@/components/safety/StepList";

export const metadata: Metadata = {
  title: "VSS / VDH : trouver de l'aide",
  description:
    "Victime ou témoin de violences sexistes et sexuelles, de harcèlement ou de discrimination : numéros d'urgence, référent·es en soirée, cellules d'écoute et alerte anonyme.",
};

const ON_THIS_PAGE = [
  { href: "#tout-de-suite", label: "Tout de suite" },
  { href: "#en-soiree", label: "En soirée" },
  { href: "#a-qui-parler", label: "À qui parler" },
  { href: "#alerte", label: "Signaler anonymement" },
];

const IF_ITS_YOU: SafetyStep[] = [
  {
    title: "Mets-toi à l'abri",
    body: "Éloigne-toi, rejoins quelqu'un de confiance, la safe zone ou un·e référent·e au brassard rose. En danger : 17 ou 112, ou le 114 par SMS si tu ne peux pas parler.",
  },
  {
    title: "Tu n'as rien à prouver",
    body: "Il n'y a pas de bonne façon de réagir, et pas de délai pour en parler : ce soir, demain ou dans six mois.",
  },
  {
    title: "Garde des traces, si tu peux",
    body: "Captures d'écran, messages, heure, lieu, noms de témoins. Ne supprime rien, même si tu ne sais pas encore quoi en faire.",
  },
  {
    title: "Pense à ta santé",
    body: "Après une agression sexuelle, consulte vite un médecin ou les urgences : la contraception d'urgence et le traitement préventif du VIH sont plus efficaces dans les premières heures.",
  },
];

const IF_YOU_SAW: SafetyStep[] = [
  {
    title: "Crée une diversion",
    body: "Une question banale, un prétexte pour emmener la personne ailleurs (« tu viens au vestiaire ? ») : souvent, ça suffit à casser la situation.",
  },
  {
    title: "Ne reste pas seul·e",
    body: "Préviens un·e référent·e au brassard rose, le staff ou la sécurité de la salle. Si c'est grave : 17 ou 112.",
  },
  {
    title: "Va voir la personne après",
    body: "Demande-lui si ça va et ce dont elle a besoin. Écoute, ne décide pas à sa place, ne la presse pas de questions.",
  },
  {
    title: "Ne publie rien",
    body: "Si tu as noté ou filmé quelque chose, donne-le à la personne concernée : c'est elle qui décide de ce qu'on en fait.",
  },
];

const HOW_IT_WILL_WORK = [
  "Pas de compte, pas de nom : tu peux rester anonyme.",
  "Pour toi ou pour quelqu'un d'autre, même si tu n'es pas sûr·e.",
  "Lue par la cellule VSS & VDH du BDE, pas par le bureau.",
  "Une alerte n'est pas une plainte : la plainte se dépose au commissariat ou à la gendarmerie.",
];

export default async function SafetyPage() {
  const { emergency, listening, contacts, practices } = await getSafetyDirectory();
  const phoneLines = [...emergency, ...listening].filter((h) => /^\d+$/.test(h.number));

  return (
    <>
      {/* Opening: who this is for, then the emergency numbers before anything else. */}
      <header className="wrap grid gap-10 pb-12 pt-10 sm:pt-16 lg:grid-cols-12 lg:gap-8 lg:pb-16">
        <div className="lg:col-span-7">
          <p className="flex items-center gap-2 type-label text-warn">
            <Icon name="shield" size={16} />
            Sécurité · VSS / VDH
          </p>
          <h1 className="mt-4 max-w-3xl type-title">Tu es victime ou témoin ? Voilà ce que tu peux faire.</h1>
          <div className="mt-6 flex max-w-2xl flex-col gap-4 type-lead text-muted">
            <p>
              Violences sexistes et sexuelles, harcèlement, discriminations : à une soirée, en cours, en ligne ou en
              coloc. Ce n&apos;est jamais ta faute.
            </p>
            <p>Tu n&apos;as pas besoin d&apos;être sûr·e de toi pour en parler. Tu choisis quoi dire, à qui, et quand.</p>
          </div>
          <nav aria-label="Sur cette page" className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {ON_THIS_PAGE.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="inline-flex min-h-10 items-center rounded-sm border-2 border-line-strong/60 px-3.5 type-button text-[0.78rem] transition-colors hover:border-fg"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <aside
          aria-labelledby="danger-immediat"
          className="self-start rounded-md border-2 border-warn px-5 pt-5 sm:px-7 sm:pt-6 lg:col-span-5"
        >
          <div className="flex items-center gap-2 text-warn">
            <Icon name="alert" size={18} />
            <h2 id="danger-immediat" className="type-label">
              Danger immédiat
            </h2>
          </div>
          <p className="mt-2 type-small text-muted">Appels gratuits, 24 h/24.</p>
          <ul className="mt-1 divide-y divide-line">
            {emergency.map((h) => (
              <li key={h.id}>
                <HotlineRow hotline={h} size="lg" />
              </li>
            ))}
          </ul>
        </aside>
      </header>

      <section id="tout-de-suite" aria-labelledby="tout-de-suite-titre" className="wrap pb-section">
        <SectionHeader id="tout-de-suite-titre" index="01" kicker="Tout de suite" title="Ce que tu peux faire maintenant" />
        <div className="mt-10 grid gap-14 lg:grid-cols-2 lg:gap-16">
          <StepList id="si-cest-toi" title="Si c'est toi" steps={IF_ITS_YOU} />
          <StepList id="si-tu-es-temoin" title="Si tu es témoin" steps={IF_YOU_SAW} />
        </div>
      </section>

      <section id="en-soiree" aria-labelledby="en-soiree-titre" className="wrap pb-section">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <SectionHeader
              id="en-soiree-titre"
              index="02"
              kicker="Pendant nos soirées"
              title="Cherche le brassard rose"
              description="À chaque événement du Very Pink Club, des référent·es VSS & VDH formé·es tournent toute la nuit. Va vers elles et eux pour toi, pour un·e ami·e, ou juste pour souffler."
            />
            <Armband className="mt-6 lg:mt-10" />
          </div>
          <dl className="border-b border-line lg:col-span-7 lg:pt-14">
            {practices.map((p) => (
              <div
                key={p.label}
                className="grid gap-1.5 border-t border-line py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 sm:py-5"
              >
                <dt className="type-label text-fg sm:pt-1">{p.label}</dt>
                <dd className="text-muted">{p.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Paper: the calm, document-like part — people to talk to, and the form. */}
      <div data-surface="paper" className="grain">
        <section id="a-qui-parler" aria-labelledby="a-qui-parler-titre" className="wrap py-section">
          <SectionHeader
            id="a-qui-parler-titre"
            index="03"
            kicker="Quand tu veux"
            title="À qui parler"
            description="Ce soir, demain ou dans six mois. Tu peux venir seul·e ou accompagné·e, et t'arrêter quand tu veux."
          />
          <div className="mt-10 grid gap-14 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <h3 className="mb-4 type-label text-muted">Sur le campus</h3>
              {contacts.map((c) => (
                <CampusContact key={c.id} contact={c} />
              ))}
            </div>
            <div className="lg:col-span-5 lg:pl-4">
              <h3 className="mb-4 type-label text-muted">Partout en France</h3>
              <ul className="divide-y divide-line border-y-2 border-fg">
                {listening.map((h) => (
                  <li key={h.id}>
                    <HotlineRow hotline={h} headingLevel={4} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="alerte" aria-labelledby="alerte-titre" className="wrap pb-section">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4">
              <SectionHeader
                id="alerte-titre"
                index="04"
                kicker="Signaler"
                title="Déposer une alerte anonyme"
                description="Pour que la cellule sache ce qui se passe, même si tu ne veux pas aller plus loin."
              />
              <h3 className="mt-8 type-label text-muted">Comment ça marchera</h3>
              <ul className="mt-3 flex flex-col gap-3">
                {HOW_IT_WILL_WORK.map((line) => (
                  <li key={line} className="flex gap-3">
                    <Icon name="check" size={18} className="mt-0.5 shrink-0 text-ok" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              <ReportForm helplines={phoneLines.map(({ number, href }) => ({ number, href }))} />
            </div>
          </div>
        </section>
      </div>

      {/* Last word before the footer: the numbers again, for whoever scrolled straight down. */}
      <aside aria-labelledby="aide-maintenant" className="wrap py-10 sm:py-14">
        <div className="flex flex-col gap-5 border-t-2 border-warn pt-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="aide-maintenant" className="type-section">
            Besoin d&apos;aide maintenant ?
          </h2>
          <ul className="flex flex-wrap gap-x-7 gap-y-3">
            {phoneLines.map((h) => (
              <li key={h.id}>
                <a href={h.href} className="group inline-flex min-h-11 items-baseline gap-2.5">
                  <span className="type-numeral text-[2.5rem] text-warn">{h.number}</span>
                  <span className="type-meta text-muted group-hover:text-fg">{h.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}
