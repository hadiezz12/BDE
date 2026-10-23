import type { EditorialSettings } from "@/lib/posts/editor";
import { Icon } from "@/components/ui/Icon";
import { REVIEW_MODE_TITLE, signatureLine } from "./desk";

type Mode = EditorialSettings["review_mode"];

/**
 * The two publishing policies in plain words, with what each one changes
 * for the team. Written from what the database enforces
 * (private.authorize_revision, public.review_post_revision): the settings
 * form and the read-only summary say exactly the same thing.
 */
export const REVIEW_MODE_TEXT: Record<Mode, { lead: string; points: string[] }> = {
  approval: {
    lead: "Une deuxième personne approuve chaque version avant qu'elle parte en ligne.",
    points: [
      "Qui écrit envoie l'article en relecture : la version envoyée ne bouge plus.",
      "Un poste qui a « Approuver les articles » approuve cette version exacte, ou demande des modifications avec une note.",
      "Personne n'approuve un article qu'il a écrit ou envoyé, présidence comprise.",
      "La version approuvée est publiée ou programmée par un poste qui a « Publier les articles ». Toute modification après coup repasse en relecture.",
    ],
  },
  direct: {
    lead: "Les postes qui ont « Publier les articles » publient seuls, sans deuxième avis.",
    points: [
      "Ce qui part en ligne, c'est le brouillon au moment du clic : l'historique garde la version et le nom de qui l'a publiée.",
      "Qui n'a pas ce droit envoie son article en relecture : un poste qui approuve le valide, puis un poste qui publie le met en ligne.",
      "Plus rapide, mais sans filet : une coquille part telle quelle. Un article se corrige ou se retire après coup.",
    ],
  },
};

export const SHOW_AUTHORS_TEXT =
  "Le nom de la personne qui a commencé l'article, tel qu'il figure sur son profil, sous le titre. Sauf si elle ne fait plus partie de l'asso, ou si elle a choisi de ne pas apparaître dans l'équipe de la page publique. Aucune coordonnée personnelle n'est jamais affichée.";

/**
 * The review mode as two radio tiles (real radios: keyboard and screen
 * readers work natively), each with its consequences.
 */
export function ReviewModeFieldset({ defaultValue }: { defaultValue: Mode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[0.95rem] font-bold">Avant publication</legend>
      <div className="grid gap-3 lg:grid-cols-2">
        {(["approval", "direct"] as const).map((mode) => (
          <label
            key={mode}
            className="focus-ring-within group relative flex cursor-pointer flex-col gap-2 rounded-sm border-2 border-line bg-raised px-4 py-4 transition-colors hover:border-line-strong has-[:checked]:border-assoc has-[:checked]:bg-assoc/8"
          >
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name="review_mode"
                value={mode}
                defaultChecked={mode === defaultValue}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--assoc)]"
              />
              <span className="flex flex-col gap-1">
                <span className="font-bold leading-snug">{REVIEW_MODE_TITLE[mode]}</span>
                <span className="type-small text-muted">{REVIEW_MODE_TEXT[mode].lead}</span>
              </span>
            </span>
            <ul className="flex flex-col gap-1.5 pl-8 type-small text-muted">
              {REVIEW_MODE_TEXT[mode].points.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Icon name="check" size={14} className="mt-1 shrink-0 text-subtle" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The current policy, for those who may read it but not change it. */
export function PolicySummary({ settings }: { settings: EditorialSettings }) {
  const mode = REVIEW_MODE_TEXT[settings.review_mode];
  return (
    <dl className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
      <div className="grid gap-1.5 px-4 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4 sm:px-5">
        <dt className="type-label text-subtle">Avant publication</dt>
        <dd className="flex flex-col gap-2">
          <p className="font-bold">{REVIEW_MODE_TITLE[settings.review_mode]}</p>
          <p className="type-small text-muted">{mode.lead}</p>
          <ul className="flex flex-col gap-1.5 type-small text-muted">
            {mode.points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Icon name="check" size={14} className="mt-1 shrink-0 text-subtle" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </dd>
      </div>
      <div className="grid gap-1.5 px-4 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4 sm:px-5">
        <dt className="type-label text-subtle">Signature</dt>
        <dd className="flex flex-col gap-2">
          <p className="font-bold">{signatureLine(settings.show_authors)}</p>
          <p className="type-small text-muted">
            {settings.show_authors
              ? SHOW_AUTHORS_TEXT
              : "Les articles paraissent au nom de l'asso seule, sans nom de personne. Aucune coordonnée personnelle n'est jamais affichée."}
          </p>
        </dd>
      </div>
    </dl>
  );
}
