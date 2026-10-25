import Link from "next/link";
import type { ApplicationItem, CampaignItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { CAMPAIGN_STATUS_LABEL, plural } from "@/lib/format";
import { yearsLabel } from "@/lib/recruitment/model";
import { kindsLine } from "@/lib/recruitment/documents";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { MediaFrame } from "@/components/media/MediaFrame";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplyBar } from "@/components/recruitment/ApplyBar";
import { ApplyPanel } from "@/components/recruitment/ApplyPanel";
import { CampaignFaq } from "@/components/recruitment/CampaignFaq";
import { DeadlineStamp } from "@/components/recruitment/DeadlineStamp";
import { MyApplicationNote } from "@/components/recruitment/MyApplicationNote";
import { PositionBlock } from "@/components/recruitment/PositionBlock";
import { ProcessSteps } from "@/components/recruitment/ProcessSteps";
import { RequirementsList } from "@/components/recruitment/RequirementsList";
import { STATUS_TONE, isOpen, weeklyCommitment } from "@/components/recruitment/campaign-facts";

/** What candidates will be asked to attach, across positions ("CV — PDF ou Word, obligatoire pour 2 postes sur 3"). */
function requirements(campaign: CampaignItem): string[] {
  const seen = new Map<string, { label: string; kinds: string; required: number; asked: number }>();
  for (const p of campaign.positions) {
    for (const d of p.form?.documents ?? []) {
      const key = `${d.type}:${d.label}`;
      const entry = seen.get(key) ?? { label: d.label, kinds: kindsLine(d.fileTypes), required: 0, asked: 0 };
      entry.asked += 1;
      if (d.required) entry.required += 1;
      seen.set(key, entry);
    }
  }
  const total = campaign.positions.length;
  return [...seen.values()].map((d) => {
    const who = d.asked === total ? "" : ` (pour ${d.asked} poste${d.asked > 1 ? "s" : ""} sur ${total})`;
    const need = d.required === 0 ? ", facultatif" : d.required < d.asked ? ", obligatoire selon le poste" : ", obligatoire";
    return `${d.label} — ${d.kinds}${need}${who}`;
  });
}

/**
 * The fiche de recrutement: a paper document laid on the night chrome. Every
 * role with its real weekly time, what the form will ask for, who may apply,
 * the process as dated steps, and a person to write to. Shared by the public
 * page and the team's preview (`preview`: nothing on it acts).
 */
export function CampaignFiche({
  campaign,
  mine,
  signedIn,
  now,
  preview = false,
}: {
  campaign: CampaignItem;
  /** The student's applications to this campaign that still count. */
  mine: ApplicationItem[];
  signedIn: boolean;
  now: Date;
  preview?: boolean;
}) {
  const open = isOpen(campaign.status);
  const { association } = campaign;
  const weekly = weeklyCommitment(campaign.positions);
  const asked = requirements(campaign);
  const back = routes.campaign(campaign.slug);

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  const facts = [
    { label: "Postes", value: String(campaign.positions.length), numeric: true },
    campaign.seats !== null
      ? { label: "Places", value: String(campaign.seats), numeric: true }
      : { label: "Par personne", value: campaign.maxApplications > 1 ? `${campaign.maxApplications} postes` : "1 poste", numeric: false },
    { label: "Par semaine", value: weekly ?? "Selon le poste", numeric: Boolean(weekly) },
  ];

  return (
      <div className="mx-auto w-full max-w-[var(--wrap)] sm:px-[var(--gutter)]">
        <article data-surface="paper" aria-labelledby="fiche-titre" className="grain relative sm:rounded-sm">
          <span aria-hidden className="absolute inset-x-0 top-0 h-2 bg-assoc sm:rounded-t-sm" />

          <div className="px-[var(--gutter)] sm:px-8 lg:px-12 xl:px-16">
            {/* ---- Head of the document ---- */}
            <header className="grid gap-x-12 gap-y-9 border-b-2 border-fg pb-10 pt-10 sm:pt-12 lg:grid-cols-12 lg:pb-12">
              <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                  <AssociationIdentity association={association} showKind />
                  <StatusBadge tone={STATUS_TONE[campaign.status]} pulse={campaign.status === "derniere-chance"} className="lg:hidden">
                    {CAMPAIGN_STATUS_LABEL[campaign.status]}
                  </StatusBadge>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="type-label text-assoc-text">
                    Fiche de recrutement{campaign.academicYear ? ` · ${campaign.academicYear.replace("-", "–")}` : ""}
                  </p>
                  <h1 id="fiche-titre" className="type-title break-words hyphens-auto">
                    {campaign.title}
                  </h1>
                </div>
                <p className="max-w-2xl type-lead">{campaign.intro}</p>
                {campaign.status === "annulee" && (
                  <p className="flex items-start gap-2 rounded-sm border-2 border-fg bg-raised p-3 type-small font-semibold">
                    <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                    <span>
                      Recrutement annulé par l&apos;association.{campaign.cancellationReason ? ` Raison donnée : ${campaign.cancellationReason}` : ""}
                    </span>
                  </p>
                )}
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-7">
                  <dl className="grid min-w-0 flex-1 basis-72 grid-cols-3 border-t-2 border-fg">
                    {facts.map((f) => (
                      <div key={f.label} className="flex flex-col gap-1.5 border-l border-line px-3 pt-3 first:border-l-0 first:pl-0 sm:px-4">
                        <dt className="type-label text-muted">{f.label}</dt>
                        <dd className={f.numeric ? "type-numeral text-[2.25rem] sm:text-[2.75rem]" : "pt-1 text-[1rem] font-bold leading-tight"}>
                          {f.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <DeadlineStamp
                    closesAt={campaign.closesAt}
                    opensAt={campaign.opensAt}
                    status={campaign.status}
                    size="md"
                    tilt={-5}
                    className="mr-2"
                  />
                </div>
              </div>
              <div className="lg:col-span-5">
                <MediaFrame
                  photo={campaign.cover}
                  ratio="3/2"
                  slot="campaign-cover"
                  sizes="(min-width: 1024px) 36vw, (min-width: 640px) 90vw, 100vw"
                  priority
                  fallback={{ title: campaign.title, accent: association.accent, kicker: association.name }}
                  className="rounded-xs border-2 border-fg"
                />
              </div>
            </header>

            {/* ---- Body + sticky apply ticket ---- */}
            <div className="grid gap-x-12 gap-y-14 py-10 sm:py-14 lg:grid-cols-12">
              <div className="flex min-w-0 flex-col gap-16 lg:col-span-8">
                <MyApplicationNote applications={mine} />
                {!open && (
                  <div className="lg:hidden">
                    <ApplyPanel campaign={campaign} mine={mine} signedIn={signedIn} headingId="candidater-phone" preview={preview} now={now} />
                  </div>
                )}

                {campaign.description.length > 0 && (
                  <section aria-labelledby="presentation">
                    <SectionHeader id="presentation" index={nextIndex()} kicker="Le recrutement" title="En quelques mots" />
                    <div className="mt-6 flex max-w-3xl flex-col gap-4">
                      {campaign.description.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                  </section>
                )}

                <section id="postes" aria-labelledby="postes-titre" className="scroll-mt-[calc(var(--header-h)+1.5rem)]">
                  <SectionHeader
                    id="postes-titre"
                    index={nextIndex()}
                    kicker={campaign.seats !== null ? `${plural(campaign.positions.length, "poste")} · ${plural(campaign.seats, "place")}` : plural(campaign.positions.length, "poste")}
                    title="Les postes"
                    description={
                      campaign.maxApplications > 1
                        ? `Tu peux candidater à ${campaign.maxApplications} postes de ce recrutement au plus.`
                        : "Un poste par personne pour ce recrutement."
                    }
                  />
                  <div className="mt-6">
                    {campaign.positions.map((p, i) => (
                      <PositionBlock
                        key={p.id}
                        position={p}
                        campaign={campaign}
                        index={i + 1}
                        total={campaign.positions.length}
                        mine={mine.find((a) => a.position.id === p.id)}
                        back={back}
                        preview={preview}
                      />
                    ))}
                  </div>
                </section>

                {(campaign.eligibleYears || campaign.eligibilityNote) && (
                  <section aria-labelledby="qui">
                    <SectionHeader id="qui" index={nextIndex()} kicker="Avant de te lancer" title="Qui peut candidater" />
                    <div className="mt-6 flex max-w-2xl flex-col gap-3">
                      {campaign.eligibleYears && (
                        <p>
                          <strong>{yearsLabel(campaign.eligibleYears)}</strong>, d&apos;après l&apos;année d&apos;études indiquée dans ton
                          profil (certains postes peuvent avoir leur propre règle, notée sur le poste).
                        </p>
                      )}
                      {campaign.eligibilityNote && <p className="text-muted">{campaign.eligibilityNote}</p>}
                    </div>
                  </section>
                )}

                {campaign.process.length > 0 && (
                  <section aria-labelledby="deroule">
                    <SectionHeader id="deroule" index={nextIndex()} kicker="Le déroulé" title="Comment ça se passe" />
                    <div className="mt-8">
                      <ProcessSteps steps={campaign.process} now={now} />
                    </div>
                  </section>
                )}

                {asked.length > 0 && (
                  <section aria-labelledby="demande">
                    <SectionHeader
                      id="demande"
                      index={nextIndex()}
                      kicker="À préparer"
                      title="Ce qu'on te demandera"
                      description="Prépare-les avant d'ouvrir le formulaire, tu iras plus vite."
                    />
                    <RequirementsList items={asked} className="mt-8 max-w-2xl" />
                  </section>
                )}

                {campaign.faq.length > 0 && (
                  <section aria-labelledby="faq">
                    <SectionHeader id="faq" index={nextIndex()} kicker="Ce qu'on nous demande" title="Questions fréquentes" />
                    <div className="mt-4">
                      <CampaignFaq items={campaign.faq} />
                    </div>
                  </section>
                )}

                <section aria-labelledby="contact">
                  <SectionHeader id="contact" index={nextIndex()} kicker="Une question ?" title="Qui recrute" />
                  <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-0">
                    <div className="flex flex-col items-start gap-4 sm:pr-8">
                      <p className="type-label text-muted">L&apos;association</p>
                      <AssociationIdentity association={association} size="lg" showKind link={false} />
                      <Link
                        href={routes.association(association.slug)}
                        className="inline-flex items-center gap-1.5 type-small font-bold hover:text-assoc-text"
                      >
                        Voir la page de {association.shortName ?? association.name}
                        <Icon name="arrow-right" size={16} />
                      </Link>
                    </div>
                    {campaign.contact && (
                      <div className="flex flex-col items-start gap-4 border-t border-line pt-8 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                        <p className="type-label text-muted">Avant de candidater, écris à</p>
                        {campaign.contact.name && (
                          <div className="flex items-center gap-3.5">
                            <span aria-hidden>
                              <Avatar name={campaign.contact.name} accent={association.accent} size={56} />
                            </span>
                            <div className="flex flex-col">
                              <p className="type-card">{campaign.contact.name}</p>
                              {campaign.contact.role && <p className="type-small text-muted">{campaign.contact.role}</p>}
                            </div>
                          </div>
                        )}
                        {campaign.contact.email && (
                          <a
                            href={`mailto:${campaign.contact.email}`}
                            className="inline-flex max-w-full items-center gap-2 type-meta font-bold hover:text-assoc-text"
                          >
                            <Icon name="mail" size={16} className="shrink-0" />
                            <span className="break-all">{campaign.contact.email}</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="hidden lg:col-span-4 lg:block">
                <div className="sticky top-[calc(var(--header-h)+1.5rem)]">
                  <ApplyPanel campaign={campaign} mine={mine} signedIn={signedIn} headingId="candidater" preview={preview} now={now} />
                </div>
              </div>
            </div>
          </div>

          {/* Phone: last child of the fiche, so it docks above the tab bar while reading. */}
          {!preview && <ApplyBar campaign={campaign} mine={mine} now={now} />}
        </article>
      </div>
  );
}
