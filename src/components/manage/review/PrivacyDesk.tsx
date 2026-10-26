"use client";

import { startTransition, useActionState } from "react";
import { privacyErase, privacyReport, type PrivacyReportState } from "@/app/actions/recruitment-review";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { ActionForm, ActionOutcome } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";

interface ReportApplication {
  id: string;
  reference: string | null;
  status: string;
  organization: string | null;
  campaign: string | null;
  position: string | null;
  created_at: string;
  submitted_at: string | null;
}

interface Report {
  generated_at: string;
  person: { name: string };
  applications: ReportApplication[];
}

const STATUS: Record<string, string> = { draft: "Brouillon", submitted: "Envoyée", withdrawn: "Retirée" };

/**
 * The privacy officer's desk: compile what the platform holds about one
 * person's applications (internal assessments included) to answer an access
 * request, and erase an application when an erasure request is granted.
 * Both need a written reason and a second factor, and both are in the audit
 * with the person they concern. The report is shown here and can be saved
 * as a file by the officer; the site never stores or sends it.
 */
export function PrivacyDesk() {
  const [state, dispatch, pending] = useActionState(privacyReport, { status: "idle" } as PrivacyReportState);
  const report = state.status === "done" ? (state.report as Report) : null;

  const download = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `demande-acces-${report.generated_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex max-w-2xl flex-col gap-4"
        action={dispatch}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => dispatch(data));
        }}
      >
        <Field label="Adresse e-mail du compte de la personne" hint="Celle avec laquelle elle se connecte au site.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="email" type="email" autoComplete="off" required maxLength={254} />}
        </Field>
        <Field label="La demande" hint="D'où vient la demande et quand (« e-mail du 3 mars, demande d'accès »). Gardée dans l'historique.">
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={2} maxLength={500} required minLength={3} />}
        </Field>
        <div>
          <Button type="submit" disabled={pending} aria-disabled={pending}>
            {pending ? "Un instant…" : "Compiler le rapport"}
          </Button>
        </div>
        <ActionOutcome state={state} />
      </form>

      {report && (
        <section aria-labelledby="rapport" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-fg pb-2">
            <h2 id="rapport" className="type-button text-[0.95rem]">
              {report.person.name} · {report.applications.length} candidature{report.applications.length > 1 ? "s" : ""}
            </h2>
            <Button type="button" size="sm" variant="secondary" icon="file" iconPosition="start" onClick={download}>
              Enregistrer le rapport (JSON)
            </Button>
          </div>
          <p className="type-small text-muted">
            Tout ce que le site garde, évaluations et discussion internes comprises. Ce qui est communiqué à la personne relève de ta
            décision, selon la politique de l&apos;opérateur du site.
          </p>
          {report.applications.length === 0 ? (
            <p className="type-small text-muted">Aucune candidature.</p>
          ) : (
            <ul className="flex flex-col border-y border-line">
              {report.applications.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
                  <span className="type-small">
                    <span className="font-bold">{a.organization}</span> · {a.campaign} · {a.position} · {STATUS[a.status] ?? a.status}
                    {a.reference ? ` · ${a.reference}` : ""}
                  </span>
                  <Disclosure summary="Effacer cette candidature" icon="close" tone="danger" className="max-w-xl">
                    <ActionForm action={privacyErase} hidden={{ application_id: a.id }} submitLabel="Effacer définitivement" variant="danger">
                      <p className="type-small text-muted">
                        La candidature, ses réponses, ses fichiers, ses évaluations, sa discussion, ses entretiens et ses décisions
                        partent ensemble. Il n&apos;y a pas de retour possible.
                      </p>
                      <Field label="La demande d'effacement" hint="Gardée dans l'historique (sans le contenu effacé).">
                        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={2} maxLength={500} required minLength={3} />}
                      </Field>
                      <Field label="Tape EFFACER pour confirmer">
                        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="confirm" autoComplete="off" required />}
                      </Field>
                    </ActionForm>
                  </Disclosure>
                </li>
              ))}
            </ul>
          )}
          <details className="type-small">
            <summary className="cursor-pointer font-semibold">Voir le rapport complet</summary>
            <pre className="mt-2 max-h-[32rem] overflow-auto rounded-sm bg-sunken p-3 font-mono text-[0.75rem] leading-relaxed">
              {JSON.stringify(report, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}
