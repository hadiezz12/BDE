import type { Metadata } from "next";
import type { SafetyContact } from "@/lib/types";
import { getSafetyDirectory } from "@/lib/data/safety";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { CampusContact } from "@/components/safety/CampusContact";
import { CommitmentList } from "@/components/safety/CommitmentList";
import { HotlineRow } from "@/components/safety/HotlineRow";
import { ReportForm } from "@/components/safety/ReportForm";
import { StepList, type SafetyStep } from "@/components/safety/StepList";

export const metadata: Metadata = {
  title: "VSS / VDH",
  description:
    "Violences sexistes et sexuelles, harcèlement, discriminations : les engagements du Very Pink Club, un canal d'alerte confidentiel et les numéros d'urgence.",
};

const ON_THIS_PAGE = [
  { href: "#engagements", label: "Nos engagements" },
  { href: "#tout-de-suite", label: "Tout de suite" },
  { href: "#a-qui-parler", label: "À qui parler" },
  { href: "#alerte", label: "Déposer une alerte" },
];

/*
 * Copy rule for this page: the BDE's own words (title, intro, the six
 * commitments, the alert form) and real public resources only. No name,
 * room, e-mail, phone or opening hours that the BDE or the school has not
 * given. The steps below are general safety advice, and only mention what
 * the commitments promise (référent·es, security staff).
 */

const IF_ITS_YOU: SafetyStep[] = [
  {
    title: "Mets-toi à l'abri",
    body: "Éloigne-toi, rejoins quelqu'un de confiance ou un·e référent·e du bureau. En danger : 17 ou 112, ou le 114 par SMS si tu ne peux pas parler.",
  },
  {
    title: "Tu n'as rien à prouver",
    body: "Il n'y a pas de bonne façon de réagir. Tu choisis quoi dire, à qui, et quand.",
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
    body: "Une question banale, un prétexte pour emmener la personne ailleurs : souvent, ça suffit à casser la situation.",
  },
  {
    title: "Ne reste pas seul·e",
    body: "Préviens un·e référent·e du bureau ou le staff de sécurité. Si c'est grave : 17 ou 112.",
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

/**
 * Who to talk to at GEM while no campus contact has been confirmed: only what
 * the BDE's commitments say (02 to 05). The school's VSS cell exists, but its
 * details are not known: it gets a "Coordonnées à venir" tag, never a fake one.
 */
const AT_GEM: { contact: SafetyContact; pending?: string }[] = [
  {
    contact: {
      id: "referent-es-bureau",
      runBy: "Very Pink Club · le BDE",
      name: "Les référent·es du bureau",
      summary:
        "Des membres du bureau formé·es à l'accueil des victimes, identifiables sur chaque événement. Toute l'année, le canal d'alerte ci-dessous : chaque alerte est lue par le bureau, avec une réponse au contact indiqué dans les 48 h.",
    },
  },
  {
    contact: {
      id: "cellule-vss-ecole",
      runBy: "GEM Alpine Business School",
      name: "La cellule VSS de l'école",
      summary:
        "L'école a sa cellule VSS. Le bureau t'oriente vers elle, vers les associations spécialisées et, si tu le souhaites, t'accompagne au dépôt de plainte.",
    },
    pending: "Coordonnées à venir",
  },
];

const HOW_IT_WILL_WORK = [
  "Aucun compte à créer, aucun nom obligatoire.",
  "Lieu, date, catégorie, et un moyen de te joindre : c'est tout ce qu'on te demande.",
  "Chaque alerte est lue par le bureau, et une réponse est apportée au contact indiqué dans les 48 h.",
];

export default async function SafetyPage() {
  const { emergency, listening, contacts, commitments, alertKinds } = await getSafetyDirectory();
  const phoneLines = [...emergency, ...listening].filter((h) => /^\d+$/.test(h.number));
  const atGem = contacts.length > 0 ? contacts.map((contact) => ({ contact, pending: undefined })) : AT_GEM;

  return (
    <>
      {/* Opening: what this page is about, then the emergency numbers before anything else. */}
      <header className="wrap grid gap-10 pb-12 pt-10 sm:pt-16 lg:grid-cols-12 lg:gap-8 lg:pb-16">
        <div className="lg:col-span-7">
          <p className="flex items-center gap-2 type-label text-warn">
            <Icon name="shield" size={16} />
            Sécurité · VSS / VDH
          </p>
          <h1 className="mt-4 max-w-3xl type-title">Violences sexistes et sexuelles, harcèlement, discriminations</h1>
          <p className="mt-6 max-w-2xl type-lead text-muted">
            Le Very Pink Club prend ses responsabilités : ce que nous nous engageons à faire, sur chaque événement et
            toute l&apos;année. Et juste en dessous, un canal d&apos;alerte confidentiel pour les victimes, à GEM comme
            sur nos événements.
          </p>
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
          <p className="mt-2 type-small text-muted">Gratuits, 24 h/24.</p>
          <ul className="mt-1 divide-y divide-line">
            {emergency.map((h) => (
              <li key={h.id}>
                <HotlineRow hotline={h} size="lg" />
              </li>
            ))}
          </ul>
        </aside>
      </header>

      {/* The BDE's six commitments, in its own words. */}
      <section id="engagements" aria-labelledby="engagements-titre" className="wrap pb-section">
        <SectionHeader id="engagements-titre" index="01" kicker="Nos engagements" title="Ce à quoi nous nous tenons" />
        <CommitmentList commitments={commitments} className="mt-8" />
      </section>

      <section id="tout-de-suite" aria-labelledby="tout-de-suite-titre" className="wrap pb-section">
        <SectionHeader id="tout-de-suite-titre" index="02" kicker="Tout de suite" title="Ce que tu peux faire maintenant" />
        <div className="mt-10 grid gap-14 lg:grid-cols-2 lg:gap-16">
          <StepList id="si-cest-toi" title="Si c'est toi" steps={IF_ITS_YOU} />
          <StepList id="si-tu-es-temoin" title="Si tu es témoin" steps={IF_YOU_SAW} />
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
            description="Pour toi ou pour quelqu'un d'autre. Tu peux t'arrêter quand tu veux."
          />
          <div className="mt-10 grid gap-14 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <h3 className="mb-4 type-label text-muted">À GEM</h3>
              {atGem.map(({ contact, pending }) => (
                <CampusContact key={contact.id} contact={contact} pending={pending} />
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
                kicker="Canal d'alerte confidentiel"
                title="Confidentiel, en deux minutes"
                description="Tu peux déposer une alerte pour une victime de VSS ou de VDH à GEM ou sur un événement de GEM. Ton nom n'est pas obligatoire : il nous faut juste un moyen de te joindre pour te répondre."
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
              <ReportForm helplines={phoneLines.map(({ number, href }) => ({ number, href }))} kinds={alertKinds} />
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
