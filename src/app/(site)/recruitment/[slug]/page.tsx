import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ApplicationItem, CampaignItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { CAMPAIGN_STATUS_LABEL, plural } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getCampaign, getCampaigns } from "@/lib/data/recruitment";
import { getApplicationForm } from "@/lib/data/recruitment-forms";
import { getApplications } from "@/lib/data/users";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { MediaFrame } from "@/components/media/MediaFrame";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplyBar } from "@/components/recruitment/ApplyBar";
import { ApplyPanel } from "@/components/recruitment/ApplyPanel";
import { ApplyProvider } from "@/components/recruitment/ApplyProvider";
import { CampaignCard } from "@/components/recruitment/CampaignCard";
import { CampaignFaq } from "@/components/recruitment/CampaignFaq";
import { DeadlineStamp } from "@/components/recruitment/DeadlineStamp";
import { MyApplicationNote } from "@/components/recruitment/MyApplicationNote";
import { PositionBlock } from "@/components/recruitment/PositionBlock";
import { ProcessSteps } from "@/components/recruitment/ProcessSteps";
import { RequirementsList } from "@/components/recruitment/RequirementsList";
import { toApplyForm } from "@/components/recruitment/apply-form";
import {
  STATUS_TONE,
  findApplication,
  isOpen,
  weeklyCommitment,
} from "@/components/recruitment/campaign-facts";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getCampaign(slug);
  if (!campaign) return { title: "Recrutement introuvable" };
  return {
    title: `${campaign.title} · ${campaign.association.name}`,
    description: campaign.intro,
  };
}

/**
 * The fiche de poste: a paper document laid on the night chrome. Clear,
 * structured, reassuring — every role with its real weekly time, the
 * process as dated steps, what you'll be asked for, and a person to write
 * to. The apply dialog only exists while the campaign is open.
 */
export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;
  const campaign = await getCampaign(slug);
  if (!campaign) notFound();

  const now = new Date();
  const session = await getSession();
  const open = isOpen(campaign.status);
  const [spec, applications, others] = await Promise.all([
    getApplicationForm(campaign.id),
    session.user ? getApplications(session.user.id) : Promise.resolve<ApplicationItem[]>([]),
    open ? Promise.resolve<CampaignItem[]>([]) : getCampaigns({ scope: "open" }),
  ]);
  const mine = findApplication(applications, campaign.id);
  const appliedPosition = mine && mine.status !== "brouillon" ? mine.positionId : undefined;
  const { association } = campaign;
  const weekly = weeklyCommitment(campaign.positions);

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  const facts = [
    { label: "Postes", value: String(campaign.positions.length), numeric: true },
    { label: "Places", value: String(campaign.seats), numeric: true },
    { label: "Par semaine", value: weekly ?? "Selon le poste", numeric: Boolean(weekly) },
  ];

  const fiche = (
    <div data-accent={association.accent} className="pb-[var(--section)]">
      <div className="wrap pb-5 pt-6 sm:pt-8">
        <Breadcrumbs
          items={[
            { href: routes.recruitment, label: "Recrutements" },
            { href: routes.campaign(campaign.slug), label: campaign.title },
          ]}
        />
      </div>

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
                  <p className="type-label text-assoc-text">Fiche de recrutement</p>
                  <h1 id="fiche-titre" className="type-title break-words hyphens-auto">
                    {campaign.title}
                  </h1>
                </div>
                <p className="max-w-2xl type-lead">{campaign.intro}</p>
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-7">
                  <dl className="grid min-w-0 flex-1 basis-72 grid-cols-3 border-t-2 border-fg">
                    {facts.map((f) => (
                      <div
                        key={f.label}
                        className="flex flex-col gap-1.5 border-l border-line px-3 pt-3 first:border-l-0 first:pl-0 sm:px-4"
                      >
                        <dt className="type-label text-muted">{f.label}</dt>
                        <dd
                          className={
                            f.numeric
                              ? "type-numeral text-[2.25rem] sm:text-[2.75rem]"
                              : "pt-1 text-[1rem] font-bold leading-tight"
                          }
                        >
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
                {mine && <MyApplicationNote application={mine} now={now} />}
                {!open && (
                  <div className="lg:hidden">
                    <ApplyPanel campaign={campaign} mine={mine} signedIn={Boolean(session.user)} headingId="candidater-phone" now={now} />
                  </div>
                )}

                <section aria-labelledby="postes">
                  <SectionHeader
                    id="postes"
                    index={nextIndex()}
                    kicker={`${plural(campaign.positions.length, "poste")} · ${plural(campaign.seats, "place")}`}
                    title="Les postes"
                  />
                  <div className="mt-6">
                    {campaign.positions.map((p, i) => (
                      <PositionBlock
                        key={p.id}
                        position={p}
                        campaign={campaign}
                        index={i + 1}
                        total={campaign.positions.length}
                        applied={p.id === appliedPosition}
                        now={now}
                      />
                    ))}
                  </div>
                </section>

                {campaign.process.length > 0 && (
                  <section aria-labelledby="deroule">
                    <SectionHeader id="deroule" index={nextIndex()} kicker="Le déroulé" title="Comment ça se passe" />
                    <div className="mt-8">
                      <ProcessSteps steps={campaign.process} now={now} />
                    </div>
                  </section>
                )}

                {campaign.requirements.length > 0 && (
                  <section aria-labelledby="demande">
                    <SectionHeader
                      id="demande"
                      index={nextIndex()}
                      kicker="À préparer"
                      title="Ce qu'on te demandera"
                      description="Prépare-les avant d'ouvrir le formulaire, tu iras plus vite."
                    />
                    <RequirementsList items={campaign.requirements} className="mt-8 max-w-2xl" />
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
                    <div className="flex flex-col items-start gap-4 border-t border-line pt-8 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                      <p className="type-label text-muted">Avant de candidater, écris à</p>
                      <div className="flex items-center gap-3.5">
                        <span aria-hidden>
                          <Avatar name={campaign.contact.name} accent={association.accent} size={56} />
                        </span>
                        <div className="flex flex-col">
                          <p className="type-card">{campaign.contact.name}</p>
                          <p className="type-small text-muted">{campaign.contact.role}</p>
                        </div>
                      </div>
                      <a
                        href={`mailto:${campaign.contact.email}`}
                        className="inline-flex max-w-full items-center gap-2 type-meta font-bold hover:text-assoc-text"
                      >
                        <Icon name="mail" size={16} className="shrink-0" />
                        <span className="break-all">{campaign.contact.email}</span>
                      </a>
                    </div>
                  </div>
                </section>
              </div>

              <div className="hidden lg:col-span-4 lg:block">
                <div className="sticky top-[calc(var(--header-h)+1.5rem)]">
                  <ApplyPanel campaign={campaign} mine={mine} signedIn={Boolean(session.user)} headingId="candidater" now={now} />
                </div>
              </div>
            </div>
          </div>

          {/* Phone: last child of the fiche, so it docks above the tab bar while reading. */}
          <ApplyBar campaign={campaign} mine={mine} now={now} />
        </article>
      </div>

      {!open && others.length > 0 && (
        <section aria-labelledby="encore-ouverts" className="wrap pt-[var(--section)]">
          <SectionHeader
            id="encore-ouverts"
            kicker={plural(others.length, "recrutement")}
            title={campaign.status === "cloturee" ? "Encore ouverts" : "Déjà ouverts"}
            action={{ href: `${routes.recruitment}?scope=open`, label: "Tout voir" }}
          />
          <div className="rail mt-8">
            {others.map((c) => (
              <CampaignCard key={c.id} campaign={c} className="w-[17.5rem] sm:w-[20rem]" />
            ))}
          </div>
        </section>
      )}
    </div>
  );

  if (!open) return fiche;
  return <ApplyProvider form={toApplyForm({ campaign, spec, session, mine, now })}>{fiche}</ApplyProvider>;
}
