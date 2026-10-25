import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, formatDayFull, formatDayMonth, formatTime } from "@/lib/format";
import { getSession } from "@/lib/session";
import { withNext } from "@/lib/auth/next-path";
import { getMyApplication } from "@/lib/recruitment/me";
import {
  APPLICATION_STATUS,
  HISTORY_LABEL,
  campaignStatus,
  refusalLabel,
  retentionLines,
  type MyApplicationPayload,
} from "@/lib/recruitment/model";
import { answerText, isDocumentQuestion } from "@/lib/recruitment/form";
import { sizeLabel } from "@/lib/recruitment/documents";
import { organizationRef } from "@/lib/posts/model";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { APPLICATION_TONE } from "@/components/recruitment/campaign-facts";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DoneNotice, Notice } from "@/components/manage/governance/Notices";
import { ApplicationEditor } from "@/components/account/application/ApplicationEditor";
import { RefreshForm } from "@/components/account/application/RefreshForm";
import { WithdrawApplication } from "@/components/account/WithdrawApplication";
import { sinceWords } from "@/components/account/account-facts";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getMyApplication(id.toLowerCase());
  if (!result.ok) return { title: "Candidature", robots: { index: false } };
  const { position, campaign } = result.data;
  return {
    title: `${position.title} · ${campaign.organization.name}`,
    robots: { index: false },
  };
}

function doneMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "envoyee") return "Candidature envoyée. Tu la retrouves ici, telle que tu l'as envoyée ; un message de confirmation est dans tes notifications.";
  if (code === "retiree") return "Candidature retirée. Elle reste lisible ici.";
  if (code === "deja") return "Tu as déjà envoyé une candidature à ce poste : la voici.";
  const m = /^formulaire-(\d{1,3})$/.exec(code);
  if (m) {
    const n = Number(m[1]);
    return n === 0
      ? "Ton brouillon suit maintenant la nouvelle version du formulaire. Toutes tes réponses ont été gardées."
      : `Ton brouillon suit maintenant la nouvelle version du formulaire. ${n} réponse${n > 1 ? "s" : ""} à des questions qui ont changé ou disparu ${n > 1 ? "ont" : "a"} été retirée${n > 1 ? "s" : ""} : vérifie chaque étape.`;
  }
  return null;
}

const dayAndTime = (iso: string) => `${formatDayFull(iso)} à ${formatTime(iso)}`;

/**
 * One of the student's own applications (my_application: theirs only;
 * anyone else's is "not found"). A draft opens in the editor; a sent or
 * withdrawn application reads as a paper file: the answers word for word
 * against the form version it was sent on, the documents (downloadable by
 * the student alone), and its own history. Nothing here says it was read,
 * reviewed or answered: those steps come with the review system.
 */
export default async function AccountApplicationPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const { user } = await getSession();
  if (!user) redirect(withNext(routes.login, routes.accountApplication(id)));

  const result = await getMyApplication(id.toLowerCase());
  if (!result.ok) {
    if (result.code === "not_authenticated") redirect(withNext(routes.login, routes.accountApplication(id)));
    notFound();
  }
  const data: MyApplicationPayload = result.data;
  const { application: a, campaign, position, form, documents, candidate, history, privacy } = data;
  const now = new Date();
  const status = APPLICATION_STATUS[a.status];
  const association = organizationRef(campaign.organization);
  const draft = a.status === "draft";
  const done = doneMessage(Array.isArray(sp.fait) ? sp.fait[0] : sp.fait);
  const closes = position.closes_at ?? campaign.closes_at;
  const deadline = closes ? `À envoyer avant le ${formatDayMonth(closes)} à ${formatTime(closes)}` : "À envoyer avant la date limite";
  const campaignHref = campaign.slug ? routes.campaign(campaign.slug) : null;
  const positionHref = campaign.slug ? routes.campaignPosition(campaign.slug, position.slug) : null;
  const state = campaignStatus(campaign.state, campaign.closes_at, now);

  return (
    <div data-accent={association.accent}>
      <header className="wrap flex flex-col gap-5 pb-10 pt-8 sm:pt-12">
        <Breadcrumbs
          items={[
            { href: routes.account, label: "Mon espace" },
            { href: routes.accountApplications, label: "Mes candidatures" },
            { href: routes.accountApplication(a.id), label: position.title },
          ]}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AssociationIdentity association={association} />
          {campaignHref ? (
            <Link href={campaignHref} className="type-meta text-muted hover:text-fg hover:underline">
              {campaign.title}
            </Link>
          ) : (
            <span className="type-meta text-muted">{campaign.title}</span>
          )}
        </div>
        <h1 className="type-title max-w-4xl">{position.title}</h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <StatusBadge tone={APPLICATION_TONE[status]}>{APPLICATION_STATUS_LABEL[status]}</StatusBadge>
          <span className="type-meta text-muted">
            {a.submitted_at
              ? `Envoyée le ${formatDayMonth(a.submitted_at)} à ${formatTime(a.submitted_at)}`
              : `Brouillon commencé ${sinceWords(a.created_at, now)}`}
          </span>
          {a.reference && a.submitted_at && <span className="type-meta text-muted">Référence {a.reference}</span>}
        </div>
      </header>

      <div className="wrap flex flex-col gap-8">
        <DoneNotice message={done} />

        {draft && a.form_changed && (
          <Notice tone="info" icon="info" title="Le formulaire a changé depuis que tu as commencé">
            <p>
              L&apos;association a publié une nouvelle version. Pour envoyer, passe à la nouvelle version : tes réponses aux
              questions qui n&apos;ont pas changé sont gardées, les autres te seront redemandées.
            </p>
            <RefreshForm applicationId={a.id} />
          </Notice>
        )}
        {draft && a.refusal && (
          <Notice tone="danger" icon="lock" title="Ce brouillon ne peut pas être envoyé pour l'instant">
            <p>{refusalLabel(a.refusal)}</p>
          </Notice>
        )}
        {draft && !a.refusal && a.eligibility && (
          <Notice tone="danger" icon="lock" title="Tu ne peux pas envoyer ce brouillon">
            <p>
              {refusalLabel(a.eligibility)}{" "}
              <Link href={routes.accountProfile} className="underline underline-offset-2">
                Mon profil
              </Link>
            </p>
          </Notice>
        )}

        {draft ? (
          <ApplicationEditor
            applicationId={a.id}
            version={a.version}
            positionId={position.id}
            form={form}
            answers={a.answers ?? {}}
            documents={documents}
            lastSavedAt={a.last_saved_at}
            candidate={candidate}
            privacy={{ notice: privacy.notice, contact: privacy.contact, retention: retentionLines(privacy) }}
            blocked={a.form_changed ? "Passe d'abord à la nouvelle version du formulaire (plus haut)." : refusalLabel(a.refusal ?? a.eligibility)}
            deadline={deadline}
          />
        ) : (
          <div className="grid gap-x-8 gap-y-14 lg:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-14 lg:col-span-8">
              <section aria-labelledby="reponses-titre">
                <h2 id="reponses-titre" className="border-t-2 border-fg pt-3 type-section">
                  Ce que tu as envoyé
                </h2>
                <p className="mt-3 text-muted">
                  Tes réponses, mot pour mot, telles qu&apos;enregistrées à l&apos;envoi (version {a.form_version} du formulaire).
                </p>
                {form.sections.map((s) => {
                  const qs = form.questions.filter((q) => q.scope === "shared" && q.section === s.id);
                  return qs.length > 0 ? <AnswerList key={s.id} title={s.title} questions={qs} data={data} /> : null;
                })}
                {form.questions.some((q) => q.scope === position.id) && (
                  <AnswerList title="Pour ce poste" questions={form.questions.filter((q) => q.scope === position.id)} data={data} />
                )}
              </section>

              <section aria-labelledby="historique-titre">
                <h2 id="historique-titre" className="border-t-2 border-fg pt-3 type-section">
                  Historique
                </h2>
                <ol className="mt-6 flex flex-col border-b border-line">
                  {history.map((h, i) => (
                    <li key={`${h.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-3">
                      <span className="font-semibold">{HISTORY_LABEL[h.action] ?? h.action}</span>
                      <time dateTime={h.at} className="type-meta text-muted">
                        {dayAndTime(h.at)}
                      </time>
                    </li>
                  ))}
                </ol>
                {a.withdrawal_reason && <p className="mt-3 type-small text-muted">Ta raison : {a.withdrawal_reason}</p>}
              </section>
            </div>

            <aside className="flex flex-col gap-6 lg:col-span-4 lg:self-start">
              <section aria-labelledby="poste-titre" className="border-2 border-fg bg-raised p-5 sm:p-6">
                <h2 id="poste-titre" className="type-label text-muted">
                  Le poste
                </h2>
                <p className="mt-3 type-card">{position.title}</p>
                {position.team && <p className="type-small text-muted">{position.team}</p>}
                {positionHref ? (
                  <Link href={positionHref} className="mt-4 inline-flex items-center gap-1.5 type-small font-bold hover:text-assoc-text">
                    Revoir la fiche de poste
                    <Icon name="arrow-right" size={16} />
                  </Link>
                ) : (
                  <p className="mt-3 type-small text-muted">La fiche de ce recrutement n&apos;est plus en ligne.</p>
                )}
              </section>

              {campaign.contact && (campaign.contact.name || campaign.contact.email) && (
                <section aria-labelledby="contact-titre" className="border-t-2 border-fg pt-3">
                  <h2 id="contact-titre" className="type-label text-muted">
                    Une question ?
                  </h2>
                  {campaign.contact.name && (
                    <p className="mt-3">
                      <span className="font-bold">{campaign.contact.name}</span>
                      {campaign.contact.role && <span className="text-muted">, {campaign.contact.role.toLowerCase()}</span>}
                    </p>
                  )}
                  {campaign.contact.email && (
                    <a
                      href={`mailto:${campaign.contact.email}`}
                      className="mt-1 inline-flex max-w-full items-center gap-2 break-all font-mono text-[0.875rem] text-assoc-text hover:underline"
                    >
                      <Icon name="mail" size={16} className="shrink-0" />
                      {campaign.contact.email}
                    </a>
                  )}
                </section>
              )}

              {a.status === "submitted" && (
                <section aria-labelledby="retrait-titre" className="border-t-2 border-fg pt-3">
                  <h2 id="retrait-titre" className="type-label text-muted">
                    Changer d&apos;avis
                  </h2>
                  <p className="mb-4 mt-3 type-small text-muted">
                    Envoyée ne veut pas dire acceptée. Tu peux retirer ta candidature à tout moment.
                  </p>
                  <WithdrawApplication applicationId={a.id} associationName={association.name} />
                </section>
              )}
              {state === "annulee" && (
                <p className="type-small text-muted">
                  L&apos;association a annulé ce recrutement{campaign.cancellation_reason ? ` : ${campaign.cancellation_reason}` : "."}
                </p>
              )}
            </aside>
          </div>
        )}
      </div>
      <div aria-hidden className="h-[var(--section)]" />
    </div>
  );
}

function AnswerList({ title, questions, data }: { title: string; questions: MyApplicationPayload["form"]["questions"]; data: MyApplicationPayload }) {
  return (
    <div className="mt-8 flex flex-col gap-2">
      <h3 className="type-label text-muted">{title}</h3>
      <dl className="flex flex-col">
        {questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-2 border-t border-line py-5">
            <dt className="font-bold leading-snug">{q.label}</dt>
            <dd className="max-w-[68ch] whitespace-pre-line border-l-2 border-assoc pl-4 leading-relaxed">
              {isDocumentQuestion(q) ? (
                <DocumentLinks documents={data.documents.filter((d) => d.question_id === q.id)} />
              ) : (
                answerText(q, data.application.answers?.[q.id]) || <span className="text-muted">Pas de réponse</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DocumentLinks({ documents }: { documents: MyApplicationPayload["documents"] }) {
  if (documents.length === 0) return <span className="text-muted">Aucun fichier</span>;
  return (
    <ul className="flex flex-col gap-1.5">
      {documents.map((d) => (
        <li key={d.id}>
          <a href={routes.applicationDocument(d.id)} className="inline-flex items-center gap-2 font-semibold hover:underline">
            <Icon name="file" size={18} className="shrink-0 text-assoc-text" />
            {d.file_name}
            <span className="type-meta font-normal text-muted">{sizeLabel(d.size_bytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

