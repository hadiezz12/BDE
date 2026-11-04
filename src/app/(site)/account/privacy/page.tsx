import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/auth/context";
import { formatDateLong, formatDayShort } from "@/lib/format";
import { getMyPrivacyOverview } from "@/lib/privacy/data";
import {
  DATA_COUNT_LABEL,
  REQUEST_EVENT_LABEL,
  REQUEST_KIND_LABEL,
  REQUEST_KINDS,
  REQUEST_STATUS,
  RESPONSIBILITY_KIND,
  dueDayIso,
} from "@/lib/privacy/labels";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { submitPrivacyRequest, withdrawPrivacyRequest } from "@/app/actions/privacy";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionForm } from "@/components/manage/governance/ActionForm";

export const metadata: Metadata = {
  title: "Mes données",
  description: "Ce que le site garde sur toi, le téléchargement de tes données, et tes demandes (correction, effacement…).",
};

/**
 * /account/privacy — "Mes données" (Phase 14): what the site holds about the
 * person (counts), an immediate download of their own data (JSON, built on
 * demand, recorded, never stored), the requests the privacy officer
 * handles (access with evaluations, correction, erasure, restriction,
 * objection…), their status, deadline and history, and the files prepared
 * for them. Only the person's own rows, through my_privacy_overview.
 */
export default async function AccountPrivacyPage() {
  await requireUser(routes.accountPrivacy);
  const read = await getMyPrivacyOverview();

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Mes données"
        intro="Ce que le site garde sur toi, et ce que tu peux en faire : tout télécharger, corriger, faire effacer, ou poser une question. Les réponses arrivent dans un délai d'un mois."
      />
      {!read.ok ? (
        <div className="wrap">
          <p role="alert" className="rounded-md border border-danger/50 bg-raised p-5">
            {governanceErrorMessage(read.code)}
          </p>
        </div>
      ) : (
        <div className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-16 lg:col-span-8">
            <section aria-labelledby="garde-titre">
              <SectionHeader id="garde-titre" index="01" kicker="Ce que le site garde" title="Tes données, en chiffres" />
              <dl className="mt-6 grid grid-cols-1 border-t border-line sm:grid-cols-2">
                {Object.entries(DATA_COUNT_LABEL).map(([key, label]) => (
                  <div key={key} className="flex items-baseline justify-between gap-4 border-b border-line py-3 sm:pr-6">
                    <dt>{label}</dt>
                    <dd className="type-meta font-bold">{String(read.data.counts[key] ?? 0)}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 sm:pr-6">
                  <dt>Photo de profil</dt>
                  <dd className="type-meta font-bold">{read.data.counts.photo ? "Oui" : "Non"}</dd>
                </div>
              </dl>
              <p className="mt-4 type-small text-muted">
                Ton compte (adresse e-mail de l&apos;école, prénom, nom) s&apos;ajoute à cette liste. Le détail de chaque donnée est dans le
                téléchargement ci-dessous ; ce qui est fait de chacune est expliqué dans la{" "}
                <Link href={routes.privacy} className="link font-semibold">
                  notice de confidentialité
                </Link>
                .
              </p>
            </section>

            <section aria-labelledby="telecharger-titre">
              <SectionHeader
                id="telecharger-titre"
                index="02"
                kicker="Tout de suite"
                title="Télécharger mes données"
                description="Un fichier JSON avec ton compte, ton profil, tes adhésions et postes, tes inscriptions, tes candidatures (tes réponses et le nom de tes fichiers), tes enregistrés, tes choix et tes notifications. Jamais les données de quelqu'un d'autre."
              />
              <form method="post" action={routes.accountPrivacyExport} className="mt-6 flex flex-wrap items-center gap-4">
                <Button type="submit" icon="file">
                  Télécharger (JSON)
                </Button>
                <span className="type-small text-muted">Dix téléchargements par jour au plus. Chaque téléchargement est noté.</span>
              </form>
              <p className="mt-4 type-small text-muted">
                Les évaluations de tes candidatures ne sont pas dans ce fichier : elles se demandent par une demande d&apos;accès
                ci-dessous, examinée par la personne chargée des données (les noms des autres personnes en sont retirés).
              </p>
            </section>

            <section aria-labelledby="demande-titre">
              <SectionHeader
                id="demande-titre"
                index="03"
                kicker="Une demande"
                title="Corriger, effacer, limiter, s'opposer…"
                description="Ton profil se corrige directement dans Profil. Pour tout le reste, fais une demande : la personne chargée des données y répond, toi seul·e et elle la voyez."
              />
              <div className="mt-6 max-w-2xl">
                <ActionForm action={submitPrivacyRequest} submitLabel="Envoyer ma demande" submitIcon="arrow-right" resetOnDone>
                  <fieldset className="flex flex-col gap-3">
                    <legend className="mb-2 font-bold">Ce que tu demandes</legend>
                    {REQUEST_KINDS.filter((k) => k.key !== "erasure").map((k, i) => (
                      <label key={k.key} className="flex cursor-pointer items-start gap-3 rounded-sm border border-line px-3.5 py-3 hover:border-line-strong">
                        <input type="radio" name="kind" value={k.key} required defaultChecked={i === 0} className="mt-1 size-4 accent-accent" />
                        <span className="flex flex-col gap-0.5">
                          <span className="font-semibold">{k.label}</span>
                          <span className="type-small text-muted">{k.help}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <Field label="Précisions" hint="Obligatoire pour une correction, une limitation, une opposition ou une autre demande. Pas besoin de donner d'informations sensibles.">
                    {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="details" rows={4} maxLength={2000} />}
                  </Field>
                </ActionForm>
              </div>
            </section>

            <section aria-labelledby="supprimer-titre">
              <SectionHeader
                id="supprimer-titre"
                index="04"
                kicker="Fermer mon compte"
                title="Supprimer mon compte et mes données"
                description="Ce n'est pas immédiat : la demande est examinée (les responsabilités en cours, ce qu'une règle oblige à garder), puis exécutée. Tu es prévenu·e à chaque étape."
              />
              <div className="mt-6 flex max-w-2xl flex-col gap-5">
                <ul className="flex list-disc flex-col gap-1.5 pl-5 type-small">
                  <li>Ton compte ne pourra plus se connecter ; ton profil et ta photo sont effacés.</li>
                  <li>Tes candidatures (réponses, CV, documents), inscriptions, enregistrés, choix et notifications sont effacés.</li>
                  <li>
                    L&apos;historique des équipes dont tu as fait partie reste, sous « Compte supprimé » : on garde qui a occupé quel poste,
                    jamais ton nom ni ton adresse.
                  </li>
                  <li>
                    Ce qu&apos;une règle oblige à garder (un litige en cours, par exemple) est conservé à part, et la réponse te le dit.
                  </li>
                </ul>
                {read.data.responsibilities.length > 0 && (
                  <div className="rounded-md border-2 border-warn/60 bg-raised p-4 type-small">
                    <p className="font-bold">Tu as des responsabilités en cours :</p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {read.data.responsibilities.map((r, i) => (
                        <li key={i}>
                          {RESPONSIBILITY_KIND[r.kind] ?? r.kind}
                          {r.title ? ` « ${r.title} »` : ""}
                          {r.organization ? ` · ${r.organization}` : ""} · jusqu&apos;au {formatDayShort(r.ends_at)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-muted">
                      Elles prendront fin avec l&apos;effacement. Si tu le peux, organise ta succession avant (Gérer › Gouvernance) pour que
                      ton équipe continue sans interruption.
                    </p>
                  </div>
                )}
                <ActionForm action={submitPrivacyRequest} hidden={{ kind: "erasure" }} submitLabel="Demander la suppression" variant="danger">
                  <Checkbox name="confirm" required label="J'ai compris : mon compte sera fermé et mes données effacées après examen de la demande." />
                  <Field label="Précisions (facultatif)">
                    {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="details" rows={3} maxLength={2000} />}
                  </Field>
                </ActionForm>
              </div>
            </section>
          </div>

          <aside aria-labelledby="mes-demandes-titre" className="flex flex-col gap-6 lg:col-span-4">
            <h2 id="mes-demandes-titre" className="type-label text-accent-text">
              Mes demandes
            </h2>
            {read.data.requests.length === 0 ? (
              <p className="type-small text-muted">Aucune demande pour l&apos;instant.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {read.data.requests.map((q) => {
                  const st = REQUEST_STATUS[q.status];
                  const open = !["completed", "refused", "withdrawn"].includes(q.status);
                  return (
                    <li key={q.id} className="flex flex-col gap-3 rounded-md border border-line bg-raised p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[0.8rem] font-bold">{q.reference}</span>
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </div>
                      <p className="font-semibold">{REQUEST_KIND_LABEL[q.kind]}</p>
                      <p className="type-small text-muted">
                        Reçue le {formatDateLong(q.received_at)}
                        {open && <> · réponse au plus tard le {formatDateLong(dueDayIso(q.due_at))}</>}
                        {q.extended && " (délai prolongé)"}
                      </p>
                      {q.extension_reason && open && <p className="type-small">Prolongation : {q.extension_reason}</p>}
                      {q.decision_reason && <p className="type-small">Réponse : {q.decision_reason}</p>}
                      {q.events.length > 0 && (
                        <ol className="flex flex-col gap-1 border-l-2 border-line pl-3 type-small">
                          {q.events.map((e, i) => (
                            <li key={i}>
                              <span className="font-semibold">{REQUEST_EVENT_LABEL[e.action] ?? e.action}</span>
                              <span className="text-muted"> · {formatDayShort(e.at)}</span>
                              {e.action === "note" && e.note && <span className="block">{e.note}</span>}
                            </li>
                          ))}
                        </ol>
                      )}
                      {q.artifacts
                        .filter((a) => a.available)
                        .map((a) => (
                          <form key={a.id} method="post" action={routes.accountPrivacyFile}>
                            <input type="hidden" name="artifact_id" value={a.id} />
                            <Button type="submit" size="sm" variant="secondary" icon="file">
                              Télécharger (jusqu&apos;au {formatDayShort(a.expires_at)})
                            </Button>
                          </form>
                        ))}
                      {q.withdrawable && (
                        <ActionForm action={withdrawPrivacyRequest} hidden={{ request_id: q.id }} submitLabel="Retirer ma demande" variant="ghost" size="sm" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="type-small text-muted">
              Une réponse ne te convient pas ? Tu peux adresser une réclamation à la CNIL (www.cnil.fr).
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
