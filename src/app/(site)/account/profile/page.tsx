import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDateLong } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getAvatarUrl, getMyProfile } from "@/lib/data/profile";
import { getBde } from "@/lib/data/associations";
import { getNotificationPreferences } from "@/lib/data/preferences";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { NotificationPreferencesForm } from "@/components/account/NotificationPreferencesForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { AvatarField } from "@/components/account/AvatarField";
import { accountName } from "@/components/account/identity";

export const metadata: Metadata = {
  title: "Profil",
  description: "Tes infos (nom, programme, année, photo) et ce que tu veux recevoir, dans ton espace ou par mail.",
};

/** Where each piece of the profile shows up on the site: the margin note. */
const WHERE_IT_SHOWS: Array<{ icon: IconName; what: string; where: string }> = [
  {
    icon: "user",
    what: "Ton nom et ta photo",
    where: "Pour l'instant, toi seul·e les vois : dans ton espace et dans le menu de ton compte.",
  },
  {
    icon: "file",
    what: "Ton programme et ton année",
    where: "Visibles par toi seul·e. Plus tard, une candidature pourra les reprendre si tu le choisis.",
  },
  {
    icon: "mail",
    what: "Ton adresse de l'école",
    where: "Ton identifiant de connexion. Elle n'apparaît sur aucune page publique.",
  },
];

/**
 * Profil: "Tes infos" (photo, name, studies, read-only school email), then
 * what the student wants to hear about. Profile and photo are real and
 * private to the student; notification preferences are still a design shell
 * (their phase brings the sending).
 */
export default async function AccountProfilePage() {
  const { user } = await getSession();
  const profile = await getMyProfile();
  if (!user || !profile) return null;
  const avatarUrl = await getAvatarUrl(profile.avatarPath);

  const card = user.memberCard;
  const [preferences, bde] = await Promise.all([
    getNotificationPreferences(user.id),
    // Without a card, the way to the BDE's page, where the card is presented (#carte).
    card ? Promise.resolve(null) : getBde(),
  ]);
  const who = user.email;

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Profil"
        intro="Comment on t'appelle, ta photo, et ce que tu veux recevoir. Rien de plus."
        meta={
          <>
            {who && <span className="break-all">{who}</span>}
            <span>{card ? `Carte n° ${card.number}` : "Pas encore cotisant·e"}</span>
          </>
        }
      />

      <div className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-16 lg:col-span-8">
          <section aria-labelledby="infos-titre">
            <SectionHeader id="infos-titre" index="01" kicker="Qui tu es" title="Tes infos" />
            <div className="mt-8">
              <AvatarField name={accountName(user)} url={avatarUrl} />
            </div>
            <ProfileForm
              initial={{
                firstName: profile.firstName ?? "",
                lastName: profile.lastName ?? "",
                displayName: profile.displayName,
                program: profile.program,
                studyYear: profile.studyYear,
              }}
              email={user.email}
              className="mt-10"
            />
          </section>

          <section aria-labelledby="recus-titre">
            <SectionHeader
              id="recus-titre"
              index="02"
              kicker="Notifications"
              title="Ce que tu reçois"
              description="Coche où tu veux être prévenu·e, sorte par sorte. Le reste, tu le verras en passant sur le site."
            />
            <NotificationPreferencesForm preferences={preferences} email={user.email} className="mt-6" />
          </section>
        </div>

        <aside
          aria-label="À savoir sur ton profil"
          className="flex min-w-0 flex-col gap-10 lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:col-span-4 lg:col-start-9 lg:self-start"
        >
          <section aria-labelledby="visible-titre" className="border-t-2 border-fg pt-3">
            <h2 id="visible-titre" className="type-label text-muted">
              Où se voient tes infos
            </h2>
            <dl className="mt-2">
              {WHERE_IT_SHOWS.map((row) => (
                <div key={row.what} className="border-b border-line py-4">
                  <dt className="flex items-start gap-3 font-bold leading-snug">
                    <Icon name={row.icon} size={18} className="mt-0.5 shrink-0 text-accent-text" />
                    {row.what}
                  </dt>
                  <dd className="mt-1 pl-[1.875rem] type-small text-muted">{row.where}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="carte-profil-titre" className="border-t-2 border-fg pt-3">
            <h2 id="carte-profil-titre" className="type-label text-muted">
              Carte cotisante
            </h2>
            {card ? (
              <p className="mt-3 type-small">
                <span className="block font-mono text-[0.9375rem] font-bold">N° {card.number}</span>
                <span className="text-muted">
                  Saison {card.season}, valable jusqu&apos;au {formatDateLong(card.validUntil)}.
                </span>
              </p>
            ) : (
              <p className="mt-3 type-small text-muted">
                Pas encore cotisant·e. La carte à 30&nbsp;€ vaut pour l&apos;année universitaire ; une fois validée
                par le bureau, elle s&apos;affiche dans ton espace.
              </p>
            )}
            <Link
              href={card || !bde ? routes.account : `${routes.association(bde.slug)}#carte`}
              className="mt-4 inline-flex items-center gap-1.5 type-small font-bold hover:text-accent-text"
            >
              {card ? "Voir ma carte" : bde ? "Voir la carte cotisante" : "Retour à mon espace"}
              <Icon name="arrow-right" size={16} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
