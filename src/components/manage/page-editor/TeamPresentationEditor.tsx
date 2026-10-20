"use client";

import { startTransition, useActionState, useState } from "react";
import { saveTeamPresentation, type PageActionState } from "@/app/actions/association-page";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionOutcome } from "@/components/manage/governance/ActionForm";

export interface TeamRow {
  membership_id: string;
  name: string;
  titles: string | null;
  member_hidden: boolean;
  show_photo: boolean;
  has_bio: boolean;
  /** From the saved arrangement (undefined: not arranged yet, shown with its position title). */
  display_title: string | null;
  hidden: boolean;
}

type Entry = { membership_id: string; display_title: string | null; hidden: boolean };

/**
 * How the team appears on the page: order, the title shown, who is left
 * out. Only people holding a current position can appear, and each of them
 * decides for themself whether to be shown, with a photo and a line about
 * them (their own setting, in the workspace home): the editor can hide
 * someone, never show someone who said no. Nothing here changes anyone's
 * positions or rights.
 */
export function TeamPresentationEditor({
  organizationId,
  rows: initial,
  base,
  readOnly,
  next,
}: {
  organizationId: string;
  rows: TeamRow[];
  base: Entry[];
  readOnly?: boolean;
  next?: string;
}) {
  const [rows, setRows] = useState<TeamRow[]>(initial);
  const [state, dispatch, pending] = useActionState<PageActionState, FormData>(saveTeamPresentation, { status: "idle" });
  const toEntries = (list: TeamRow[]): Entry[] =>
    list.map((r) => ({ membership_id: r.membership_id, display_title: r.display_title?.trim() || null, hidden: r.hidden }));
  const entries = toEntries(rows);
  // Compared with what was loaded (never arranged yet = the default order), not with the saved list.
  const changed = JSON.stringify(entries) !== JSON.stringify(toEntries(initial));
  const update = (i: number, patch: Partial<TeamRow>) =>
    setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (from: number, to: number) =>
    setRows((list) => {
      if (to < 0 || to >= list.length) return list;
      const copy = [...list];
      const [x] = copy.splice(from, 1);
      copy.splice(to, 0, x);
      return copy;
    });

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center type-small text-muted">
        Personne n&apos;occupe de poste en ce moment : l&apos;équipe n&apos;apparaît pas sur la page. Elle apparaît dès
        qu&apos;un poste est attribué (Postes et droits).
      </p>
    );
  }

  return (
    <form
      aria-label="Équipe présentée"
      action={dispatch}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="base" value={JSON.stringify(base)} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />
      {next && <input type="hidden" name="next" value={next} />}

      <ol className="flex flex-col divide-y divide-line border-y border-line">
        {rows.map((r, i) => {
          const shown = !r.hidden && !r.member_hidden;
          return (
            <li key={r.membership_id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{r.name}</span>
                  {shown ? (
                    <StatusBadge tone="ok">Affiché·e</StatusBadge>
                  ) : r.member_hidden ? (
                    <StatusBadge tone="neutral">Masqué·e à sa demande</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Masqué·e</StatusBadge>
                  )}
                </p>
                <p className="type-small text-muted">{r.titles ?? "Sans poste"}</p>
                <p className="type-meta text-subtle">
                  {r.show_photo ? "Photo affichée" : "Initiales (pas de photo)"} ·{" "}
                  {r.has_bio ? "a écrit une ligne" : "pas de ligne perso"}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`title-${r.membership_id}`} className="type-small font-bold">
                  Titre affiché <span className="font-normal text-subtle">(facultatif)</span>
                </label>
                <input
                  id={`title-${r.membership_id}`}
                  value={r.display_title ?? ""}
                  disabled={readOnly}
                  maxLength={60}
                  placeholder={r.titles ?? "Ex : Responsable partenariats"}
                  onChange={(e) => update(i, { display_title: e.target.value })}
                  className="min-h-11 w-full rounded-sm border border-line-strong/70 bg-raised px-3 py-2 text-fg placeholder:text-subtle focus-visible:border-fg focus-visible:outline-none"
                />
              </div>
              {!readOnly && (
                <div className="flex flex-wrap items-center gap-1">
                  <label className="mr-2 flex min-h-11 items-center gap-2 type-small font-semibold">
                    <input
                      type="checkbox"
                      checked={r.hidden}
                      disabled={r.member_hidden}
                      onChange={(e) => update(i, { hidden: e.target.checked })}
                      className="size-5"
                    />
                    Ne pas afficher
                  </label>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Monter ${r.name}`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <Icon name="chevron-down" size={18} className="rotate-180" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Descendre ${r.name}`}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <Icon name="chevron-down" size={18} />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!readOnly && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" icon="check" iconPosition="start" disabled={pending || !changed} aria-disabled={pending || !changed}>
              {pending ? "Enregistrement…" : "Enregistrer l'équipe présentée"}
            </Button>
            {changed && !pending && <span className="type-meta text-subtle">Modifications pas encore enregistrées</span>}
          </div>
          <ActionOutcome state={state} />
        </div>
      )}
    </form>
  );
}
