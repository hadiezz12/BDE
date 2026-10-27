import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDateLong } from "@/lib/format";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getGovernanceHealth, getPlatformOperations } from "@/lib/continuity/data";
import { BACKUP_STATUS, JOB_HEALTH, OFFICE_WORDS, SUCCESSION_STATE } from "@/lib/continuity/labels";
import { TRANSITION_KIND_LABEL } from "@/lib/governance/labels";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { Notice } from "@/components/manage/governance/Notices";
import { IssueList, when } from "@/components/continuity/ContinuityBlocks";

export const metadata: Metadata = { title: "Continuité" };

const APPROVAL: Record<string, string> = {
  bde_president: "présidence du BDE",
  bde_vice_president: "vice-présidence du BDE",
  guardian: "garant·e",
};

/**
 * /manage/plateforme/continuite — will the site keep working when the team
 * changes? Who leads the BDE and the associations, what ends soon, which
 * passations wait on whom, and what the hourly check found (the same words
 * as the alerts). Counts and offices only: no applicant, no participant.
 */
export default async function ContinuityOverviewPage() {
  const access = await getMyAccess();
  const governance = hasPlatform(access, "platform.organizations.manage");
  const operations = hasPlatform(access, "platform.operations.monitor");
  const [health, ops] = await Promise.all([governance ? getGovernanceHealth() : null, operations ? getPlatformOperations() : null]);

  return (
    <div className="flex flex-col gap-12">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Continuité"
        description={
          <p>
            Ce qui permet au site de continuer quand les équipes changent&nbsp;: les présidences, les passations, les tâches
            automatiques, les sauvegardes. Les droits, eux, suivent toujours les mandats&nbsp;: rien ici ne nomme ni ne prolonge personne.
          </p>
        }
      />

      {governance && !health && <Notice tone="danger" icon="alert" title="La situation n'a pas pu être chargée." />}
      {health && (
        <>
          <StatGroup label="Gouvernance">
            {health.bde.map((o) => (
              <StatTile
                key={o.office}
                label={OFFICE_WORDS[o.office] ?? o.office}
                value={o.name ? "Active" : "Vacante"}
                tone={o.name ? "ok" : "danger"}
                comparison={o.name ? `${o.name}${o.ends_at ? ` · jusqu'au ${formatDateLong(o.ends_at)}` : ""}` : "Personne en poste"}
              />
            ))}
            <StatTile
              label="Garant·e de continuité"
              value={health.guardian.configured ? (health.guardian.ready ? "Prêt·e" : "À protéger") : "Absent·e"}
              tone={health.guardian.configured && health.guardian.ready ? "ok" : "danger"}
              comparison={health.guardian.configured ? (health.guardian.ready ? "Double authentification active" : "Sans double authentification") : "Personne ne peut rétablir le BDE"}
            />
            <StatTile
              label="Assos actives"
              value={health.associations.total}
              tone={health.associations.without_president ? "danger" : "neutral"}
              comparison={health.associations.without_president ? `${health.associations.without_president} sans présidence` : "Toutes ont une présidence"}
            />
            <StatTile label="Mandats qui finissent dans 30 jours" value={health.mandates_expiring_30} />
            <StatTile label="Passations en cours" value={health.transitions.length} />
          </StatGroup>

          <p className="type-small text-muted">
            {health.year ? (
              <>
                Année en cours&nbsp;: <span className="font-semibold text-fg">{health.year.label}</span>.{" "}
              </>
            ) : null}
            Dernière vérification automatique&nbsp;: {health.check.last_succeeded_at ? when(health.check.last_succeeded_at) : "jamais"} (
            {(JOB_HEALTH[health.check.health] ?? JOB_HEALTH.unverifiable).label.toLowerCase()}).
            {health.officers_without_mfa > 0 &&
              ` ${health.officers_without_mfa} responsable${health.officers_without_mfa > 1 ? "s n'ont" : " n'a"} pas de double authentification (prévenu·e${health.officers_without_mfa > 1 ? "s" : ""} directement).`}
          </p>

          <ManageSection title="Points à régler" count={health.issues.length}>
            <IssueList
              issues={health.issues}
              target="platform"
              empty="Aucune présidence vacante, aucune succession en retard, aucune passation bloquée."
            />
          </ManageSection>

          <ManageSection
            title="Présidences d'assos qui finissent dans 60 jours"
            count={health.presidencies.length}
            description={
              health.handovers_not_started > 0
                ? `${health.handovers_not_started} de ces assos n'ont encore coché aucun point de leur liste de passation.`
                : undefined
            }
          >
            {health.presidencies.length === 0 ? (
              <ManageEmpty icon="calendar" title="Aucune dans les 60 prochains jours">
                <p>Les présidences qui approchent de leur fin apparaîtront ici, avec l&apos;état de leur succession.</p>
              </ManageEmpty>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
                {health.presidencies.map((p) => {
                  const state = SUCCESSION_STATE[p.succession] ?? SUCCESSION_STATE.none;
                  return (
                    <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <span>
                        <span className="font-semibold">{p.organization}</span>
                        <span className="type-small text-muted"> · {p.name}, jusqu&apos;au {formatDateLong(p.ends_at)}</span>
                      </span>
                      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            )}
          </ManageSection>

          <ManageSection title="Passations en cours" count={health.transitions.length}>
            {health.transitions.length === 0 ? (
              <ManageEmpty icon="users" title="Aucune passation en cours">
                <p>Une passation proposée apparaît ici avec ce qu&apos;elle attend encore (acceptation, approbation).</p>
              </ManageEmpty>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
                {health.transitions.map((t) => (
                  <li key={t.id} className="flex flex-col gap-1 px-4 py-3">
                    <p className="font-semibold">
                      {t.organization} · {TRANSITION_KIND_LABEL[t.kind as keyof typeof TRANSITION_KIND_LABEL] ?? t.kind}
                    </p>
                    <p className="type-small text-muted">
                      Prend effet le {formatDateLong(t.effective_at)} · expire le {formatDateLong(t.expires_at)} si elle n&apos;aboutit pas.
                    </p>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 type-small">
                      {t.candidates.map((c) => (
                        <li key={c.office}>
                          {OFFICE_WORDS[c.office] ?? c.office}&nbsp;: {c.name} ·{" "}
                          {c.accepted === true ? "a accepté" : c.accepted === false ? "a refusé" : "n'a pas encore répondu"}
                        </li>
                      ))}
                      {(t.missing_approvals ?? []).map((a) => (
                        <li key={a} className="text-warn">
                          Approbation attendue&nbsp;: {APPROVAL[a] ?? a}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </ManageSection>
        </>
      )}

      {ops && (
        <ManageSection
          title="Opérations"
          action={
            <ButtonLink href={routes.managePlatformOperations} size="sm" variant="secondary" icon="arrow-right">
              Détail
            </ButtonLink>
          }
        >
          <StatGroup label="Opérations">
            <StatTile
              label="Tâches automatiques"
              value={ops.scheduler_available ? `${ops.jobs.filter((j) => j.health === "ok").length}/${ops.jobs.length}` : "—"}
              tone={ops.jobs.some((j) => j.health !== "ok" && j.health !== "unverifiable") ? "danger" : "ok"}
              comparison={ops.scheduler_available ? "à l'heure" : "impossible à vérifier ici"}
            />
            <StatTile
              label="Restaurations testées"
              value={ops.backups.filter((b) => b.kind.endsWith("restore_test") && b.status === "verified").length + "/2"}
              tone={ops.backups.some((b) => b.kind.endsWith("restore_test") && b.status !== "verified") ? "danger" : "ok"}
              comparison={ops.backups
                .filter((b) => b.kind.endsWith("restore_test"))
                .map((b) => (BACKUP_STATUS[b.status] ?? BACKUP_STATUS.never).label)
                .join(" · ")}
            />
            <StatTile
              label="Registre vérifié"
              value={`${ops.register.filter((r) => r.status === "verified").length}/${ops.register.length}`}
              tone={ops.register.some((r) => r.status !== "verified") ? "danger" : "ok"}
            />
            <StatTile
              label="Incidents ouverts"
              value={ops.incidents.filter((i) => i.status !== "resolved").length}
              tone={ops.incidents.some((i) => i.status !== "resolved") ? "danger" : "neutral"}
            />
          </StatGroup>
          {ops.issues.length > 0 && (
            <p className="type-small">
              {ops.issues.length} point{ops.issues.length > 1 ? "s" : ""} technique{ops.issues.length > 1 ? "s" : ""} à regarder&nbsp;:{" "}
              <Link href={routes.managePlatformOperations} className="font-semibold underline underline-offset-2">
                voir les opérations
              </Link>
              .
            </p>
          )}
        </ManageSection>
      )}
    </div>
  );
}
