"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import type { ReviewActionState } from "@/app/actions/recruitment-review";
import { assignReviews, inviteToInterview, moveApplications } from "@/app/actions/recruitment-review";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDayShort } from "@/lib/format";
import { percentLabel, reviewProgress, teamState, type ApplicationRow } from "@/lib/recruitment/review";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionOutcome } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";

type BulkAction = (prev: ReviewActionState, form: FormData) => Promise<ReviewActionState>;

/**
 * A form acting on the applications ticked in the table. The ids travel as
 * a list; the database checks each one against the person's own access and
 * says, row by row, what it did not do.
 */
function BulkForm({
  action,
  ids,
  hidden,
  submitLabel,
  onDone,
  children,
}: {
  action: BulkAction;
  ids: string[];
  hidden?: Record<string, string>;
  submitLabel: string;
  /** After a success: the outcome, kept by the table once this form is gone with the selection. */
  onDone?: (state: ReviewActionState) => void;
  children?: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(async (prev: ReviewActionState, form: FormData) => {
    const next = await action(prev, form);
    if (next.status === "done") onDone?.(next);
    return next;
  }, { status: "idle" } as ReviewActionState);
  return (
    <form
      action={dispatch}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        for (const id of ids) data.append("application_ids", id);
        startTransition(() => dispatch(data));
      }}
    >
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div>
        <Button type="submit" size="sm" disabled={pending || ids.length === 0} aria-disabled={pending || ids.length === 0}>
          {pending ? "Un instant…" : submitLabel}
        </Button>
      </div>
      <ActionOutcome state={state} />
    </form>
  );
}

export function ApplicationTable({
  rows,
  asso,
  campaignId,
  reviewers,
  team,
  can,
  writable,
}: {
  rows: ApplicationRow[];
  asso: string;
  campaignId: string;
  reviewers: { id: string; name: string }[];
  /** Others' scores are shown (view_team). */
  team: boolean;
  can: { assign: boolean; move: boolean; invite: boolean };
  writable: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [last, setLast] = useState<ReviewActionState>({ status: "idle" });
  const selectable = writable && (can.assign || can.move || can.invite);
  const open = rows.filter((r) => r.status === "submitted").map((r) => r.id);
  const all = open.length > 0 && open.every((id) => selected.includes(id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const clear = () => setSelected([]);
  const finished = (state: ReviewActionState) => {
    setLast(state);
    clear();
  };

  return (
    <div className="flex flex-col gap-4">
      {selectable && (
        <div className="flex flex-col gap-3 rounded-md border border-line bg-sunken/50 p-3.5" aria-live="polite">
          <p className="type-small font-semibold">
            {selected.length === 0
              ? "Coche des candidatures pour les confier, les faire avancer ou inviter à un entretien."
              : `${selected.length} candidature${selected.length > 1 ? "s" : ""} cochée${selected.length > 1 ? "s" : ""}`}
            {selected.length > 0 && (
              <button type="button" onClick={clear} className="ml-3 font-normal underline underline-offset-2">
                Tout décocher
              </button>
            )}
          </p>
          {selected.length === 0 && <ActionOutcome state={last} />}
          {selected.length > 0 && (
            <div className="grid gap-2.5 lg:grid-cols-3">
              {can.assign && (
                <Disclosure summary="Confier à…" icon="users">
                  {reviewers.length === 0 ? (
                    <p className="type-small text-muted">
                      Personne du comité n&apos;a le droit d&apos;évaluer. Nomme des personnes dans l&apos;onglet Comité.
                    </p>
                  ) : (
                    <BulkForm action={assignReviews} ids={selected} hidden={{ campaign_id: campaignId }} submitLabel="Confier" onDone={finished}>
                      <fieldset className="flex flex-col gap-1">
                        <legend className="mb-1 text-[0.95rem] font-bold">À qui</legend>
                        {reviewers.map((r) => (
                          <Checkbox key={r.id} name="member_ids" value={r.id} label={r.name} />
                        ))}
                      </fieldset>
                      <Field label="Comment répartir">
                        {({ id, describedBy }) => (
                          <Select id={id} aria-describedby={describedBy} name="mode" defaultValue="each">
                            <option value="each">Chaque personne choisie évalue chaque candidature</option>
                            <option value="balanced">Une personne par candidature, en équilibrant les listes</option>
                          </Select>
                        )}
                      </Field>
                    </BulkForm>
                  )}
                </Disclosure>
              )}
              {can.move && (
                <Disclosure summary="Changer d'étape" icon="arrow-right">
                  <BulkForm action={moveApplications} ids={selected} submitLabel="Changer" onDone={finished}>
                    <Field label="Nouvelle étape" hint="Interne à l'équipe : la personne voit toujours « en cours d'examen ».">
                      {({ id, describedBy }) => (
                        <Select id={id} aria-describedby={describedBy} name="stage" defaultValue="shortlisted">
                          <option value="under_review">En examen</option>
                          <option value="shortlisted">Présélectionnée</option>
                        </Select>
                      )}
                    </Field>
                  </BulkForm>
                </Disclosure>
              )}
              {can.invite && (
                <Disclosure summary="Inviter à un entretien" icon="calendar">
                  <BulkForm action={inviteToInterview} ids={selected} submitLabel="Envoyer les invitations" onDone={finished}>
                    <p className="type-small text-muted">
                      Chaque personne reçoit une notification et choisit un créneau libre parmi ceux ouverts dans l&apos;onglet
                      Entretiens. Le message type « Invitation » s&apos;ajoute s&apos;il existe.
                    </p>
                    <Field label="Message" optional hint="Ajouté à l'invitation, le même pour tout le monde. 1 000 caractères au plus.">
                      {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="message" rows={3} maxLength={1000} />}
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Réponse avant le" optional>
                        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="respond_by_date" />}
                      </Field>
                      <Field label="à" optional hint="Heure de Paris.">
                        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="time" name="respond_by_time" defaultValue="18:00" />}
                      </Field>
                    </div>
                  </BulkForm>
                </Disclosure>
              )}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[56rem] border-collapse bg-raised type-small">
          <caption className="sr-only">Candidatures</caption>
          <thead>
            <tr className="border-b border-line text-left text-muted">
              {selectable && (
                <th scope="col" className="w-10 py-2.5 pl-3.5">
                  <input
                    type="checkbox"
                    aria-label="Cocher toutes les candidatures de la page"
                    className="size-4 cursor-pointer accent-accent"
                    checked={all}
                    onChange={() => setSelected(all ? [] : open)}
                  />
                </th>
              )}
              <th scope="col" className="py-2.5 pl-3.5 pr-4 font-semibold">Candidature</th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">Poste</th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">Envoyée</th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">Où elle en est</th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">Évaluations</th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">Confiée à</th>
              {team && <th scope="col" className="py-2.5 pr-3.5 font-semibold">Moyenne</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const withdrawn = r.status === "withdrawn";
              return (
                <tr key={r.id} className={cx("border-b border-line align-top last:border-b-0", selected.includes(r.id) && "bg-accent/5")}>
                  {selectable && (
                    <td className="py-3 pl-3.5">
                      {!withdrawn && (
                        <input
                          type="checkbox"
                          aria-label={`Cocher ${r.name} (${r.reference})`}
                          className="size-4 cursor-pointer accent-accent"
                          checked={selected.includes(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      )}
                    </td>
                  )}
                  <th scope="row" className="py-3 pl-3.5 pr-4 text-left font-normal">
                    <Link href={routes.manageApplication(asso, campaignId, r.id)} className="font-bold hover:underline">
                      {r.name}
                    </Link>
                    <span className="block type-meta text-subtle">
                      {r.reference}
                      {r.program ? ` · ${r.program}` : ""}
                      {r.study_year ? ` · ${r.study_year}` : ""}
                    </span>
                    {r.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span key={t.id} className="rounded-xs bg-sunken px-1.5 py-0.5 text-[0.75rem]">
                            {t.label}
                          </span>
                        ))}
                      </span>
                    )}
                  </th>
                  <td className="py-3 pr-4">{r.position.title}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatDayShort(r.submitted_at)}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge tone={withdrawn ? "neutral" : r.decision ? (r.decision.status === "released" ? "ok" : "accent") : "info"}>
                      {teamState(r)}
                    </StatusBadge>
                  </td>
                  <td className="py-3 pr-4">
                    {withdrawn ? "—" : reviewProgress(r.reviews.counted, r.reviews.required)}
                    {r.reviews.mine && (
                      <span className="block text-subtle">{r.reviews.mine === "submitted" ? "Tu l'as évaluée" : "Ton brouillon en cours"}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">{r.assigned.length ? r.assigned.join(", ") : <span className="text-subtle">Personne</span>}</td>
                  {team && <td className="py-3 pr-3.5 whitespace-nowrap">{percentLabel(r.score)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
