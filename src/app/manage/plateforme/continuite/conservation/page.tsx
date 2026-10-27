import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { formatDateLong } from "@/lib/format";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getRetentionOverview } from "@/lib/continuity/data";
import { RECRUITMENT_RETENTION, RETENTION_HOUSEKEEPING, RETENTION_POLICY } from "@/lib/continuity/labels";
import { setRetention } from "@/app/actions/continuity";
import { Field, Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { when } from "@/components/continuity/ContinuityBlocks";

export const metadata: Metadata = { title: "Conservation des données" };

/**
 * /manage/plateforme/continuite/conservation — how long personal records
 * are kept. The durations are a decision of the BDE and the school (the data
 * controller), never of the code: without one, nothing is deleted. Each
 * change is previewed with the real number of rows, confirmed by typing that
 * number, applied by the nightly job in batches, and recorded.
 */
export default async function RetentionPage() {
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  if (!hasPlatform(access, "platform.organizations.manage")) return <PlatformDenied title="Conservation des données" right="Gérer les assos" />;
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const overview = await getRetentionOverview();
  if (!overview) return <Notice tone="danger" icon="alert" title="Les règles de conservation n'ont pas pu être chargées." />;
  const undecided = overview.policies.filter((p) => p.keep_months === null).length;

  return (
    <div className="flex flex-col gap-12">
      <ManagePageHeader
        kicker="Continuité"
        title="Conservation des données"
        description={
          <p>
            Combien de temps le site garde les données des personnes. C&apos;est une décision du BDE et de l&apos;école, à prendre avec
            la personne chargée des données personnelles&nbsp;: le site ne propose aucune durée, et tant qu&apos;une règle n&apos;est pas
            décidée, rien n&apos;est supprimé.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="changer une règle de conservation" />}
      {undecided > 0 && (
        <Notice tone="warn" icon="info" title={`${undecided} règle${undecided > 1 ? "s ne sont" : " n'est"} pas encore décidée${undecided > 1 ? "s" : ""}.`}>
          <p>Ces données sont gardées sans limite pour l&apos;instant. Ce n&apos;est pas un réglage : c&apos;est l&apos;absence de décision.</p>
        </Notice>
      )}

      <ManageSection title="Règles" description="Chaque nuit, au plus 5 000 lignes par règle : un gros rattrapage s'étale sur plusieurs nuits.">
        <ul className="flex flex-col gap-3">
          {overview.policies.map((p) => {
            const words = RETENTION_POLICY[p.key];
            return (
              <li key={p.key} className="flex flex-col gap-2 rounded-md border border-line bg-raised px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{words?.label ?? p.key}</span>
                  {p.keep_months === null ? (
                    <StatusBadge tone="warn">Non décidée · gardé</StatusBadge>
                  ) : (
                    <StatusBadge tone="ok">{`${p.keep_months} mois ${words?.from ?? ""}`}</StatusBadge>
                  )}
                </div>
                <p className="type-small text-muted">
                  {p.keep_months !== null && p.eligible
                    ? p.eligible.count > 0
                      ? `${p.eligible.count} à supprimer à la prochaine nuit (le plus ancien du ${p.eligible.oldest ? formatDateLong(p.eligible.oldest) : "—"}).`
                      : "Rien à supprimer pour l'instant."
                    : "Rien n'est supprimé."}
                  {p.updated_at && ` Décidée le ${formatDateLong(p.updated_at)}${p.updated_by_name ? ` par ${p.updated_by_name}` : ""}.`}
                  {p.note && ` ${p.note}`}
                </p>
                {overview.can_edit && aal2 && (
                  <Disclosure summary="Changer" icon="edit">
                    <ActionForm action={setRetention} hidden={{ key: p.key }} submitLabel="Enregistrer">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Durée (mois)" optional hint="Vide : rien n'est supprimé.">
                          {({ id, describedBy }) => (
                            <Input id={id} aria-describedby={describedBy} name="months" type="number" min={1} max={120} placeholder="Ex : 12"
                              defaultValue={p.keep_months ?? undefined} />
                          )}
                        </Field>
                        <Field label="Nombre à confirmer" optional hint="Demandé quand la règle supprimerait quelque chose.">
                          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="confirm_count" inputMode="numeric" autoComplete="off" />}
                        </Field>
                        <Field label="Décision" optional hint="Ex : décidé en bureau du 3 octobre">
                          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="note" maxLength={500} defaultValue={p.note ?? undefined} />}
                        </Field>
                      </div>
                    </ActionForm>
                  </Disclosure>
                )}
              </li>
            );
          })}
        </ul>
        <p className="type-small text-muted">
          Supprimer une notification supprime aussi le suivi de son e-mail. Les historiques de gouvernance (qui a nommé qui, quand) ne
          sont jamais supprimés ici.
        </p>
      </ManageSection>

      <ManageSection title="Candidatures" description="Réglées avec les recrutements (durées par type de candidature).">
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
          {Object.entries(overview.recruitment).map(([key, r]) => (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-semibold">{RECRUITMENT_RETENTION[key] ?? key}</span>
                <span className="type-small text-muted">
                  {r.months === null
                    ? " · non décidée, rien n'est supprimé"
                    : ` · ${r.months} mois · à la prochaine nuit : ${r.applications} candidature${(r.applications ?? 0) > 1 ? "s" : ""}, ${r.documents} fichier${(r.documents ?? 0) > 1 ? "s" : ""}`}
                </span>
              </span>
              <StatusBadge tone={r.months === null ? "warn" : "ok"}>{r.months === null ? "Non décidée" : `${r.months} mois`}</StatusBadge>
            </li>
          ))}
        </ul>
        <p className="type-small">
          <Link href={routes.managePlatformRecruitment} className="font-semibold underline underline-offset-2">
            Régler la conservation des candidatures
          </Link>
          <span className="text-muted"> · les fichiers des candidatures supprimées partent ensuite du stockage.</span>
        </p>
      </ManageSection>

      <ManageSection title="Journaux techniques" description="Des traces de fonctionnement, pas des dossiers de personnes : leur durée courte est fixe et documentée.">
        <ul className="grid gap-x-6 gap-y-1 type-small sm:grid-cols-2">
          {overview.housekeeping.map((h) => (
            <li key={h.key} className="flex justify-between gap-3 border-b border-line py-1.5">
              <span>{RETENTION_HOUSEKEEPING[h.key] ?? h.key}</span>
              <span className="font-mono text-muted">{h.keep_days} j</span>
            </li>
          ))}
        </ul>
        <p className="type-small text-muted">
          Dernier passage du nettoyage&nbsp;: {overview.last_run?.at ? when(overview.last_run.at) : "pas encore"}.
        </p>
      </ManageSection>
    </div>
  );
}
