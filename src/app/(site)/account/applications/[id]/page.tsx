import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, dateParts, formatDayFull, formatDayMonth, formatTime, formatWhen } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getApplication } from "@/lib/data/users";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { APPLICATION_TONE, positionAnchor } from "@/components/recruitment/campaign-facts";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplicationTimeline } from "@/components/account/ApplicationTimeline";
import { WithdrawApplication } from "@/components/account/WithdrawApplication";
import { applicationHint, formatFileSize, isOngoing, sinceWords } from "@/components/account/account-facts";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { user } = await getSession();
  const application = user ? await getApplication(user.id, id) : null;
  if (!application) return { title: "Candidature" };
  return {
    title: `${application.position.title} · ${application.campaign.association.name}`,
    description: `Ta candidature au poste ${application.position.title} chez ${application.campaign.association.name} : statut, prochaine étape et ce que tu as envoyé.`,
  };
}

/**
 * One application, as a paper file: who and which role, where it stands
 * (timeline with the bureau's notes), the next step as a ticket, the answers
 * shown back word for word, the attachments. In the margin: the role, who to
 * write to, and the withdraw action (PHASE 1 demo, says so).
 */
export default async function AccountApplicationPage({ params }: Props) {
  const { id } = await params;
  const { user } = await getSession();
  if (!user) return null;

  const application = await getApplication(user.id, id);
  if (!application) notFound();

  const now = new Date();
  const { campaign, position, status, nextStep } = application;
  const association = campaign.association;
  const draft = status === "brouillon";
  const upcoming = nextStep?.date && Date.parse(nextStep.date) > now.getTime() ? nextStep : null;
  const sent = application.submittedAt;
  const roleHref = `${routes.campaign(campaign.slug)}#${positionAnchor(position.id)}`;

  return (
    <div data-accent={association.accent}>
      <header className="wrap flex flex-col gap-5 pb-10 pt-8 sm:pt-12">
        <Breadcrumbs
          items={[
            { href: routes.account, label: "Mon espace" },
            { href: routes.accountApplications, label: "Mes candidatures" },
            { href: routes.accountApplication(application.id), label: position.title },
          ]}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AssociationIdentity association={association} />
          <span className="type-meta text-muted">{campaign.title}</span>
        </div>
        <h1 className="type-title max-w-4xl">{position.title}</h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <StatusBadge tone={APPLICATION_TONE[status]}>{APPLICATION_STATUS_LABEL[status]}</StatusBadge>
          <span className="type-meta text-muted">
            {sent
              ? `Envoyée le ${formatDayMonth(sent)} à ${formatTime(sent)}`
              : `Brouillon commencé ${sinceWords(application.createdAt, now)}`}
          </span>
          <span className="type-meta text-muted">Mise à jour {sinceWords(application.updatedAt, now)}</span>
        </div>
      </header>

      <div className="wrap grid gap-x-8 gap-y-14 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-14 lg:col-span-8">
          {/* What comes next: a dated step as a ticket, or the draft still to send */}
          {upcoming?.date ? (
            <section aria-labelledby="etape-titre" className="grid grid-cols-[5.25rem_minmax(0,1fr)] border-2 border-fg bg-raised sm:grid-cols-[7rem_minmax(0,1fr)]">
              <div data-surface="night" data-theme="dark" className="flex flex-col items-center justify-center gap-1 px-2 py-5 text-center">
                <span aria-hidden className="flex flex-col items-center gap-1">
                  <span className="type-label text-muted">{dateParts(upcoming.date).weekday}</span>
                  <span className="type-numeral text-[3rem] text-assoc-text sm:text-[3.6rem]">{dateParts(upcoming.date).day}</span>
                  <span className="type-label">{dateParts(upcoming.date).month}</span>
                  <span className="type-meta mt-1 text-muted">{formatTime(upcoming.date)}</span>
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-2 border-l-2 border-dashed border-fg p-4 sm:p-6">
                <h2 id="etape-titre" className="type-label text-assoc-text">
                  Prochaine étape
                </h2>
                <p className="type-card text-[1.3rem] sm:text-[1.5rem]">{upcoming.label}</p>
                <p className="type-meta">
                  <time dateTime={upcoming.date}>
                    <span aria-hidden>{formatWhen(upcoming.date, now)}</span>
                    <span className="sr-only">
                      {formatDayFull(upcoming.date)} à {formatTime(upcoming.date)}
                    </span>
                  </time>
                </p>
                {upcoming.location && (
                  <p className="flex items-start gap-2 type-small text-muted">
                    <Icon name="pin" size={15} className="mt-[0.2rem] shrink-0 text-subtle" />
                    {upcoming.location}
                  </p>
                )}
              </div>
            </section>
          ) : draft ? (
            <section aria-labelledby="etape-titre" className="flex flex-col gap-3 border-2 border-fg bg-raised p-4 sm:p-6">
              <h2 id="etape-titre" className="type-label text-assoc-text">
                À finir
              </h2>
              <p className="type-card text-[1.3rem]">{applicationHint(application, now)}.</p>
              <p className="max-w-2xl text-muted">
                Ton brouillon reste ici en attendant. Tu l&apos;enverras depuis la fiche de poste, où tu pourras encore
                tout modifier.
              </p>
              <div className="mt-1">
                <ButtonLink href={routes.campaign(campaign.slug)} variant="assoc" icon="arrow-right">
                  Voir la fiche de poste
                </ButtonLink>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="suivi-titre">
            <h2 id="suivi-titre" className="border-t-2 border-fg pt-3 type-section">
              Où en est ta candidature
            </h2>
            <ApplicationTimeline application={application} now={now} className="mt-7" />
          </section>

          <section aria-labelledby="reponses-titre">
            <h2 id="reponses-titre" className="border-t-2 border-fg pt-3 type-section">
              {draft ? "Ton brouillon" : "Ce que tu as envoyé"}
            </h2>
            <p className="mt-3 text-muted">
              {draft ? "Tes réponses telles qu'enregistrées, pas encore envoyées." : "Tes réponses, mot pour mot, telles que le bureau les lit."}
            </p>
            {application.answers.length > 0 ? (
              <dl className="mt-6 flex flex-col">
                {application.answers.map((qa) => (
                  <div key={qa.question} className="flex flex-col gap-2 border-t border-line py-5">
                    <dt className="font-bold leading-snug">{qa.question}</dt>
                    <dd className="max-w-[68ch] whitespace-pre-line border-l-2 border-assoc pl-4 leading-relaxed">
                      {qa.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-6 border-t border-line pt-5 text-muted">Aucune réponse pour l&apos;instant.</p>
            )}
          </section>

          <section aria-labelledby="pieces-titre">
            <h2 id="pieces-titre" className="border-t-2 border-fg pt-3 type-section">
              Pièces jointes
            </h2>
            {application.attachments.length > 0 ? (
              <ul className="mt-6 border-b border-line">
                {application.attachments.map((file) => (
                  <li key={file.name} className="flex items-center gap-3 border-t border-line py-3.5">
                    <Icon name="file" size={20} className="shrink-0 text-assoc-text" />
                    <span className="min-w-0 flex-1 break-all font-semibold">{file.name}</span>
                    <span className="shrink-0 type-meta text-muted">{formatFileSize(file.sizeKb)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 border-t border-line pt-5 text-muted">Pas de pièce jointe avec cette candidature.</p>
            )}
            <p className="mt-3 type-small text-subtle">
              {draft
                ? "Elles partiront avec ton brouillon quand tu l'enverras."
                : `Les fichiers tels que ${association.name} les a reçus. Pour en changer, écris au contact du recrutement.`}
            </p>
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:col-span-4 lg:self-start">
          <section aria-labelledby="poste-titre" className="border-2 border-fg bg-raised p-5 sm:p-6">
            <h2 id="poste-titre" className="type-label text-muted">
              Le poste
            </h2>
            <p className="mt-3 type-card">{position.title}</p>
            {position.team && <p className="type-small text-muted">{position.team}</p>}
            <p className="mt-3 type-small">{position.summary}</p>
            <p className="mt-3 flex items-start gap-2 type-small text-muted">
              <Icon name="clock" size={15} className="mt-[0.2rem] shrink-0 text-subtle" />
              {position.commitment}
            </p>
            <Link href={roleHref} className="mt-4 inline-flex items-center gap-1.5 type-small font-bold hover:text-assoc-text">
              Revoir la fiche de poste
              <Icon name="arrow-right" size={16} />
            </Link>
          </section>

          <section aria-labelledby="contact-titre" className="border-t-2 border-fg pt-3">
            <h2 id="contact-titre" className="type-label text-muted">
              Une question ?
            </h2>
            <p className="mt-3">
              <span className="font-bold">{campaign.contact.name}</span>
              <span className="text-muted">, {campaign.contact.role.toLowerCase()}</span>
            </p>
            <a
              href={`mailto:${campaign.contact.email}`}
              className="mt-1 inline-flex max-w-full items-center gap-2 break-all font-mono text-[0.875rem] text-assoc-text hover:underline"
            >
              <Icon name="mail" size={16} className="shrink-0" />
              {campaign.contact.email}
            </a>
          </section>

          {isOngoing(application) && (
            <section aria-labelledby="retrait-titre" className="border-t-2 border-fg pt-3">
              <h2 id="retrait-titre" className="type-label text-muted">
                Changer d&apos;avis
              </h2>
              <p className="mt-3 mb-4 type-small text-muted">
                {draft
                  ? "Tu ne comptes plus l'envoyer ? Tu peux l'abandonner."
                  : "Tu peux retirer ta candidature tant que le bureau n'a pas répondu."}
              </p>
              <WithdrawApplication associationName={association.name} draft={draft} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
