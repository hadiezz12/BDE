"use client";

import { startTransition, useActionState, useState } from "react";
import { saveRubric, saveTemplate, type ReviewActionState } from "@/app/actions/recruitment-review";
import {
  POWERS,
  POWER_LABEL,
  ROLE_PRESETS,
  STARTER_CRITERIA,
  TEMPLATE_PLACEHOLDERS,
  criterionId,
  renderTemplate,
  rubricProblem,
  reviewTotal,
  unknownPlaceholders,
  type CommitteeRole,
  type Criterion,
  type Power,
  type TemplateKind,
} from "@/lib/recruitment/review";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { ActionOutcome } from "@/components/manage/governance/ActionForm";

/**
 * The role of an appointment and its powers. Choosing a role ticks its usual
 * powers; the boxes ticked are what count. Powers the appointer does not
 * hold are greyed out (the database refuses to hand them out anyway).
 */
export function PowerPicker({
  role: initialRole = "reviewer",
  powers: initialPowers,
  mine,
}: {
  role?: CommitteeRole;
  powers?: Power[];
  /** The appointer's own powers in this campaign: the ceiling. */
  mine: Power[];
}) {
  const [role, setRole] = useState<CommitteeRole>(initialRole);
  const [powers, setPowers] = useState<Power[]>(initialPowers ?? ROLE_PRESETS[initialRole].powers);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Rôle" hint={ROLE_PRESETS[role].hint}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            name="role"
            value={role}
            onChange={(e) => {
              const next = e.target.value as CommitteeRole;
              setRole(next);
              setPowers(ROLE_PRESETS[next].powers.filter((p) => mine.includes(p)));
            }}
          >
            {(Object.keys(ROLE_PRESETS) as CommitteeRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_PRESETS[r].label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="flex flex-col gap-0.5">
        <legend className="mb-1 text-[0.95rem] font-bold">Ce que la personne peut faire</legend>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {POWERS.map((p) => (
            <Checkbox
              key={p}
              name="powers"
              value={p}
              label={POWER_LABEL[p]}
              checked={p === "view" || powers.includes(p)}
              disabled={p === "view" || !mine.includes(p)}
              onChange={() => setPowers((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))}
            />
          ))}
        </div>
        <p className="type-small text-subtle">
          « Lire » va avec toute nomination. Tu ne peux confier que ce que tu peux faire toi-même dans ce recrutement.
        </p>
      </fieldset>
    </div>
  );
}

/** Scope: the whole campaign, some positions (boxes shown), or only what is confided. */
export function ScopePicker({
  scope: initial = "assigned",
  positions,
  chosen = [],
}: {
  scope?: "campaign" | "positions" | "assigned";
  positions: { id: string; title: string }[];
  chosen?: string[];
}) {
  const [scope, setScope] = useState(initial);
  return (
    <div className="flex flex-col gap-3">
      <Field label="Périmètre" hint="Ce que la personne peut ouvrir. « Seulement ce qui lui est confié » : les candidatures qu'on lui attribue, et les entretiens qu'elle fait passer.">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} name="scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="assigned">Seulement ce qui lui est confié</option>
            <option value="positions">Certains postes</option>
            <option value="campaign">Tout le recrutement</option>
          </Select>
        )}
      </Field>
      {scope === "positions" && (
        <fieldset className="flex flex-col gap-0.5">
          <legend className="mb-1 type-small font-bold">Quels postes</legend>
          {positions.map((p) => (
            <Checkbox key={p.id} name="position_ids" value={p.id} label={p.title} defaultChecked={chosen.includes(p.id)} />
          ))}
        </fieldset>
      )}
    </div>
  );
}

/**
 * A grid of criteria, edited as a draft (saved with its edit version, so
 * two people cannot overwrite each other), then published as a new frozen
 * version. Reviews already made keep the version they were made with.
 */
export function RubricEditor({
  campaignId,
  kind,
  criteria: initial,
  editVersion,
}: {
  campaignId: string;
  kind: "application" | "interview";
  criteria: Criterion[] | null;
  editVersion: number | null;
}) {
  const [criteria, setCriteria] = useState<Criterion[]>(initial ?? STARTER_CRITERIA);
  const [state, dispatch, pending] = useActionState(saveRubric, { status: "idle" } as ReviewActionState);
  const version = state.version ?? editVersion;
  const problem = rubricProblem(criteria);
  const sample = reviewTotal(criteria, Object.fromEntries(criteria.map((c) => [c.id, c.max])));
  const update = (i: number, patch: Partial<Criterion>) => setCriteria((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, by: -1 | 1) =>
    setCriteria((list) => {
      const next = [...list];
      const [c] = next.splice(i, 1);
      next.splice(i + by, 0, c);
      return next;
    });

  return (
    <form
      className="flex flex-col gap-4"
      action={dispatch}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData();
        data.set("campaign_id", campaignId);
        data.set("kind", kind);
        if (version) data.set("edit_version", String(version));
        data.set("criteria", JSON.stringify(criteria.map((c) => ({ ...c, label: c.label.trim(), description: c.description?.trim() || null }))));
        startTransition(() => dispatch(data));
      }}
    >
      <ol className="flex flex-col gap-3">
        {criteria.map((c, i) => (
          <li key={c.id} className="flex flex-col gap-3 rounded-md border border-line bg-raised p-3.5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
              <Field label={`Critère ${i + 1}`}>
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} value={c.label} maxLength={80} onChange={(e) => update(i, { label: e.target.value })} />
                )}
              </Field>
              <Field label="Note max">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} type="number" min={2} max={10} value={c.max} onChange={(e) => update(i, { max: Number(e.target.value) })} />
                )}
              </Field>
              <Field label="Poids">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} type="number" min={1} max={10} value={c.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} />
                )}
              </Field>
            </div>
            <Field label="Ce qu'on regarde" optional>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={c.description ?? ""}
                  maxLength={300}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Checkbox label="Obligatoire pour soumettre" checked={c.required} onChange={(e) => update(i, { required: e.target.checked })} />
              <span className="flex-1" />
              <button type="button" className="type-small underline underline-offset-2 disabled:opacity-40" disabled={i === 0} onClick={() => move(i, -1)}>
                Monter
              </button>
              <button
                type="button"
                className="type-small underline underline-offset-2 disabled:opacity-40"
                disabled={i === criteria.length - 1}
                onClick={() => move(i, 1)}
              >
                Descendre
              </button>
              <button type="button" className="type-small text-danger underline underline-offset-2" onClick={() => setCriteria((l) => l.filter((_, j) => j !== i))}>
                Retirer
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon="plus"
          iconPosition="start"
          disabled={criteria.length >= 12}
          onClick={() =>
            setCriteria((l) => [
              ...l,
              { id: criterionId(`critere ${l.length + 1}`, l.map((c) => c.id)), label: "", description: null, max: 5, weight: 1, required: false },
            ])
          }
        >
          Ajouter un critère
        </Button>
        <span className="type-small text-muted">
          {sample ? `Total possible : ${sample.out_of} points pondérés.` : "Aucun critère : les évaluations se feront avec un avis et un commentaire."}
        </span>
      </div>
      <p className="type-small text-subtle">
        Des critères sur la candidature et le poste (motivation, expérience utile, disponibilité…), jamais sur qui est la personne.
      </p>
      {problem && criteria.length > 0 && <p className="type-small font-semibold text-danger">{problem}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pending || Boolean(problem)} aria-disabled={pending || Boolean(problem)}>
          {pending ? "Un instant…" : "Enregistrer le brouillon de la grille"}
        </Button>
      </div>
      <ActionOutcome state={state} />
    </form>
  );
}

/** A message model with its allowed placeholders, and how one candidate would read it. */
export function TemplateEditor({ campaignId, kind, body: initial, sample }: { campaignId: string; kind: TemplateKind; body: string; sample: Record<string, string> }) {
  const [body, setBody] = useState(initial);
  const [state, dispatch, pending] = useActionState(saveTemplate, { status: "idle" } as ReviewActionState);
  const unknown = unknownPlaceholders(body);
  return (
    <form
      className="flex flex-col gap-3"
      action={dispatch}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => dispatch(new FormData(event.currentTarget)));
      }}
    >
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="kind" value={kind} />
      <Field label="Le message" hint="Vide : le message standard du site. 2 000 caractères au plus.">
        {({ id, describedBy }) => (
          <Textarea id={id} aria-describedby={describedBy} name="body" rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
        )}
      </Field>
      <p className="type-small text-muted">
        Mots remplacés à l&apos;envoi :{" "}
        {TEMPLATE_PLACEHOLDERS.map((p, i) => (
          <span key={p.key}>
            <code className="font-mono">{`{${p.key}}`}</code> ({p.hint}){i < TEMPLATE_PLACEHOLDERS.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
      {unknown.length > 0 && (
        <p className="type-small font-semibold text-danger">
          Pas autorisé : {unknown.map((u) => `{${u}}`).join(", ")}. Seuls les mots ci-dessus peuvent être entre accolades.
        </p>
      )}
      {body.trim() && unknown.length === 0 && (
        <div className="rounded-sm bg-sunken px-3.5 py-2.5 type-small">
          <p className="mb-1 font-bold">Aperçu (exemple fictif)</p>
          <p className="whitespace-pre-line">{renderTemplate(body, sample)}</p>
        </div>
      )}
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || unknown.length > 0} aria-disabled={pending || unknown.length > 0}>
          {pending ? "Un instant…" : "Enregistrer"}
        </Button>
      </div>
      <ActionOutcome state={state} />
    </form>
  );
}
