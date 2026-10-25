import type { Metadata } from "next";
import Link from "next/link";
import type { CampaignItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { formatDayMonth, plural } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getAssociationsByIds } from "@/lib/data/associations";
import { getCampaigns, getRecruitmentFacets } from "@/lib/data/recruitment";
import { getMyApplications } from "@/lib/recruitment/me";
import { VIEW_LABEL, isRefined, parseRecruitmentFilters, recruitmentHref, type RecruitmentFilters } from "@/lib/recruitment/model";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { CampaignRow } from "@/components/recruitment/CampaignRow";
import { HowItWorks } from "@/components/recruitment/HowItWorks";
import { RecruitmentFilterBar } from "@/components/recruitment/RecruitmentFilterBar";
import { isActiveApplication, isOpen, personalNote } from "@/components/recruitment/campaign-facts";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const f = parseRecruitmentFilters(await searchParams);
  return {
    title: "Recrutements",
    description:
      "Les recrutements des associations de GEM Alpine Business School — Paris : missions, temps demandé, places et date limite.",
    // Filtered lists are not separate pages for search engines.
    robots: isRefined(f) ? { index: false, follow: true } : undefined,
    alternates: { canonical: routes.recruitment },
  };
}

const PAGE = 50;

/**
 * /recruitment — the directory. Published campaigns of public association
 * pages (public_recruitment_campaigns, read as a visitor): by default what
 * is current (open, paused, opening later), grouped; the chips and the form
 * narrow it (closing this week, closed, an association, a school year, a
 * search). A signed-in student sees their own drafts and applications on the
 * matching rows (my_applications); nobody sees anyone else's.
 */
export default async function RecruitmentPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseRecruitmentFilters(await searchParams);
  const session = await getSession();
  const [facets, campaigns, applications, managed] = await Promise.all([
    getRecruitmentFacets(),
    getCampaigns({
      view: filters.view,
      association: filters.association,
      academicYear: filters.year,
      q: filters.q || null,
      limit: PAGE,
      offset: filters.offset,
    }),
    getMyApplications(),
    getAssociationsByIds(session.user?.managedAssociationIds ?? []),
  ]);
  const refined = isRefined(filters);
  const nothingOnline = facets.current + facets.closed === 0;
  const active = applications.filter((a) => isActiveApplication(a.status));
  const noteFor = (c: CampaignItem) => personalNote(applications, c.id);

  const open = campaigns.filter((c) => isOpen(c.status));
  const paused = campaigns.filter((c) => c.status === "en-pause");
  const upcoming = campaigns.filter((c) => c.status === "a-venir");

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");
  const rows = (list: CampaignItem[]) => (
    <div className="mt-6 border-b border-line-strong">
      {list.map((c) => (
        <CampaignRow key={c.id} campaign={c} note={noteFor(c)} />
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        kicker="Recrutements"
        title={
          <>
            {facets.open > 0 ? "Ça recrute" : "Recrutements"}
            <span className="text-accent-text">.</span>
          </>
        }
        aside={
          facets.open_positions > 0 ? (
            <Sticker tone="ok" tilt={-3}>
              {plural(facets.open_positions, "poste ouvert", "postes ouverts")}
            </Sticker>
          ) : undefined
        }
        intro="Les assos publient ici leurs recrutements : chaque fiche dit ce que tu feras vraiment, combien de temps ça prend et jusqu'à quand tu peux candidater."
      >
        {!nothingOnline && <RecruitmentFilterBar filters={filters} facets={facets} />}
      </PageHeader>

      {nothingOnline ? (
        <section aria-labelledby="recrutements-a-venir" className="wrap pb-16 pt-4 sm:pb-20 sm:pt-8">
          <h2 id="recrutements-a-venir" className="sr-only">
            Les recrutements
          </h2>
          <EmptyState
            mark={<Icon name="megaphone" size={44} />}
            title="Les recrutements arrivent"
            actions={
              managed.length > 0 ? (
                managed.map((a) => (
                  <ButtonLink key={a.id} href={routes.manageRecruitment(a.slug)} icon="arrow-right">
                    Préparer un recrutement · {a.shortName ?? a.name}
                  </ButtonLink>
                ))
              ) : (
                <ButtonLink href={routes.associations} variant="secondary" icon="arrow-right">
                  Voir les associations
                </ButtonLink>
              )
            }
          >
            Aucune campagne n&apos;est publiée pour l&apos;instant. Chaque asso ouvrira ici ses recrutements, avec les missions
            de chaque poste, le temps que ça prend et la date limite.
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="wrap">
            <PersonalLine signedIn={Boolean(session.user)} active={active.length} />
          </div>

          {refined ? (
            <section aria-labelledby="resultats" className="wrap pb-16 pt-12 sm:pb-20 sm:pt-16">
              <SectionHeader
                id="resultats"
                index={nextIndex()}
                kicker={plural(campaigns.length + filters.offset, "recrutement")}
                title={summaryTitle(filters)}
              />
              {campaigns.length > 0 ? (
                rows(campaigns)
              ) : (
                <EmptyState
                  className="mt-8"
                  title="Rien ne correspond"
                  actions={
                    <ButtonLink href={routes.recruitment} variant="secondary" icon="arrow-left" iconPosition="start">
                      Tous les recrutements en cours
                    </ButtonLink>
                  }
                >
                  {filters.q
                    ? `Aucun recrutement ne parle de « ${filters.q} » avec ces filtres.`
                    : "Aucun recrutement avec ces filtres pour l'instant."}
                </EmptyState>
              )}
              <Pages filters={filters} count={campaigns.length} />
            </section>
          ) : (
            <>
              <section aria-labelledby="ouverts" className="wrap pb-16 pt-12 sm:pb-20 sm:pt-16">
                <SectionHeader
                  id="ouverts"
                  index={nextIndex()}
                  kicker={open.length > 0 ? plural(open.length, "recrutement") : "Rien pour l'instant"}
                  title="Ouverts maintenant"
                />
                {open.length > 0 ? (
                  rows(open)
                ) : (
                  <EmptyState
                    className="mt-8"
                    title="Aucun recrutement ouvert aujourd'hui"
                    actions={
                      <ButtonLink href={routes.associations} variant="secondary" icon="arrow-right">
                        Voir les associations
                      </ButtonLink>
                    }
                  >
                    {upcoming[0]
                      ? `Prochaine ouverture : ${upcoming[0].association.name}, « ${upcoming[0].title} », le ${formatDayMonth(upcoming[0].opensAt)}. Sa fiche est déjà lisible plus bas.`
                      : "Les prochaines fiches s'afficheront ici dès leur ouverture. En attendant, passe voir les assos."}
                  </EmptyState>
                )}
              </section>

              <HowItWorks signedIn={Boolean(session.user)} />

              {paused.length > 0 && (
                <section aria-labelledby="en-pause" className="wrap pt-16 sm:pt-20">
                  <SectionHeader
                    id="en-pause"
                    index={nextIndex()}
                    kicker="Les brouillons restent enregistrés"
                    title="En pause"
                  />
                  {rows(paused)}
                </section>
              )}

              {upcoming.length > 0 && (
                <section aria-labelledby="bientot" className="wrap pt-16 sm:pt-20">
                  <SectionHeader id="bientot" index={nextIndex()} kicker="Les fiches sont déjà lisibles" title="Bientôt" />
                  {rows(upcoming)}
                </section>
              )}

              {facets.closed > 0 && (
                <p className="wrap pt-12">
                  <Link
                    href={recruitmentHref({ view: "closed" })}
                    className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
                  >
                    Les recrutements clôturés ({facets.closed})
                    <Icon name="arrow-right" size={14} />
                  </Link>
                </p>
              )}
            </>
          )}
        </>
      )}

      <div aria-hidden className="h-[var(--section)]" />
    </>
  );
}

function summaryTitle(f: RecruitmentFilters): string {
  if (f.q) return `« ${f.q} »`;
  return VIEW_LABEL[f.view];
}

/** What the student has going on, or how to get there. */
function PersonalLine({ signedIn, active }: { signedIn: boolean; active: number }) {
  return (
    <div className="flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      {signedIn ? (
        <>
          <p className="flex items-start gap-3">
            <Icon name="file" size={20} className="mt-0.5 shrink-0 text-muted" />
            <span>
              {active > 0 ? (
                <>
                  Tu as <strong>{plural(active, "candidature en cours", "candidatures en cours")}</strong> (brouillons ou
                  envoyées) : elles sont signalées dans la liste.
                </>
              ) : (
                "Aucune candidature en cours. Les fiches disent tout avant que tu te lances."
              )}
            </span>
          </p>
          <Link href={routes.accountApplications} className="inline-flex shrink-0 items-center gap-1.5 type-label hover:text-accent-text">
            Mes candidatures
            <Icon name="arrow-right" size={14} />
          </Link>
        </>
      ) : (
        <>
          <p className="flex items-start gap-3">
            <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-muted" />
            <span>
              Tout se lit sans compte. Pour candidater, connecte-toi : tu suivras ensuite chaque candidature dans ton espace.
            </span>
          </p>
          <ButtonLink href={routes.login} variant="secondary" size="sm" icon="arrow-right" className="self-start">
            Se connecter
          </ButtonLink>
        </>
      )}
    </div>
  );
}

function Pages({ filters, count }: { filters: RecruitmentFilters; count: number }) {
  const page = Math.floor(filters.offset / PAGE) + 1;
  if (page === 1 && count < PAGE) return null;
  return (
    <nav aria-label="Pages des recrutements" className="flex flex-wrap items-center justify-between gap-4 pt-10">
      {page > 1 ? (
        <Link
          href={recruitmentHref({ ...filters, offset: (page - 2) * PAGE })}
          className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
        >
          <Icon name="arrow-left" size={14} />
          Page précédente
        </Link>
      ) : (
        <span />
      )}
      {count === PAGE && (
        <ButtonLink href={recruitmentHref({ ...filters, offset: page * PAGE })} variant="secondary" icon="arrow-right">
          Page suivante
        </ButtonLink>
      )}
    </nav>
  );
}
