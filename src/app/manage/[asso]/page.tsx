import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { formatDayFull, plural } from "@/lib/format";
import { getManageContext, getManageGate, getManageNavCounts } from "@/lib/data/manage";
import { getEvents } from "@/lib/data/events";
import { getPosts } from "@/lib/data/posts";
import { getCampaigns } from "@/lib/data/recruitment";
import { getApplicants, getMedia, getTasks } from "@/lib/data/users";
import { isTonight } from "@/components/events/event-facts";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import type { ManageSectionKey } from "@/components/manage/sections";
import { TaskList } from "@/components/manage/home/TaskList";
import { UpcomingEvents } from "@/components/manage/home/UpcomingEvents";
import { CampaignDigest, PendingPosts } from "@/components/manage/home/Digests";
import { QuickLinks } from "@/components/manage/home/QuickLinks";
import { SectionLink } from "@/components/manage/home/SectionLink";

type Params = Promise<{ asso: string }>;

/**
 * The [asso] layout's title template only applies to child segments, so the
 * home page names the association itself ("Accueil · Very Pink Club · Espace assos").
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
 * /manage/[asso] — the bureau's desk: what to do (and by when), the next
 * events and how full they are, open recruitments with their applicants,
 * posts waiting to go out, and a ruled index of the sections.
 */
export default async function ManageHomePage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association, user } = ctx;
  const now = new Date();

  const [tasks, upcoming, posts, campaigns, counts, media] = await Promise.all([
    getTasks(association.id),
    getEvents({ associationId: association.id, includeUnpublished: true, when: "upcoming" }),
    getPosts({ associationId: association.id, includeUnpublished: true }),
    getCampaigns({ associationId: association.id }),
    getManageNavCounts(association.id),
    getMedia(association.id),
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

  const todo = [
    urgent > 0 && plural(urgent, "tâche urgente", "tâches urgentes"),
    unread > 0 && plural(unread, "candidature à lire", "candidatures à lire"),
    drafts > 0 && plural(drafts, "brouillon à relire", "brouillons à relire"),
  ].filter((s): s is string => Boolean(s));

  const facts: Partial<Record<ManageSectionKey, string>> = {
    content: counts.content?.label ?? plural(posts.length, "article"),
    events: counts.events?.label ?? `${upcoming.length} à venir`,
    team: `${association.team.length} au bureau`,
    recruitment:
      counts.recruitment?.label ??
      (running.length ? plural(running.length, "campagne en cours", "campagnes en cours") : "Aucune campagne en cours"),
    media: plural(media.length, "fichier"),
  };
  const highlight = (["content", "events", "recruitment"] as const).filter((k) => counts[k]);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Accueil"
        title={association.name}
        description={
          <p>
            Salut {user.firstName}.{" "}
            {todo.length ? `Sur ton bureau : ${frenchList(todo)}.` : "Rien d'urgent : de quoi préparer la suite au calme."}
            {tonight && <> Et ce soir, c&apos;est {tonight.title}.</>}
          </p>
        }
        meta={
          <>
            <span>{formatDayFull(now.toISOString())}</span>
            {role && <span>Ton rôle&nbsp;: {role}</span>}
          </>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-12">
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
            ) : (
              <ManageEmpty icon="file" title="Rien en attente">
                <p>Pas de brouillon ni d&apos;article programmé&nbsp;: tout ce que le bureau a écrit est en ligne.</p>
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
            : "Brouillons compris : ils n'apparaissent dans l'agenda qu'une fois publiés."
        }
      >
        {upcoming.length ? (
          <UpcomingEvents events={upcoming.slice(0, UPCOMING_SHOWN)} now={now} />
        ) : (
          <ManageEmpty icon="calendar" title={`Rien de prévu pour ${association.shortName ?? association.name}`}>
            <p>Le prochain événement que tu crées apparaîtra ici avec son remplissage, dès l&apos;ouverture des inscriptions.</p>
          </ManageEmpty>
        )}
      </ManageSection>

      <ManageSection title="Raccourcis">
        <QuickLinks asso={association.slug} facts={facts} highlight={highlight} />
      </ManageSection>
    </div>
  );
}
