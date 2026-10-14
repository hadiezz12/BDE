import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ApplicationItem, CampaignItem, EventItem, PostItem as Post } from "@/lib/types";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, formatDateLong, formatDayMonth, plural } from "@/lib/format";
import { getSession } from "@/lib/demo-session";
import { getAssociation } from "@/lib/data/associations";
import { getEvents } from "@/lib/data/events";
import { getMemberCardOffer } from "@/lib/data/member-card";
import { getPost, getPosts } from "@/lib/data/posts";
import { getCampaigns } from "@/lib/data/recruitment";
import { getApplications } from "@/lib/data/users";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { SocialLinks } from "@/components/associations/SocialLinks";
import { TeamList } from "@/components/associations/TeamList";
import { categoryKicker } from "@/components/associations/association-facts";
import { PostItem } from "@/components/campus/PostItem";
import { EventPoster } from "@/components/events/EventPoster";
import { EventRow } from "@/components/events/EventRow";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { MediaFrame } from "@/components/media/MediaFrame";
import { CampaignRow } from "@/components/recruitment/CampaignRow";
import { findApplication, isOpen } from "@/components/recruitment/campaign-facts";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { AssociationGallery } from "../_components/AssociationGallery";
import { MemberCardSection } from "../_components/MemberCardSection";

type Props = { params: Promise<{ slug: string }> };

/** Events shown here: the next one as a poster, then up to four lines. */
const EVENT_LIMIT = 5;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const association = await getAssociation(slug);
  if (!association) return { title: "Association introuvable" };
  return {
    title: association.name,
    description: `${association.kind} du campus de Paris de GEM. ${association.tagline}`,
    openGraph: {
      title: association.name,
      description: association.tagline,
      images: association.cover ? [{ url: association.cover.src, alt: association.cover.alt }] : undefined,
    },
  };
}

/**
 * /associations/[slug] — an association's page. Night chrome, the cover with
 * the mark stuck across its edge, then who they are, where to find them,
 * what's coming, who's recruiting (on paper, like the fiches de poste), the
 * bureau, what they wrote and their photos. The BDE adds its carte cotisante
 * (#carte). Members see their role; officers get the way to their workspace.
 */
export default async function AssociationPage({ params }: Props) {
  const { slug } = await params;
  const association = await getAssociation(slug);
  if (!association) notFound();

  const now = new Date();
  const session = await getSession();
  const user = session.user;
  const [events, campaigns, posts, offer, applications] = await Promise.all([
    getEvents({ associationId: association.id }),
    getCampaigns({ associationId: association.id }),
    getPosts({ associationId: association.id, limit: 4 }),
    getMemberCardOffer(association.id),
    user ? getApplications(user.id) : Promise.resolve<ApplicationItem[]>([]),
  ]);
  const story = offer?.storySlug ? await getPost(offer.storySlug) : null;

  const { accent } = association;
  const membership = user?.memberships.find((m) => m.associationId === association.id);
  const manages = Boolean(user?.managedAssociationIds.includes(association.id));

  const open = campaigns.filter((c) => isOpen(c.status));
  const soon = campaigns.filter((c) => c.status === "a-venir");
  const recruiting = open.length > 0 ? open : soon;
  const openSeats = open.reduce((n, c) => n + c.seats, 0);

  const [nextEvent, ...laterEvents] = events;
  const shownLater = laterEvents.slice(0, EVENT_LIMIT - 1);
  const personalFor = (e: EventItem): PersonalState | undefined =>
    user ? { registered: user.registeredEventIds.includes(e.id), saved: user.savedEventIds.includes(e.id) } : undefined;

  const noteFor = (c: CampaignItem) => {
    const mine = findApplication(applications, c.id);
    if (!mine) return undefined;
    return mine.status === "brouillon"
      ? "Ton brouillon t'attend"
      : `Ta candidature : ${APPLICATION_STATUS_LABEL[mine.status].toLowerCase()}`;
  };

  const [leadPost, ...morePosts] = posts;
  const kicker = categoryKicker(association.category);

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  const facts = [
    association.foundedYear ? { label: "Créée en", value: String(association.foundedYear) } : null,
    association.memberCount ? { label: "Membres", value: association.memberCount.toLocaleString("fr-FR") } : null,
    { label: "À l'agenda", value: String(events.length) },
  ].filter((f): f is { label: string; value: string } => Boolean(f));

  return (
    <div data-accent={accent}>
      {/* ---- Header: cover, mark, name ---- */}
      <header>
        <div className="wrap pb-5 pt-6 sm:pt-8">
          <Breadcrumbs
            items={[
              { href: routes.associations, label: "Associations" },
              { href: routes.association(association.slug), label: association.name },
            ]}
          />
        </div>

        <div className="wrap">
          <div className="relative">
            <div className="relative aspect-[4/5] max-sm:mx-[calc(var(--gutter)*-1)] sm:aspect-[16/9] lg:aspect-[21/9]">
              <MediaFrame
                photo={association.cover}
                slot="association-cover"
                sizes="(min-width: 1440px) 1344px, 100vw"
                priority
                fallback={{ title: association.name, accent, kicker: association.kind }}
                className="sm:border-2 sm:border-fg"
              />
            </div>
            {open.length > 0 && (
              <Sticker tone="ok" tilt={-4} className="absolute right-0 top-3 sm:right-5 sm:top-5">
                Recrute · {plural(openSeats, "place")}
              </Sticker>
            )}
            {/* The mark, stuck across the cover's bottom edge like on the tiles. */}
            <span className="absolute bottom-0 left-0 translate-y-1/2 rounded-full bg-bg p-1.5 sm:left-6 lg:left-10">
              <AssociationLogo association={association} size={104} ring />
            </span>
          </div>
        </div>

        <div className="wrap grid gap-x-12 gap-y-10 pt-20 lg:grid-cols-12 lg:pt-24">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
            {kicker && <p className="type-label text-assoc-text">{kicker}</p>}
            <h1 className="type-display break-words hyphens-auto text-[clamp(2.1rem,0.8rem+5.2vw,6.25rem)]">
              {association.name}
            </h1>
            <p className="type-small font-semibold text-muted">
              {association.kind}
              {association.shortName && <span className="font-mono font-normal"> · {association.shortName}</span>}
            </p>
            <p className="mt-2 max-w-2xl type-lead">{association.tagline}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-7 lg:col-span-4 lg:col-start-9 lg:pt-6">
            <dl className="grid grid-cols-3 border-t-2 border-fg">
              {facts.map((f) => (
                <div key={f.label} className="flex flex-col gap-1.5 border-l border-line px-3 pt-3 first:border-l-0 first:pl-0">
                  <dt className="type-label text-muted">{f.label}</dt>
                  <dd className="type-numeral text-[2.25rem] sm:text-[2.6rem]">{f.value}</dd>
                </div>
              ))}
            </dl>

            {membership && (
              <p className="flex items-start gap-3 rounded-sm border border-line-strong bg-raised px-4 py-3">
                <Icon name="check" size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-assoc-text" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-bold leading-snug">Tu en fais partie : {membership.role}</span>
                  <span className="type-meta text-muted">depuis le {formatDateLong(membership.since)}</span>
                </span>
              </p>
            )}

            {(open.length > 0 || offer || manages) && (
              <div className="flex flex-wrap gap-3">
                {offer && (
                  <ButtonLink href="#carte" icon="arrow-right">
                    La carte · {offer.price}&nbsp;€
                  </ButtonLink>
                )}
                {open.length > 0 && (
                  <ButtonLink
                    href={open.length === 1 ? routes.campaign(open[0].slug) : "#recrutement"}
                    variant={offer ? "secondary" : "assoc"}
                    icon="arrow-right"
                  >
                    {open.length === 1 ? "Voir le recrutement" : "Les recrutements"}
                  </ButtonLink>
                )}
                {manages && (
                  <ButtonLink href={routes.manageHome(association.slug)} variant="secondary" icon="edit" iconPosition="start">
                    Gérer la page
                  </ButtonLink>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---- Who they are | where to find them ---- */}
      <div className="wrap grid gap-x-12 gap-y-14 pt-section lg:grid-cols-12">
        <section aria-labelledby="presentation" className="flex min-w-0 flex-col gap-8 lg:col-span-7">
          <SectionHeader id="presentation" index={nextIndex()} kicker="Présentation" title="Qui on est" />
          <div className="flex max-w-[65ch] flex-col gap-4">
            {association.description.map((p, i) => (
              <p key={i} className={i === 0 ? "type-lead" : "text-muted"}>
                {p}
              </p>
            ))}
          </div>
          {association.highlights && association.highlights.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="type-label text-muted">À savoir d&apos;abord</h3>
              <ol className="border-b border-line">
                {association.highlights.map((h, i) => (
                  <li
                    key={h}
                    className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-3 border-t border-line py-3.5"
                  >
                    <span aria-hidden className="type-numeral text-[1.9rem] text-assoc-text">
                      {i + 1}
                    </span>
                    <span className="font-semibold">{h}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {(association.meetingInfo || association.socials.length > 0 || association.contactEmail) && (
          <aside aria-label="Infos pratiques" className="flex min-w-0 flex-col gap-10 lg:col-span-4 lg:col-start-9">
            {association.meetingInfo && (
              <section aria-labelledby="ou-nous-trouver" className="flex flex-col gap-3">
                <h2 id="ou-nous-trouver" className="border-t-2 border-fg pt-3 type-label text-muted">
                  Où nous trouver
                </h2>
                <p className="flex items-start gap-3">
                  <Icon name="pin" size={20} className="mt-0.5 shrink-0 text-assoc-text" />
                  <span>{association.meetingInfo}</span>
                </p>
              </section>
            )}
            {(association.socials.length > 0 || association.contactEmail) && (
              <section aria-labelledby="reseaux" className="flex flex-col gap-3">
                <h2 id="reseaux" className="border-t-2 border-fg pt-3 type-label text-muted">
                  Réseaux et contact
                </h2>
                <SocialLinks socials={association.socials} email={association.contactEmail} />
              </section>
            )}
          </aside>
        )}
      </div>

      {/* ---- BDE only: the carte cotisante ---- */}
      {offer && <MemberCardSection offer={offer} events={events} user={user} story={story} index={nextIndex()} />}

      {/* ---- What's coming ---- */}
      <section id="agenda" aria-labelledby="rendez-vous" className="wrap pt-section">
        <SectionHeader
          id="rendez-vous"
          index={nextIndex()}
          kicker={events.length > 0 ? plural(events.length, "date à venir", "dates à venir") : "Agenda"}
          title="Prochains rendez-vous"
          action={events.length > EVENT_LIMIT ? { href: routes.events, label: "Tout l'agenda" } : undefined}
        />
        {nextEvent ? (
          <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-12">
            <EventPoster
              event={nextEvent}
              size="lg"
              ratio="3/2"
              sizes="(min-width: 1024px) 40vw, (min-width: 640px) 80vw, 100vw"
              showAssociation={false}
              personal={personalFor(nextEvent)}
              now={now}
              className="sm:max-w-[36rem] lg:col-span-5 lg:max-w-none"
            />
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-6 lg:col-start-7">
              {shownLater.length > 0 ? (
                <>
                  <p className="type-label text-muted">Ensuite</p>
                  <div className="border-b border-line-strong">
                    {shownLater.map((e) => (
                      <EventRow
                        key={e.id}
                        event={e}
                        variant="compact"
                        showAssociation={false}
                        personal={personalFor(e)}
                        now={now}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="border-t border-line pt-4 text-muted">
                  C&apos;est la seule date annoncée pour l&apos;instant. Les suivantes arrivent ici dès qu&apos;elles
                  sont publiées.
                </p>
              )}
              {session.role === "visiteur" && (
                <p className="type-small text-muted">
                  <Link href={routes.login} className="link font-semibold text-fg">
                    Connecte-toi
                  </Link>{" "}
                  pour voir les dates où tu es inscrit·e et celles que tu as enregistrées.
                </p>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            className="mt-8"
            title="Rien d'annoncé pour l'instant"
            actions={
              <ButtonLink href={routes.events} variant="secondary" icon="arrow-right">
                L&apos;agenda du campus
              </ButtonLink>
            }
          >
            {association.name} n&apos;a pas de date à venir sur l&apos;agenda. Les prochaines s&apos;afficheront ici ;
            en attendant, d&apos;autres assos sortent ce soir.
          </EmptyState>
        )}
      </section>

      {/* ---- Recruitment, on paper like the fiches de poste ---- */}
      {recruiting.length > 0 && (
        <section
          id="recrutement"
          aria-labelledby="recrute"
          data-surface="paper"
          className="grain mt-section py-section"
        >
          <div className="wrap">
            <SectionHeader
              id="recrute"
              index={nextIndex()}
              kicker={
                open.length > 0
                  ? `${plural(open.length, "recrutement")} · ${plural(openSeats, "place")}`
                  : `Ouverture le ${formatDayMonth(soon[0].opensAt)}`
              }
              title={open.length > 0 ? `${association.name} recrute` : "Recrutement à venir"}
              description={
                open.length > 0
                  ? "Chaque fiche dit ce que tu feras vraiment, combien d'heures ça prend et jusqu'à quand candidater."
                  : "La fiche est déjà lisible : missions, temps par semaine, étapes. Tu pourras candidater dès l'ouverture."
              }
            />
            <div className="mt-6 border-b border-line-strong">
              {recruiting.map((c) => (
                <CampaignRow key={c.id} campaign={c} note={noteFor(c)} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- The bureau ---- */}
      {association.team.length > 0 && (
        <section aria-labelledby="bureau" className="wrap grid gap-x-12 gap-y-8 pt-section lg:grid-cols-12">
          <SectionHeader
            id="bureau"
            index={nextIndex()}
            kicker={plural(association.team.length, "personne")}
            title="Le bureau"
            description="Les noms à connaître si tu veux t'investir ou poser une question."
            className="lg:col-span-4 lg:self-start"
          />
          <TeamList team={association.team} accent={accent} className="lg:col-span-8" />
        </section>
      )}

      {/* ---- What they wrote ---- */}
      {leadPost && (
        <section aria-labelledby="fil" className="wrap pt-section">
          <SectionHeader
            id="fil"
            index={nextIndex()}
            kicker="Le fil du campus"
            title="Ce qu'on raconte"
            action={{ href: routes.campus, label: "Tout le fil" }}
          />
          <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-12">
            <PostItem post={leadPost} withImage className={morePosts.length > 0 ? "lg:col-span-5" : "lg:col-span-6"} />
            {morePosts.length > 0 && <MorePosts posts={morePosts} />}
          </div>
        </section>
      )}

      {/* ---- Photos ---- */}
      {association.gallery.length > 0 && (
        <section aria-labelledby="en-images" className="wrap pt-section">
          <SectionHeader
            id="en-images"
            index={nextIndex()}
            kicker={plural(association.gallery.length, "photo")}
            title="En images"
          />
          <AssociationGallery photos={association.gallery} name={association.name} accent={accent} className="mt-8" />
        </section>
      )}

      <div aria-hidden className="h-[var(--section)]" />
    </div>
  );
}

/** Archive lines next to the lead story, thumbnail on the right. */
function MorePosts({ posts }: { posts: Post[] }) {
  return (
    <ul className="divide-y divide-line border-t border-line lg:col-span-6 lg:col-start-7">
      {posts.map((p) => (
        <li key={p.id} className="py-5">
          <PostItem post={p} size="sm" withImage />
        </li>
      ))}
    </ul>
  );
}
