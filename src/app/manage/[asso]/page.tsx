import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { formatDayFull, plural } from "@/lib/format";
import { getManageContext, getManageGate, getManageNavCounts } from "@/lib/data/manage";
import { getEvents } from "@/lib/data/events";
import { getEventSeries } from "@/lib/data/event-series";
import { getPosts } from "@/lib/data/posts";
import { getCampaigns } from "@/lib/data/recruitment";
import { getApplicants, getMedia, getTasks } from "@/lib/data/users";
import { ButtonLink } from "@/components/ui/Button";
import { isTonight } from "@/components/events/event-facts";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import type { ManageSectionKey } from "@/components/manage/sections";
import { greeting } from "@/components/manage/viewer";
import { TaskList } from "@/components/manage/home/TaskList";
import { SetupList, type SetupStep } from "@/components/manage/home/SetupList";
import { UpcomingEvents } from "@/components/manage/home/UpcomingEvents";
import { CampaignDigest, PendingPosts } from "@/components/manage/home/Digests";
import { QuickLinks } from "@/components/manage/home/QuickLinks";
import { SectionLink } from "@/components/manage/home/SectionLink";

type Params = Promise<{ asso: string }>;

/**
 * The [asso] layout's title template only applies to child segments, so the
 * home page names the association itself ("Accueil · <asso> · Espace assos").
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { asso } = await params;
  const gate = await getManageGate(asso);
  return { title: gate ? `Accueil · ${gate.association.name}` : "Association introuvable" };
}

const UPCOMING_SHOWN = 5;

/** "a", "a et b", "a, b et c". */
function frenchList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/**
 * /manage/[asso] — the bureau's desk: what the public page still lacks,
 * what to do (and by when), open recruitments with their applicants, posts
 * waiting to go out, the next dated events and how full they are, and a
 * ruled index of the sections. Every block reads real records only; an empty
 * one says what will appear there and who adds it.
 */
export default async function ManageHomePage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association, user } = ctx;
  const now = new Date();

  const [tasks, upcoming, posts, campaigns, counts, media, series] = await Promise.all([
    getTasks(association.id),
    getEvents({ associationId: association.id, includeUnpublished: true, when: "upcoming" }),
    getPosts({ associationId: association.id, includeUnpublished: true }),
    getCampaigns({ associationId: association.id }),
    getManageNavCounts(association.id),
    getMedia(association.id),
    getEventSeries({ associationId: association.id }),
  ]);
  const applicants = campaigns.length ? await getApplicants({ campaignIds: campaigns.map((c) => c.id) }) : [];

  const running = campaigns.filter((c) => c.status !== "cloturee");
  // Oldest draft first: it has been waiting the longest. Scheduled ones after, soonest first.
  const pending = [
    ...posts.filter((p) => p.publication === "brouillon").reverse(),
    ...posts.filter((p) => p.publication === "programme").reverse(),
  ];
  const urgent = tasks.filter((t) => t.priority === "haute").length;
  const unread = applicants.filter((a) => a.status === "envoyee").length;
  const drafts = posts.filter((p) => p.publication === "brouillon").length;
  const tonight = upcoming.find((e) => e.publication === "publie" && isTonight(e, now));
  const role = user.memberships.find((m) => m.associationId === association.id)?.role;
  const hello = greeting(user);
  const blank = tasks.length === 0 && upcoming.length === 0 && posts.length === 0 && campaigns.length === 0;

  const todo = [
    urgent > 0 && plural(urgent, "tâche urgente", "tâches urgentes"),
    unread > 0 && plural(unread, "candidature à lire", "candidatures à lire"),
    drafts > 0 && plural(drafts, "brouillon à relire", "brouillons à relire"),
  ].filter((s): s is string => Boolean(s));

  // What the public page lacks, straight from the empty fields of the profile.
  const setup: SetupStep[] = [];
  if (association.team.length === 0) {
    setup.push({
      key: "team",
      label: "Présente le bureau",
      detail: "Personne n'est encore listé au bureau. Invite chaque membre avec son rôle : il apparaîtra sur la page publique.",
      href: routes.manageTeam(association.slug),
    });
  }
  if (!association.contactEmail && association.socials.length === 0) {
    setup.push({
      key: "contact",
      label: "Ajoute un contact et vos réseaux",
      detail: "La page publique n'a encore ni mail de contact ni lien vers vos réseaux.",
      href: routes.manageSettings(association.slug),
    });
  }
  if (!association.cover) {
    setup.push({
      key: "cover",
      label: "Choisis une photo de couverture",
      detail: "En attendant, la page publique affiche un visuel dessiné à ta couleur.",
      href: routes.manageSettings(association.slug),
    });
  }

  const facts: Partial<Record<ManageSectionKey, string>> = {
    content: counts.content?.label ?? (posts.length ? plural(posts.length, "article") : "Rien de publié"),
    events:
      counts.events?.label ??
      [
        series.length ? plural(series.length, "événement de l'année", "événements de l'année") : null,
        upcoming.length ? `${upcoming.length} à venir` : "aucune date",
      ]
        .filter(Boolean)
        .join(" · "),
    team: association.team.length ? `${association.team.length} au bureau` : "Bureau à présenter",
    recruitment:
      counts.recruitment?.label ??
      (running.length ? plural(running.length, "campagne en cours", "campagnes en cours") : "Aucune campagne en cours"),
    media: media.length ? plural(media.length, "fichier") : "Médiathèque vide",
  };
  const highlight = (["content", "events", "recruitment"] as const).filter((k) => counts[k]);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Accueil"
        title={association.name}
        description={
          <p>
            {hello && <>{hello} </>}
            {todo.length
              ? `Sur ton bureau : ${frenchList(todo)}.`
              : blank
                ? "Ton espace est prêt. Il se remplit au fil de ce que le bureau ajoute : dates, équipe, articles et recrutements."
                : "Rien d'urgent : de quoi préparer la suite au calme."}
            {tonight && <> Et ce soir, c&apos;est {tonight.title}.</>}
          </p>
        }
        meta={
          <>
            <span>{formatDayFull(now.toISOString())}</span>
            {role && <span>Ton rôle&nbsp;: {role}</span>}
            {user.demoLabel && <span>{user.demoLabel}</span>}
          </>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-12">
        <div className="flex flex-col gap-10">
          {setup.length > 0 && (
            <ManageSection
              title="Pour compléter ta page"
              count={setup.length}
              description={`Ce qui manque encore à la page publique de ${association.name}. Chaque point disparaît une fois rempli.`}
            >
              <SetupList steps={setup} />
            </ManageSection>
          )}

          <ManageSection title="À faire" count={tasks.length}>
            {tasks.length ? (
              <TaskList tasks={tasks} asso={association.slug} now={now} />
            ) : (
              <ManageEmpty icon="check" title="Rien sur la liste">
                <p>
                  Quand une campagne reçoit des candidatures ou qu&apos;un brouillon attend, la tâche arrive ici avec son
                  échéance.
                </p>
              </ManageEmpty>
            )}
          </ManageSection>
        </div>

        <div className="flex flex-col gap-10">
          <ManageSection
            title="Recrutements"
            count={running.length}
            action={<SectionLink href={routes.manageRecruitment(association.slug)}>Candidatures</SectionLink>}
          >
            {running.length ? (
              <CampaignDigest campaigns={running} applicants={applicants} now={now} />
            ) : (
              <ManageEmpty icon="megaphone" title="Aucune campagne en cours">
                <p>Ouvre une campagne quand tu cherches du monde&nbsp;: elle apparaîtra dans Recrutement, côté étudiant·es.</p>
              </ManageEmpty>
            )}
          </ManageSection>

          <ManageSection
            title="En attente de publication"
            count={pending.length}
            action={<SectionLink href={routes.manageContent(association.slug)}>Contenus</SectionLink>}
          >
            {pending.length ? (
              <PendingPosts posts={pending} now={now} />
            ) : posts.length ? (
              <ManageEmpty icon="file" title="Rien en attente">
                <p>Pas de brouillon ni d&apos;article programmé&nbsp;: tout ce que le bureau a écrit est en ligne.</p>
              </ManageEmpty>
            ) : (
              <ManageEmpty icon="file" title="Rien d'écrit pour l'instant">
                <p>Les brouillons et les articles programmés du bureau attendront ici avant de partir dans le fil.</p>
              </ManageEmpty>
            )}
          </ManageSection>
        </div>
      </div>

      <ManageSection
        title="Événements à venir"
        count={upcoming.length}
        action={<SectionLink href={routes.manageEvents(association.slug)}>Tous les événements</SectionLink>}
        description={
          upcoming.length > UPCOMING_SHOWN
            ? `Les ${UPCOMING_SHOWN} prochains, brouillons compris. La suite est dans Événements.`
            : upcoming.length > 0
              ? "Brouillons compris : ils n'apparaissent dans l'agenda qu'une fois publiés."
              : undefined
        }
      >
        {upcoming.length ? (
          <UpcomingEvents events={upcoming.slice(0, UPCOMING_SHOWN)} now={now} />
        ) : (
          <ManageEmpty
            icon="calendar"
            title="Aucune date annoncée"
            actions={
              series.length > 0 ? (
                <ButtonLink
                  href={routes.manageEvents(association.slug)}
                  variant="secondary"
                  size="sm"
                  icon="arrow-right"
                >
                  Voir les {plural(series.length, "événement")}
                </ButtonLink>
              ) : undefined
            }
          >
            <p>
              {series.length > 0
                ? `Les ${plural(series.length, "événement")} de l'année ont leur page, sans date pour l'instant. Dès que le bureau fixe celle d'une édition, ajoute-la depuis Événements : elle apparaîtra ici avec son remplissage.`
                : "Le prochain événement que tu crées apparaîtra ici avec son remplissage, dès l'ouverture des inscriptions."}
            </p>
          </ManageEmpty>
        )}
      </ManageSection>

      <ManageSection title="Raccourcis">
        <QuickLinks asso={association.slug} facts={facts} highlight={highlight} />
      </ManageSection>
    </div>
  );
}
