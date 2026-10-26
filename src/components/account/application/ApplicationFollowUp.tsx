import { formatDayMonth, formatTime } from "@/lib/format";
import {
  CANDIDATE_STAGE,
  slotsByDay,
  type CandidateClarification,
  type CandidateInterview,
  type CandidateOutcome,
  type CandidateSlot,
  type CandidateStage,
} from "@/lib/recruitment/candidate";
import { MODE_LABEL } from "@/lib/recruitment/review";
import { bookSlot, respondToOffer } from "@/app/actions/recruitment-review";
import { Field, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { ClarificationAnswer } from "./ClarificationAnswer";

const when = (iso: string) => `${formatDayMonth(iso)} à ${formatTime(iso)}`;

/**
 * What happens to an application once it is sent, as its candidate sees it
 * (Phase 9): where it stands in plain words, and what the association asks
 * of them: a slot to choose, a question to answer, an offer to accept or
 * decline. Never a score, a note, a reviewer's name or an internal stage.
 */
export function ApplicationFollowUp({
  applicationId,
  associationName,
  stage,
  interview,
  clarifications,
  outcome,
}: {
  applicationId: string;
  associationName: string;
  stage: CandidateStage;
  interview: CandidateInterview | null;
  clarifications: CandidateClarification[];
  outcome: CandidateOutcome | null;
}) {
  const s = CANDIDATE_STAGE[stage.key];
  const open = clarifications.filter((q) => q.status === "open");
  const past = clarifications.filter((q) => q.status !== "open");

  return (
    <section aria-labelledby="suivi-titre" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 border-2 border-fg bg-raised p-5 sm:p-6">
        <h2 id="suivi-titre" className="type-label text-muted">
          Où en est ta candidature
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
          {stage.since && <span className="type-meta text-muted">depuis le {when(stage.since)}</span>}
        </div>
        <p className="text-muted">{stageText(stage, associationName)}</p>
        {s.action && (
          <p className="font-bold">
            {s.action}
            {stage.deadline ? ` avant le ${when(stage.deadline)}` : ""}.
          </p>
        )}
      </div>

      {outcome && <OutcomeBlock outcome={outcome} associationName={associationName} />}

      {open.map((q) => (
        <div key={q.id} className="flex flex-col gap-4 border-t-2 border-fg pt-3">
          <h2 className="type-section">Une question de l&apos;association</h2>
          <p className="type-meta text-muted">Posée le {when(q.asked_at)}</p>
          <p className="whitespace-pre-line border-l-2 border-assoc pl-4 font-semibold leading-relaxed">{q.question}</p>
          <ClarificationAnswer applicationId={applicationId} clarification={q} />
        </div>
      ))}

      {interview && <InterviewBlock interview={interview} />}

      {past.length > 0 && (
        <div className="flex flex-col gap-3 border-t-2 border-fg pt-3">
          <h2 className="type-section">Questions et réponses</h2>
          <ol className="flex flex-col gap-4">
            {past.map((q) => (
              <li key={q.id} className="flex flex-col gap-2 border-t border-line pt-3">
                <p className="font-semibold">{q.question}</p>
                {q.answer ? (
                  <p className="whitespace-pre-line border-l-2 border-assoc pl-4">{q.answer}</p>
                ) : (
                  <p className="type-small text-muted">Délai dépassé, sans réponse.</p>
                )}
                {q.answered_at && <p className="type-meta text-muted">Répondu le {when(q.answered_at)}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function stageText(stage: CandidateStage, association: string): string {
  switch (stage.key) {
    case "received":
      return `${association} a bien reçu ta candidature. Elle n'a pas encore été examinée.`;
    case "under_review":
      return `${association} examine ta candidature. Tu seras prévenu·e ici et par notification dès qu'il y a du nouveau.`;
    case "question":
      return `${association} te pose une question sur ta candidature (juste en dessous).`;
    case "interview_to_book":
      return `${association} t'invite à un entretien : choisis le créneau qui te va (juste en dessous).`;
    case "interview_scheduled":
      return stage.at ? `Ton entretien est prévu le ${when(stage.at)}. Les détails sont juste en dessous.` : "Ton entretien est prévu.";
    case "offer":
      return `${association} te propose le poste. Réponds juste en dessous.`;
    case "offer_accepted":
      return `Tu as accepté la proposition. ${association} t'enverra l'invitation pour rejoindre son équipe.`;
    case "offer_declined":
      return "Tu as décliné la proposition.";
    case "offer_expired":
      return "Le délai pour répondre à la proposition est passé.";
    case "offer_withdrawn":
      return `${association} a retiré sa proposition.`;
    case "not_selected":
      return `${association} n'a pas retenu ta candidature pour ce poste.`;
    case "waitlisted":
      return `Ta candidature est sur liste d'attente : si une place se libère, ${association} pourra revenir vers toi.`;
    case "withdrawn":
      return "Tu as retiré cette candidature.";
    default:
      return "";
  }
}

function OutcomeBlock({ outcome, associationName }: { outcome: CandidateOutcome; associationName: string }) {
  const offer = outcome.offer;
  return (
    <div className="flex flex-col gap-4 border-t-2 border-fg pt-3">
      <h2 className="type-section">
        {outcome.outcome === "offer" ? "La proposition" : outcome.outcome === "waitlist" ? "Liste d'attente" : "La réponse de l'association"}
      </h2>
      <p className="type-meta text-muted">Annoncée le {when(outcome.released_at)}</p>
      {outcome.message && <p className="max-w-[68ch] whitespace-pre-line border-l-2 border-assoc pl-4 leading-relaxed">{outcome.message}</p>}
      {offer?.status === "pending" && (
        <div className="flex flex-col gap-4">
          {offer.expires_at && <p className="font-bold">Réponds avant le {when(offer.expires_at)}.</p>}
          <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
            <ActionForm action={respondToOffer} hidden={{ offer_id: offer.id, accept: "1" }} submitLabel="J'accepte" submitIcon="check">
              <p className="type-small text-muted">
                {associationName} est prévenue et t&apos;enverra l&apos;invitation pour rejoindre son équipe.
              </p>
            </ActionForm>
            <Disclosure summary="Je décline" icon="close">
              <ActionForm action={respondToOffer} hidden={{ offer_id: offer.id, accept: "0" }} submitLabel="Décliner la proposition" variant="secondary">
                <Field label="Un mot pour l'association" optional hint="500 caractères au plus.">
                  {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="note" rows={2} maxLength={500} />}
                </Field>
              </ActionForm>
            </Disclosure>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotPicker({ interviewId, slots, submitLabel }: { interviewId: string; slots: CandidateSlot[]; submitLabel: string }) {
  if (slots.length === 0) {
    return (
      <p className="type-small text-muted">
        Aucun créneau libre pour l&apos;instant. L&apos;association en ouvrira ; tu seras prévenu·e, ou écris-lui si le temps presse.
      </p>
    );
  }
  return (
    <ActionForm action={bookSlot} hidden={{ interview_id: interviewId }} submitLabel={submitLabel} submitIcon="check">
      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">Créneaux libres</legend>
        {slotsByDay(slots).map((g) => (
          <div key={g.day} className="flex flex-col gap-2">
            <p className="type-label text-muted first-letter:uppercase">{g.day}</p>
            <div className="flex flex-wrap gap-2">
              {g.slots.map((s) => (
                <label
                  key={s.id}
                  className="focus-ring-within flex cursor-pointer flex-col rounded-sm border-2 border-line bg-raised px-3.5 py-2 transition-colors hover:border-line-strong has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg"
                >
                  <input type="radio" name="slot_id" value={s.id} className="sr-only" required />
                  <span className="font-bold">
                    {formatTime(s.starts_at)} – {formatTime(s.ends_at)}
                  </span>
                  <span className="type-small opacity-80">
                    {MODE_LABEL[s.mode]}
                    {s.location ? ` · ${s.location}` : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
    </ActionForm>
  );
}

function InterviewBlock({ interview: i }: { interview: CandidateInterview }) {
  return (
    <div className="flex flex-col gap-4 border-t-2 border-fg pt-3">
      <h2 className="type-section">Entretien</h2>
      {i.message && <p className="max-w-[68ch] whitespace-pre-line border-l-2 border-assoc pl-4 leading-relaxed">{i.message}</p>}
      {i.status === "invited" ? (
        <>
          <p className="text-muted">
            Choisis un créneau{i.respond_by ? ` avant le ${when(i.respond_by)}` : ""}. Une fois réservé, il est à toi : personne d&apos;autre
            ne peut le prendre. Heures de Paris.
          </p>
          <SlotPicker interviewId={i.id} slots={i.slots} submitLabel="Réserver ce créneau" />
        </>
      ) : (
        i.slot && (
          <>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)]">
              <dt className="text-muted">Quand</dt>
              <dd className="font-bold">
                {when(i.slot.starts_at)} – {formatTime(i.slot.ends_at)}
              </dd>
              <dt className="text-muted">Comment</dt>
              <dd>
                {MODE_LABEL[i.slot.mode]}
                {i.slot.location ? ` · ${i.slot.location}` : ""}
              </dd>
              {i.slot.meeting_link && (
                <>
                  <dt className="text-muted">Lien</dt>
                  <dd className="break-all">
                    <a href={i.slot.meeting_link} target="_blank" rel="noreferrer noopener" className="font-semibold underline underline-offset-2">
                      {i.slot.meeting_link}
                    </a>
                  </dd>
                </>
              )}
              {i.slot.instructions && (
                <>
                  <dt className="text-muted">Consignes</dt>
                  <dd className="whitespace-pre-line">{i.slot.instructions}</dd>
                </>
              )}
            </dl>
            {i.can_change ? (
              <Disclosure summary="Changer de créneau" icon="calendar">
                <SlotPicker interviewId={i.id} slots={i.slots} submitLabel="Prendre ce créneau à la place" />
              </Disclosure>
            ) : (
              <p className="type-small text-muted">À moins de 24 heures de l&apos;entretien, pour changer, écris directement à l&apos;association.</p>
            )}
          </>
        )
      )}
    </div>
  );
}
