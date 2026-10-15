"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ApplicationStatus } from "@/lib/types";
import { APPLICATION_STATUS_LABEL } from "@/lib/format";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/manage/DataTable";
import { DemoNotice } from "@/components/manage/DemoNotice";

/**
 * The applicant pipeline of an association: every application the bureau
 * received, grouped by status, oldest first in each group (a queue to work
 * through). Changing a status is PHASE 1 demo state: the row moves to its new
 * group on this screen only, a notice says that nothing is saved and the
 * candidate is told nothing, and everything can be put back.
 *
 * Rows arrive preformatted from the server page (dates in Paris words), so
 * the server render and the browser agree.
 */
export interface PipelineRow {
  id: string;
  name: string;
  programme: string;
  position: string;
  campaign: string;
  submittedAt: string;
  /** "Hier · 13h30" — formatted on the server. */
  submittedLabel: string;
  status: ApplicationStatus;
}

interface Group {
  status: ApplicationStatus;
  /** The bureau's word for the step. */
  title: string;
  hint: string;
}

const GROUPS: Group[] = [
  { status: "envoyee", title: "À lire", hint: "Personne ne les a encore ouvertes." },
  { status: "en-revue", title: "En lecture", hint: "Ouvertes, pas encore de décision." },
  { status: "entretien", title: "Entretien", hint: "Un échange à caler ou déjà calé." },
  { status: "acceptee", title: "Acceptées", hint: "Elles font partie de l'équipe." },
  { status: "refusee", title: "Non retenues", hint: "Pas cette fois." },
  { status: "retiree", title: "Retirées", hint: "Retirées par la personne elle-même." },
];

const GROUP_TITLE = Object.fromEntries(GROUPS.map((g) => [g.status, g.title])) as Record<ApplicationStatus, string>;

/** What the bureau can set. "Retirée" belongs to the candidate, "Brouillon" never reaches the bureau. */
const CHOICES: ApplicationStatus[] = ["envoyee", "en-revue", "entretien", "acceptee", "refusee"];

type Statuses = Record<string, ApplicationStatus>;

const initialStatuses = (rows: PipelineRow[]): Statuses => Object.fromEntries(rows.map((r) => [r.id, r.status]));

export function ApplicantPipeline({
  rows,
  showCampaign,
  associationName,
}: {
  rows: PipelineRow[];
  /** Print the campaign under the role when the association runs several. */
  showCampaign: boolean;
  associationName: string;
}) {
  const uid = useId();
  const [statuses, setStatuses] = useState<Statuses>(() => initialStatuses(rows));
  const [notice, setNotice] = useState<{ key: number; text: string } | null>(null);
  const focusTarget = useRef<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const original = initialStatuses(rows);
  const changed = rows.filter((r) => statuses[r.id] !== original[r.id]).length;

  // After a row moves to another group, put focus back on its status control,
  // in its new place (the table on desktop, the stacked list on phones).
  useEffect(() => {
    const id = focusTarget.current;
    if (!id) return;
    focusTarget.current = null;
    if (id === "notice") {
      noticeRef.current?.focus();
      return;
    }
    const controls = document.querySelectorAll<HTMLSelectElement>(`select[data-applicant="${CSS.escape(id)}"]`);
    Array.from(controls)
      .find((el) => el.offsetParent !== null)
      ?.focus();
  }, [statuses]);

  const move = (row: PipelineRow, next: ApplicationStatus) => {
    focusTarget.current = row.id;
    setStatuses((s) => ({ ...s, [row.id]: next }));
    setNotice((n) => ({
      key: (n?.key ?? 0) + 1,
      text: `${row.name} passe dans « ${GROUP_TITLE[next]} » sur cet écran seulement. Rien n'est enregistré et ${row.name.split(" ")[0]} ne reçoit rien.`,
    }));
  };

  const reset = () => {
    focusTarget.current = "notice";
    setStatuses(initialStatuses(rows));
    setNotice((n) => ({ key: (n?.key ?? 0) + 1, text: "tout est revenu comme au chargement de la page." }));
  };

  const groups = GROUPS.filter(
    (g) => g.status !== "retiree" || rows.some((r) => statuses[r.id] === "retiree" || original[r.id] === "retiree"),
  ).map((g) => ({
    ...g,
    rows: rows
      .filter((r) => statuses[r.id] === g.status)
      .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt)),
  }));

  const columns: DataColumn<PipelineRow>[] = [
    { key: "name", header: "Nom", primary: true, cell: (r) => r.name, className: "min-w-[10rem]" },
    { key: "programme", header: "Programme", cell: (r) => <span className="type-meta">{r.programme}</span> },
    {
      key: "position",
      header: "Poste",
      cell: (r) =>
        showCampaign ? (
          <span className="flex flex-col">
            <span>{r.position}</span>
            <span className="type-small text-subtle">{r.campaign}</span>
          </span>
        ) : (
          r.position
        ),
    },
    {
      key: "submitted",
      header: "Reçue",
      cell: (r) => (
        <time dateTime={r.submittedAt} className="type-meta whitespace-nowrap">
          {r.submittedLabel}
        </time>
      ),
    },
    {
      key: "status",
      header: "Statut",
      className: "min-w-[15.5rem]",
      cell: (r) => (
        <StatusControl row={r} status={statuses[r.id]} original={original[r.id]} onMove={(next) => move(r, next)} />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ol
        aria-label={`Où en sont les candidatures de ${associationName}`}
        className={cx(
          "grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line",
          "[&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1",
          groups.length === 6 ? "sm:grid-cols-6" : "sm:grid-cols-5",
        )}
      >
        {groups.map((g) => {
          const n = g.rows.length;
          return (
            <li key={g.status} className="bg-raised">
              <a
                href={`#groupe-${g.status}`}
                className="flex h-full flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-bg/70"
              >
                <span className="type-label text-[0.68rem] text-subtle">{g.title}</span>
                <span
                  className={cx(
                    "type-numeral text-[2.25rem]",
                    g.status === "envoyee" && n > 0 ? "text-accent-text" : n === 0 && "text-subtle",
                  )}
                >
                  {n}
                </span>
              </a>
            </li>
          );
        })}
      </ol>

      {/* Always mounted (visually hidden until the first change) so the live region is registered before it speaks. */}
      <div
        ref={noticeRef}
        tabIndex={-1}
        className={cx("flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between", !notice && "sr-only")}
      >
        <div role="status" className="max-w-2xl">
          {notice && <DemoNotice key={notice.key}>{notice.text}</DemoNotice>}
        </div>
        {changed > 0 && (
          <Button variant="secondary" size="sm" icon="arrow-left" iconPosition="start" onClick={reset}>
            Tout remettre comme avant
          </Button>
        )}
      </div>

      {groups.map((g) => {
        const headingId = `${uid}-${g.status}`;
        return (
          <section key={g.status} id={`groupe-${g.status}`} aria-labelledby={headingId} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 border-b border-line pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <h3 id={headingId} className="flex items-baseline gap-2.5 type-label text-fg">
                {g.title}
                <span className="type-meta normal-case tracking-normal text-subtle">{g.rows.length}</span>
              </h3>
              <p className="type-small text-subtle">
                {g.hint} La personne lit «&nbsp;{APPLICATION_STATUS_LABEL[g.status]}&nbsp;».
              </p>
            </div>
            <DataTable
              caption={`${g.title} : candidatures ${associationName}`}
              columns={columns}
              rows={g.rows}
              rowKey={(r) => r.id}
              empty={
                <p className="rounded-md border border-dashed border-line-strong px-4 py-3 type-small text-subtle">
                  Personne à cette étape pour l&apos;instant.
                </p>
              }
            />
          </section>
        );
      })}
    </div>
  );
}

/**
 * Pick a status, then confirm with the button: nothing moves on a mere
 * arrow key in the select. Rendered twice by DataTable (table + phone list),
 * hence ids from useId and the data-applicant hook for focus.
 */
function StatusControl({
  row,
  status,
  original,
  onMove,
}: {
  row: PipelineRow;
  status: ApplicationStatus;
  original: ApplicationStatus;
  onMove: (next: ApplicationStatus) => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<ApplicationStatus>(status);

  if (status === "retiree") {
    return <span className="type-small text-subtle">Retirée par la personne, rien à faire.</span>;
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (choice !== status) onMove(choice);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Statut de la candidature de {row.name}
        </label>
        <select
          id={id}
          data-applicant={row.id}
          value={choice}
          onChange={(e) => setChoice(e.target.value as ApplicationStatus)}
          className="min-h-9 min-w-0 max-w-full flex-1 rounded-sm border border-line-strong bg-raised px-2.5 type-small text-fg hover:border-fg focus-visible:border-fg"
        >
          {CHOICES.map((s) => (
            <option key={s} value={s}>
              {APPLICATION_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" aria-disabled={choice === status}>
          Changer<span className="sr-only"> le statut de {row.name}</span>
        </Button>
      </div>
      {status !== original && (
        <span className="type-meta text-[0.72rem] text-subtle">
          Avant&nbsp;: {APPLICATION_STATUS_LABEL[original]} · changé ici seulement
        </span>
      )}
    </form>
  );
}
