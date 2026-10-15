import type { Metadata } from "next";
import Link from "next/link";
import type { ApplicationItem, CampaignItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, formatDayMonth, plural } from "@/lib/format";
import { getSession } from "@/lib/demo-session";
import { getAssociationsByIds } from "@/lib/data/associations";
import { getCampaigns } from "@/lib/data/recruitment";
import { getApplications } from "@/lib/data/users";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { CampaignRow } from "@/components/recruitment/CampaignRow";
import { HowItWorks } from "@/components/recruitment/HowItWorks";
import { findApplication, isActiveApplication, isOpen } from "@/components/recruitment/campaign-facts";

export const metadata: Metadata = {
  title: "Recrutements",
  description:
    "Les recrutements des associations de GEM Alpine Business School — Paris : missions, temps demandé, places et date limite.",
};

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { scope } = await searchParams;
  const onlyOpen = scope === "open";
  const session = await getSession();
  const [campaigns, applications, managed] = await Promise.all([
    getCampaigns(),
    session.user ? getApplications(session.user.id) : Promise.resolve<ApplicationItem[]>([]),
    getAssociationsByIds(session.user?.managedAssociationIds ?? []),
  ]);
  // No campaign published yet, anywhere: one designed empty state instead of empty sections.
  const none = campaigns.length === 0;

  const open = campaigns.filter((c) => isOpen(c.status));
  const upcoming = campaigns.filter((c) => c.status === "a-venir");
  const closed = campaigns.filter((c) => c.status === "cloturee");
  const openSeats = open.reduce((n, c) => n + c.seats, 0);
  const active = applications.filter((a) => isActiveApplication(a.status));
  const hiddenCount = upcoming.length + closed.length;

  const noteFor = (c: CampaignItem) => {
    const mine = findApplication(applications, c.id);
    if (!mine) return undefined;
    return mine.status === "brouillon"
      ? "Ton brouillon t'attend"
      : `Ta candidature : ${APPLICATION_STATUS_LABEL[mine.status].toLowerCase()}`;
  };

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  return (
    <>
      <PageHeader
        kicker="Recrutements"
        title={
          <>
            {open.length > 0 ? "Ça recrute" : "Recrutements"}
            <span className="text-accent-text">.</span>
          </>
        }
        aside={
          openSeats > 0 ? (
            <Sticker tone="ok" tilt={-3}>
              {plural(openSeats, "place ouverte", "places ouvertes")}
            </Sticker>
          ) : undefined
        }
        intro="Les assos publient ici leurs recrutements : chaque fiche dit ce que tu feras vraiment, combien de temps ça prend et jusqu'à quand tu peux candidater."
      >
        {!none && (
          <FilterChips
            label="Afficher les recrutements"
            param="scope"
            basePath={routes.recruitment}
            current={onlyOpen ? "open" : null}
            options={[
              { value: null, label: "Tous", count: campaigns.length },
              { value: "open", label: "Ouverts", count: open.length },
            ]}
          />
        )}
      </PageHeader>

      {none ? (
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
                    Publier un recrutement · {a.shortName ?? a.name}
                  </ButtonLink>
                ))
              ) : (
                <ButtonLink href={routes.associations} variant="secondary" icon="arrow-right">
                  Voir les associations
                </ButtonLink>
              )
            }
          >
            Aucune campagne n&apos;est publiée pour l&apos;instant. Chaque asso ouvrira ici ses recrutements, avec les
            missions de chaque poste, le temps que ça prend et la date limite.
          </EmptyState>
        </section>
      ) : (
        <>
          {/* Personal line: what the student has going on, or how to get there. */}
          <div className="wrap">
            <div className="flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              {session.user ? (
                <>
                  <p className="flex items-start gap-3">
                    <Icon name="file" size={20} className="mt-0.5 shrink-0 text-muted" />
                    <span>
                      {active.length > 0 ? (
                        <>
                          Tu as <strong>{plural(active.length, "candidature en cours", "candidatures en cours")}</strong> :
                          elles sont signalées dans la liste.
                        </>
                      ) : (
                        "Aucune candidature en cours. Les fiches disent tout avant que tu te lances."
                      )}
                    </span>
                  </p>
                  <Link
                    href={routes.accountApplications}
                    className="inline-flex shrink-0 items-center gap-1.5 type-label hover:text-accent-text"
                  >
                    Mes candidatures
                    <Icon name="arrow-right" size={14} />
                  </Link>
                </>
              ) : (
                <>
                  <p className="flex items-start gap-3">
                    <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-muted" />
                    <span>
                      Tout se lit sans compte. Pour candidater, connecte-toi : tu suivras ensuite chaque candidature dans
                      ton espace.
                    </span>
                  </p>
                  <ButtonLink href={routes.login} variant="secondary" size="sm" icon="arrow-right" className="self-start">
                    Se connecter
                  </ButtonLink>
                </>
              )}
            </div>
          </div>

          <section aria-labelledby="ouverts" className="wrap pb-16 pt-12 sm:pb-20 sm:pt-16">
            <SectionHeader
              id="ouverts"
              index={nextIndex()}
              kicker={
                open.length > 0
                  ? `${plural(open.length, "recrutement")} · ${plural(openSeats, "place")}`
                  : "Rien pour l'instant"
              }
              title="Ouverts maintenant"
            />
            {open.length > 0 ? (
              <div className="mt-6 border-b border-line-strong">
                {open.map((c) => (
                  <CampaignRow key={c.id} campaign={c} note={noteFor(c)} />
                ))}
              </div>
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
                  ? `Prochaine ouverture : ${upcoming[0].association.name}, « ${upcoming[0].title} », le ${formatDayMonth(upcoming[0].opensAt)}.${onlyOpen ? "" : " Sa fiche est déjà lisible plus bas."}`
                  : "Les prochaines fiches s'afficheront ici dès leur ouverture. En attendant, passe voir les assos."}
              </EmptyState>
            )}
          </section>
        </>
      )}

      <HowItWorks signedIn={Boolean(session.user)} />

      {!onlyOpen && upcoming.length > 0 && (
        <section aria-labelledby="bientot" className="wrap pt-16 sm:pt-20">
          <SectionHeader
            id="bientot"
            index={nextIndex()}
            kicker="Les fiches sont déjà lisibles"
            title="Bientôt"
          />
          <div className="mt-6 border-b border-line-strong">
            {upcoming.map((c) => (
              <CampaignRow key={c.id} campaign={c} note={noteFor(c)} />
            ))}
          </div>
        </section>
      )}

      {!onlyOpen && closed.length > 0 && (
        <section aria-labelledby="clotures" className="wrap pt-16 sm:pt-20">
          <SectionHeader id="clotures" index={nextIndex()} kicker="Pour mémoire" title="Clôturés" />
          <div className="mt-6 border-b border-line-strong">
            {closed.map((c) => (
              <CampaignRow key={c.id} campaign={c} note={noteFor(c)} />
            ))}
          </div>
        </section>
      )}

      {onlyOpen && hiddenCount > 0 && (
        <p className="wrap pt-12">
          <Link href={routes.recruitment} className="inline-flex items-center gap-1.5 type-label hover:text-accent-text">
            Voir aussi {plural(hiddenCount, "recrutement")} à venir ou clôturé{hiddenCount > 1 ? "s" : ""}
            <Icon name="arrow-right" size={14} />
          </Link>
        </p>
      )}

      <div aria-hidden className="h-[var(--section)]" />
    </>
  );
}
