import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDayFull, formatTime, plural } from "@/lib/format";
import { toDateInput } from "@/lib/governance/labels";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { getInterviewBoard } from "@/lib/recruitment/review-data";
import { INTERVIEW_STATUS_LABEL, MODE_LABEL, type InterviewBoard } from "@/lib/recruitment/review";
import { cancelSlot, createSlots, updateSlot } from "@/app/actions/recruitment-review";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { loadReviewFrame, ReviewDenied, ReviewHeader, ReviewUnavailable } from "@/components/manage/review/ReviewFrame";
import { at } from "@/components/manage/review/ApplicationPanels";

type Params = Promise<{ asso: string; campaign: string }>;

export const metadata: Metadata = { title: "Entretiens" };

type Slot = InterviewBoard["slots"][number];

function byDay(slots: Slot[]): { day: string; slots: Slot[] }[] {
  const out: { day: string; slots: Slot[] }[] = [];
  for (const s of slots) {
    const day = formatDayFull(s.starts_at);
    const last = out.at(-1);
    if (last && last.day === day) last.slots.push(s);
    else out.push({ day, slots: [s] });
  }
  return out;
}

/**
 * /manage/[asso]/recruitment/[campaign]/entretiens — interview slots. Whoever
 * holds the "interviews" power opens slots (one candidate per slot, an
 * interviewer never in two places at once: the database refuses overlaps)
 * and sees who still has to choose one. An interviewer sees only their own
 * slots, and a candidate's name only when they may open that application.
 * Candidates book from their own space; a booking is atomic.
 */
export default async function InterviewsPage({ params }: { params: Params }) {
  const { asso, campaign } = await params;
  const frame = await loadReviewFrame(asso, campaign, "entretiens");
  if (!frame.ok) return frame.node;
  const { ctx, access, campaignId, has } = frame;
  if (!has("view")) return <ReviewDenied asso={asso} access={access} what="Le planning des entretiens" />;
  const board = await getInterviewBoard(campaignId);
  if (!board.ok) return <ReviewUnavailable asso={asso} message={governanceErrorMessage(board.code)} />;
  const { can, positions, interviewers, slots, waiting } = board.data;
  const readOnly = readOnlyReason(ctx);
  const writable = !readOnly && !access.archived;
  const manage = can.manage && writable;
  const now = new Date().getTime();
  const upcoming = slots.filter((s) => Date.parse(s.ends_at) > now);
  const past = slots.filter((s) => Date.parse(s.ends_at) <= now);

  return (
    <div className="flex flex-col gap-10">
      <ReviewHeader
        asso={asso}
        access={access}
        description={
          <p>
            {can.manage
              ? "Ouvre des créneaux ; les personnes invitées en choisissent un depuis leur espace. Un créneau = une personne, et personne du comité n'est à deux endroits à la fois."
              : "Les entretiens que tu fais passer. Les créneaux sont ouverts par les personnes qui organisent les entretiens."}{" "}
            Heures de Paris.
          </p>
        }
      />
      {readOnly && <ReadOnlyNotice reason={readOnly} />}

      {manage && (
        <ManageSection title="Ouvrir des créneaux">
          <ActionForm action={createSlots} hidden={{ campaign_id: campaignId }} submitLabel="Ouvrir les créneaux" className="max-w-3xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Jour">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} type="date" name="date" min={toDateInput(new Date())} required />
                )}
              </Field>
              <Field label="Heures de début" hint="Séparées par des virgules : 14:00, 14:30, 15:00. 60 au plus.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="times" required placeholder="Ex : 14:00, 14:30, 15:00" />}
              </Field>
              <Field label="Durée">
                {({ id, describedBy }) => (
                  <Select id={id} aria-describedby={describedBy} name="minutes" defaultValue="30">
                    {[15, 20, 30, 45, 60, 90].map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Pour quel poste">
                {({ id, describedBy }) => (
                  <Select id={id} aria-describedby={describedBy} name="position_id" defaultValue="">
                    <option value="">Tous les postes</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Comment">
                {({ id, describedBy }) => (
                  <Select id={id} aria-describedby={describedBy} name="mode" defaultValue="in_person">
                    <option value="in_person">{MODE_LABEL.in_person}</option>
                    <option value="online">{MODE_LABEL.online}</option>
                    <option value="phone">{MODE_LABEL.phone}</option>
                  </Select>
                )}
              </Field>
              <Field label="Lieu" optional hint="Obligatoire sur place (salle, bâtiment). Visible des personnes invitées.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="location" maxLength={200} placeholder="Ex : salle B204" />}
              </Field>
              <Field label="Lien de visio" optional hint="En visio seulement, en https. Donné à la personne une fois le créneau réservé, jamais avant.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="meeting_link" type="url" maxLength={500} />}
              </Field>
              <Field label="Consignes" optional hint="Ce qu'il faut préparer, comment trouver la salle… 1 000 caractères au plus.">
                {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="instructions" rows={2} maxLength={1000} />}
              </Field>
            </div>
            {(interviewers ?? []).length > 0 && (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-[0.95rem] font-bold">Qui fait passer l&apos;entretien</legend>
                <div className="flex flex-wrap gap-x-6">
                  {(interviewers ?? []).map((m) => (
                    <Checkbox key={m.id} name="member_ids" value={m.id} label={m.name} />
                  ))}
                </div>
                <p className="type-small text-subtle">
                  Les personnes choisies voient la candidature de qui réserve, et peuvent évaluer l&apos;entretien.
                </p>
              </fieldset>
            )}
          </ActionForm>
        </ManageSection>
      )}

      {waiting && waiting.length > 0 && (
        <ManageSection title="Invitées, sans créneau choisi" count={waiting.length}>
          <ul className="flex flex-col border-y border-line">
            {waiting.map((w) => (
              <li key={w.interview_id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3 last:border-b-0">
                <span>
                  <Link href={routes.manageApplication(asso, campaignId, w.application_id)} className="font-bold hover:underline">
                    {w.name}
                  </Link>
                  <span className="type-small text-muted">
                    {" "}
                    · {w.position} · {w.reference}
                  </span>
                </span>
                <span className="type-meta text-subtle">
                  Invitée {at(w.invited_at)}
                  {w.respond_by ? ` · à choisir avant le ${at(w.respond_by)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </ManageSection>
      )}

      <ManageSection title="À venir" count={upcoming.filter((s) => !s.cancelled_at).length}>
        {upcoming.length === 0 ? (
          <ManageEmpty icon="calendar" title="Pas de créneau à venir">
            <p>{can.manage ? "Ouvre des créneaux plus haut, puis invite des personnes depuis la liste des candidatures." : "Aucun entretien prévu avec toi pour l'instant."}</p>
          </ManageEmpty>
        ) : (
          <SlotDays days={byDay(upcoming)} asso={asso} campaignId={campaignId} manage={manage} interviewers={interviewers ?? []} now={now} />
        )}
      </ManageSection>

      {past.length > 0 && (
        <ManageSection title="Passés (30 derniers jours)" count={past.length}>
          <SlotDays days={byDay(past).reverse()} asso={asso} campaignId={campaignId} manage={false} interviewers={[]} now={now} />
        </ManageSection>
      )}
    </div>
  );
}

function SlotDays({
  days,
  asso,
  campaignId,
  manage,
  interviewers,
  now,
}: {
  days: { day: string; slots: Slot[] }[];
  now: number;
  asso: string;
  campaignId: string;
  manage: boolean;
  interviewers: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {days.map((g) => (
        <div key={g.day} className="flex flex-col gap-2">
          <h3 className="type-label text-muted first-letter:uppercase">{g.day}</h3>
          <ul className="flex flex-col border-y border-line">
            {g.slots.map((s) => (
              <li key={s.id} className="grid gap-x-6 gap-y-2 border-b border-line py-3 last:border-b-0 md:grid-cols-[8rem_minmax(0,1fr)_auto]">
                <span className="font-bold">
                  {formatTime(s.starts_at)} – {formatTime(s.ends_at)}
                </span>
                <div className="flex min-w-0 flex-col gap-1 type-small">
                  <span>
                    {MODE_LABEL[s.mode]}
                    {s.location ? ` · ${s.location}` : ""}
                    {s.position ? ` · ${s.position.title}` : " · tous les postes"}
                  </span>
                  <span className="text-muted">
                    Avec {s.interviewers.length ? s.interviewers.map((m) => m.name).join(", ") : "personne de désigné"}
                    {s.mine ? " (toi compris)" : ""}
                  </span>
                  {s.meeting_link && (
                    <a href={s.meeting_link} target="_blank" rel="noreferrer noopener" className="break-all underline underline-offset-2">
                      {s.meeting_link}
                    </a>
                  )}
                  {s.cancelled_at ? (
                    <StatusBadge tone="neutral">Annulé</StatusBadge>
                  ) : s.booking ? (
                    <span>
                      <StatusBadge tone={s.booking.status === "scheduled" ? "info" : s.booking.status === "completed" ? "ok" : "neutral"}>
                        {INTERVIEW_STATUS_LABEL[s.booking.status]}
                      </StatusBadge>{" "}
                      {s.booking.name ? (
                        <Link href={routes.manageApplication(asso, campaignId, s.booking.application_id)} className="font-semibold hover:underline">
                          {s.booking.name}
                        </Link>
                      ) : (
                        <span className="text-muted">Réservé ({s.booking.reference})</span>
                      )}
                      <span className="text-muted"> · {s.booking.position}</span>
                    </span>
                  ) : (
                    <span className="text-subtle">Libre</span>
                  )}
                </div>
                {manage && !s.cancelled_at && Date.parse(s.starts_at) > now && (
                  <div className="flex flex-col gap-2 md:w-72">
                    <Disclosure summary="Modifier" icon="edit">
                      <ActionForm action={updateSlot} hidden={{ slot_id: s.id }} submitLabel="Enregistrer">
                        <Field label="Lieu" optional>
                          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="location" maxLength={200} defaultValue={s.location ?? ""} />}
                        </Field>
                        {s.mode === "online" && (
                          <Field label="Lien de visio" optional>
                            {({ id, describedBy }) => (
                              <Input id={id} aria-describedby={describedBy} name="meeting_link" type="url" maxLength={500} defaultValue={s.meeting_link ?? ""} />
                            )}
                          </Field>
                        )}
                        <Field label="Consignes" optional>
                          {({ id, describedBy }) => (
                            <Textarea id={id} aria-describedby={describedBy} name="instructions" rows={2} maxLength={1000} defaultValue={s.instructions ?? ""} />
                          )}
                        </Field>
                        {interviewers.length > 0 && (
                          <fieldset className="flex flex-col gap-1">
                            <legend className="mb-1 type-small font-bold">Avec</legend>
                            {interviewers.map((m) => (
                              <Checkbox key={m.id} name="member_ids" value={m.id} label={m.name} defaultChecked={s.interviewers.some((x) => x.id === m.id)} />
                            ))}
                          </fieldset>
                        )}
                      </ActionForm>
                    </Disclosure>
                    <Disclosure summary="Annuler le créneau" icon="close" tone="danger">
                      <ActionForm action={cancelSlot} hidden={{ slot_id: s.id }} submitLabel="Annuler le créneau" variant="danger">
                        <Field label="Raison" optional hint={s.booking ? "Envoyée à la personne qui l'avait réservé ; elle rechoisit un créneau." : undefined}>
                          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={2} maxLength={500} />}
                        </Field>
                      </ActionForm>
                    </Disclosure>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="type-small text-subtle">{plural(days.reduce((n, g) => n + g.slots.length, 0), "créneau", "créneaux")}</p>
    </div>
  );
}
