import Link from "next/link";
import type { Association, CampaignItem, EventItem, PostItem as Post, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, formatDayMonth, plural } from "@/lib/format";
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
import { AssociationGallery } from "./AssociationGallery";
import { EventSeriesList } from "./EventSeriesList";
import { MemberCardSection } from "./MemberCardSection";
import type { ProfileModules } from "./profile-modules";

/** Events shown here: the next one as a poster, then up to four lines. */
const EVENT_LIMIT = 5;

/** "30 €", with a non-breaking space so the sign never wraps alone. */
const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;

/** Who adds what is missing, in the page's words: the BDE's bureau, or the association. */
function authorOf(association: Association): string {
  return association.isBde ? "le bureau" : "l'asso";
}

export interface ProfileViewer {
  user: UserProfile | null;
  /** "Trésorier·e", "Membre": shown when the visitor belongs to the association. */
  membership?: string;
  /** Where the visitor edits this page, when they may. */
  manageHref?: string;
}

/**
 * An association's page, built only from what the association has published
 * (or, in the preview, from its draft). Night chrome, the cover (or its
 * designed poster) with the mark stuck across its edge, then who they are and
 * where to find them, the events of their year, the BDE's carte cotisante
 * (#carte), dated events, recruitment, the team, posts and photos. A section
 * with nothing to show is left out; where an absence matters (the team, the
 * socials), one honest line says who will add it.
 *
 * The association's personality comes from its own words, colour (one of
 * the closed palette), logo, cover and photos; the structure, type and
 * contrast stay the site's, so every page remains readable and accessible.
 */
export function AssociationProfile({
  association,
  modules,
  viewer,
  preview = false,
}: {
  association: Association;
  modules: ProfileModules;
  viewer: ProfileViewer;
  /** The draft shown to its page team: no personal marks, no links that act. */
  preview?: boolean;
}) {
  const { events, series, campaigns, posts, offer, applications } = modules;
  const now = new Date();
  const user = preview ? null : viewer.user;
  const { accent } = association;
  const author = authorOf(association);

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
  const kicker = categoryKicker(association.categories);
  const hasSocials = association.socials.length > 0 || Boolean(association.contactEmail);

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  // Only facts the association has given; nothing is shown as "0".
  const facts = [
    association.foundedYear ? { label: "Créée en", value: String(association.foundedYear) } : null,
    series.length > 0 ? { label: "Événements de l'année", value: String(series.length) } : null,
    events.length > 0 ? { label: "À l'agenda", value: String(events.length) } : null,
    offer ? { label: "La carte", value: eur(offer.price) } : null,
  ]
    .filter((f): f is { label: string; value: string } => Boolean(f))
    .slice(0, 3);

  // Sections, numbered in reading order (the carte, when there is one, sits after the events of the year).
  const presentationIndex = nextIndex();
  const seriesIndex = series.length > 0 ? nextIndex() : "";
  const carteIndex = offer ? nextIndex() : "";

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
            {association.tagline && <p className="mt-2 max-w-2xl type-lead">{association.tagline}</p>}
            {association.categories.length > 0 && (
              <ul aria-label="Catégories" className="flex flex-wrap gap-2 pt-1">
                {association.categories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`${routes.associations}?categorie=${c.slug}`}
                      className="inline-flex min-h-9 items-center rounded-full border border-line-strong px-3 type-small font-semibold hover:border-fg"
                    >
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-7 lg:col-span-4 lg:col-start-9 lg:pt-6">
            {facts.length > 0 && (
              <dl className={`grid border-t-2 border-fg ${facts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {facts.map((f) => (
                  <div
                    key={f.label}
                    className="flex flex-col gap-1.5 border-l border-line px-3 pt-3 first:border-l-0 first:pl-0"
                  >
                    <dt className="type-label text-muted">{f.label}</dt>
                    <dd className="type-numeral text-[2.25rem] sm:text-[2.6rem]">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {!preview && viewer.membership && (
              <p className="flex items-start gap-3 rounded-sm border border-line-strong bg-raised px-4 py-3">
                <Icon name="check" size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-assoc-text" />
                <span className="font-bold leading-snug">Tu en fais partie : {viewer.membership}</span>
              </p>
            )}

            {(open.length > 0 || offer || (!preview && viewer.manageHref)) && (
              <div className="flex flex-wrap gap-3">
                {offer && (
                  <ButtonLink href="#carte" icon="arrow-right">
                    La carte · {eur(offer.price)}
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
                {!preview && viewer.manageHref && (
                  <ButtonLink href={viewer.manageHref} variant="secondary" icon="edit" iconPosition="start">
                    Gérer la page
                  </ButtonLink>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---- Who they are | where to find them ---- */}
      <div className="wrap grid gap-x-12 gap-y-14 pt-[var(--section)] lg:grid-cols-12">
        <section aria-labelledby="presentation" className="flex min-w-0 flex-col gap-8 lg:col-span-7">
          <SectionHeader id="presentation" index={presentationIndex} kicker="Présentation" title="Qui on est" />
          {association.description.length > 0 ? (
            <div className="flex max-w-[65ch] flex-col gap-4">
              {association.description.map((p, i) => (
                <p key={i} className={i === 0 ? "type-lead" : "text-muted"}>
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-muted">La présentation arrive : {author} l&apos;écrira ici.</p>
          )}
          {association.pillars && association.pillars.length > 0 && (
            <ol
              aria-label={`${association.name} en ${plural(association.pillars.length, "point")}`}
              className="border-b border-line"
            >
              {association.pillars.map((pillar, i) => (
                <li
                  key={`${i}-${pillar.title}`}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-3 border-t border-line py-4"
                >
                  <span aria-hidden className="type-numeral text-[1.9rem] text-assoc-text">
                    {i + 1}
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="font-bold leading-snug">{pillar.title}</span>
                    {pillar.detail && <span className="text-muted">{pillar.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

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
          <section aria-labelledby="reseaux" className="flex flex-col gap-3">
            <h2 id="reseaux" className="border-t-2 border-fg pt-3 type-label text-muted">
              Réseaux et contact
            </h2>
            {hasSocials ? (
              <SocialLinks socials={association.socials} email={association.contactEmail} />
            ) : (
              <p className="type-small text-muted">Les réseaux et le contact arrivent : {author} les ajoutera ici.</p>
            )}
          </section>
          {association.team.length > 0 ? (
            <p>
              <a href="#equipe" className="group inline-flex min-h-10 items-center gap-1.5 type-label hover:text-assoc-text">
                L&apos;équipe · {plural(association.team.length, "personne")}
                <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
              </a>
            </p>
          ) : (
            <section aria-labelledby="equipe-vide" className="flex flex-col gap-3">
              <h2 id="equipe-vide" className="border-t-2 border-fg pt-3 type-label text-muted">
                L&apos;équipe
              </h2>
              <p className="type-small text-muted">
                {association.isBde
                  ? "Le bureau présentera son équipe ici."
                  : `${association.name} présentera son équipe ici.`}
              </p>
            </section>
          )}
        </aside>
      </div>

      {/* ---- The events of their year (the BDE's 8), each with its own page ---- */}
      {series.length > 0 && (
        <section id="evenements" aria-labelledby="evenements-titre" className="wrap pt-[var(--section)]">
          <SectionHeader
            id="evenements-titre"
            index={seriesIndex}
            kicker="Chaque événement a sa page dédiée"
            title={`Les ${series.length} événements de l'année`}
            description={events.length === 0 ? `Les dates de chaque édition seront annoncées par ${author}.` : undefined}
          />
          <EventSeriesList series={series} className="mt-8" />
        </section>
      )}

      {/* ---- BDE only: the carte cotisante ---- */}
      {offer && <MemberCardSection offer={offer} user={user} index={carteIndex} />}

      {/* ---- Dated events ---- */}
      {nextEvent ? (
        <section id="agenda" aria-labelledby="rendez-vous" className="wrap pt-[var(--section)]">
          <SectionHeader
            id="rendez-vous"
            index={nextIndex()}
            kicker={plural(events.length, "date à venir", "dates à venir")}
            title="Prochains rendez-vous"
            action={events.length > EVENT_LIMIT ? { href: routes.events, label: "Tout l'agenda" } : undefined}
          />
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
              {!preview && !viewer.user && (
                <p className="type-small text-muted">
                  <Link href={routes.login} className="link font-semibold text-fg">
                    Connecte-toi
                  </Link>{" "}
                  pour voir les dates où tu es inscrit·e et celles que tu as enregistrées.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : (
        series.length === 0 && (
          <section id="agenda" aria-labelledby="rendez-vous" className="wrap pt-[var(--section)]">
            <SectionHeader id="rendez-vous" index={nextIndex()} kicker="Agenda" title="Prochains rendez-vous" />
            <EmptyState
              className="mt-8"
              title="Rien d'annoncé pour l'instant"
              actions={
                <ButtonLink href={routes.events} variant="secondary" icon="arrow-right">
                  L&apos;agenda
                </ButtonLink>
              }
            >
              Les dates de {association.name} s&apos;afficheront ici dès que {author} les publiera.
            </EmptyState>
          </section>
        )
      )}

      {/* ---- Recruitment, on paper like the fiches de poste ---- */}
      {recruiting.length > 0 && (
        <section
          id="recrutement"
          aria-labelledby="recrute"
          data-surface="paper"
          className="grain mt-[var(--section)] py-section"
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
                  ? "Chaque fiche dit ce que tu feras, combien de temps ça prend et jusqu'à quand candidater."
                  : "La fiche est déjà lisible. Tu pourras candidater dès l'ouverture."
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

      {/* ---- The team, as each member agreed to appear ---- */}
      {association.team.length > 0 && (
        <section
          id="equipe"
          aria-labelledby="equipe-titre"
          className="wrap grid gap-x-12 gap-y-8 pt-[var(--section)] lg:grid-cols-12"
        >
          <SectionHeader
            id="equipe-titre"
            index={nextIndex()}
            kicker={plural(association.team.length, "personne")}
            title={association.isBde ? "Le bureau" : "L'équipe"}
            className="lg:col-span-4 lg:self-start"
          />
          <TeamList team={association.team} accent={accent} className="lg:col-span-8" />
        </section>
      )}

      {/* ---- What they wrote: pinned posts first (public_association_posts), marked as such ---- */}
      {leadPost && (
        <section aria-labelledby="fil" className="wrap pt-[var(--section)]">
          <SectionHeader
            id="fil"
            index={nextIndex()}
            kicker="Le fil du campus"
            title="Ce qu'on raconte"
            action={{ href: routes.campusFor(association.slug), label: "Tous ses articles" }}
          />
          <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-12">
            <PostItem
              post={leadPost}
              withImage={leadPost.kind !== "breve"}
              showPinned
              className={morePosts.length > 0 ? "lg:col-span-5" : "lg:col-span-6"}
            />
            {morePosts.length > 0 && <MorePosts posts={morePosts} />}
          </div>
        </section>
      )}

      {/* ---- Photos ---- */}
      {association.gallery.length > 0 && (
        <section aria-labelledby="en-images" className="wrap pt-[var(--section)]">
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

/** Archive lines next to the lead story, thumbnail on the right (brèves have none). */
function MorePosts({ posts }: { posts: Post[] }) {
  return (
    <ul className="divide-y divide-line border-t border-line lg:col-span-6 lg:col-start-7">
      {posts.map((p) => (
        <li key={p.id} className="py-5">
          <PostItem post={p} size="sm" withImage={p.kind !== "breve"} showPinned />
        </li>
      ))}
    </ul>
  );
}
