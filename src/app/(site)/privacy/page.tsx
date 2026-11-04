import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDateLong } from "@/lib/format";
import { getPublishedNotice } from "@/lib/privacy/data";
import { DRAFT_VERSION, NOTICE_SECTIONS, PENDING_FACTS } from "@/lib/privacy/notice";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Confidentialité",
  description: "Les données que le site garde sur toi, pourquoi, qui les voit, combien de temps, et comment exercer tes droits.",
};

/**
 * /privacy — the privacy notice, for everyone (no sign-in). The version the
 * controller approved, as recorded in the database with its exact text;
 * until then, the draft from the code, said to be a draft, with the facts
 * still missing listed (never a placeholder in their place).
 */
export default async function PrivacyNoticePage() {
  const published = await getPublishedNotice();
  const current = published?.current ?? null;
  const sections = current?.sections ?? NOTICE_SECTIONS;

  return (
    <div data-surface="paper" className="grain pb-[var(--section)]">
      <PageHeader
        variant="document"
        kicker="Vie privée"
        title="Confidentialité"
        intro="Ce que le site garde sur toi, pourquoi, qui le voit, combien de temps, et comment exercer tes droits — en clair."
        meta={
          current ? (
            <span>
              Version {current.version} · approuvée le {formatDateLong(`${current.approved_on}T12:00:00Z`)} par {current.approved_by} · en
              vigueur depuis le {formatDateLong(current.effective_at)}
            </span>
          ) : (
            <span>Projet de notice ({DRAFT_VERSION}) · pas encore approuvé</span>
          )
        }
      />

      <div className="wrap grid gap-x-8 gap-y-12 lg:grid-cols-12">
        <article className="flex min-w-0 flex-col gap-14 lg:col-span-8">
          {!current && (
            <section aria-labelledby="statut-titre" className="flex flex-col gap-3 rounded-md border-2 border-warn/60 bg-raised p-5">
              <h2 id="statut-titre" className="flex items-center gap-2 font-bold">
                <Icon name="alert" size={18} className="text-warn" /> Projet, pas encore validé
              </h2>
              <p className="text-muted">
                Cette notice décrit le fonctionnement réel du site. Elle doit encore être approuvée par le responsable du traitement,
                qui complétera les points suivants avant l&apos;ouverture du site au public :
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 type-small">
                {PENDING_FACTS.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
            </section>
          )}
          {sections.map((s, i) => (
            <section key={s.heading} aria-labelledby={`notice-${i}`}>
              <SectionHeader id={`notice-${i}`} index={String(i + 1).padStart(2, "0")} title={s.heading} />
              <div className="mt-5 flex max-w-prose flex-col gap-4">
                {s.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </article>

        <aside className="flex flex-col gap-6 lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-col gap-3 rounded-md border border-line-strong bg-raised p-5">
            <h2 className="type-label text-accent-text">Tes données</h2>
            <p className="type-small text-muted">Télécharge-les tout de suite, ou fais une demande (correction, effacement…) et suis-la.</p>
            <ButtonLink href={routes.accountPrivacy} icon="arrow-right" className="self-start">
              Mes données
            </ButtonLink>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-line bg-raised p-5 type-small">
            <h2 className="type-label text-subtle">Aussi</h2>
            <Link href={routes.cookies} className="font-semibold hover:text-accent-text">
              Cookies
            </Link>
            <Link href={routes.legal} className="font-semibold hover:text-accent-text">
              Mentions légales
            </Link>
          </div>
          {published && published.history.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-line bg-raised p-5 type-small">
              <h2 className="type-label text-subtle">Versions approuvées</h2>
              <ul className="flex flex-col gap-1.5">
                {published.history.map((v) => (
                  <li key={v.version}>
                    <span className="font-semibold">{v.version}</span> · en vigueur le {formatDateLong(v.effective_at)}
                  </li>
                ))}
              </ul>
              {published.upcoming && (
                <p className="text-muted">
                  Prochaine version {published.upcoming.version} le {formatDateLong(published.upcoming.effective_at)}.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
