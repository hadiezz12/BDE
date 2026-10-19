import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDateLong, formatDayShort, plural } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess } from "@/lib/governance/access";
import { getGovernanceOverview } from "@/lib/governance/queries";
import { OFFICE_LABEL, ORGANIZATION_STATUS_LABEL, TRANSITION_KIND_LABEL } from "@/lib/governance/labels";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { SectionLink } from "@/components/manage/home/SectionLink";
import { GuardianLine, OfficeCard } from "@/components/manage/governance/GovernanceBlocks";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";

export const metadata: Metadata = { title: "Centre de contrôle BDE" };

/**
 * The platform at a glance for the BDE's leadership: its own leadership and
 * guardian, the associations (and those without a president), passations in
 * progress, presidencies about to lapse, and integrity checks. Real counts
 * only (public.governance_overview).
 */
export default async function PlatformOverviewPage() {
  const [overview, access, ctx] = await Promise.all([getGovernanceOverview(), getMyAccess(), getAuthContext()]);
  if (!overview.ok) {
    return (
      <Notice tone="danger" icon="alert" title="La vue d'ensemble n'a pas pu être chargée.">
        <p>Réessaie dans un instant.</p>
      </Notice>
    );
  }
  const o = overview.data;
  const bde = access?.organizations.find((x) => x.kind === "bde");
  const healthIssues = o.health.orphaned_assignments + o.health.overlapping_offices;
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Vue d'ensemble"
        description={<p>La direction du BDE, les assos et leurs présidences, les passations en cours. Chaque chiffre vient de la base, à l&apos;instant.</p>}
        actions={
          <ButtonLink href={routes.managePlatformOrganizations} icon="arrow-right">
            Gérer les assos
          </ButtonLink>
        }
      />
      {!aal2 && <MfaNotice what="Créer une asso, changer son statut ou intervenir sur une présidence" />}

      <StatGroup label="Les assos de la plateforme">
        <StatTile label="Assos actives" value={o.counts.active} />
        <StatTile label="En préparation" value={o.counts.setup} />
        <StatTile label="Suspendues" value={o.counts.suspended} comparison={o.counts.archived ? `${o.counts.archived} archivée(s)` : undefined} />
        <StatTile label="Sans présidence" value={o.without_president.length} tone={o.without_president.length ? "danger" : "neutral"} />
      </StatGroup>

      <ManageSection
        title="Direction du BDE"
        action={bde ? <SectionLink href={routes.manageGovernance(bde.slug)}>Passation du BDE</SectionLink> : undefined}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {o.bde.offices.map((office) => (
            <OfficeCard key={office.office} office={office} />
          ))}
        </div>
        <GuardianLine guardian={o.guardian} />
      </ManageSection>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <ManageSection title="Assos sans présidence" count={o.without_president.length}>
          {o.without_president.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
              {o.without_president.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-semibold">{a.name}</span>
                  <span className="flex items-center gap-3">
                    <StatusBadge tone={a.status === "active" ? "warn" : "neutral"}>{ORGANIZATION_STATUS_LABEL[a.status]}</StatusBadge>
                    <Link href={`${routes.managePlatformOrganizations}#asso-${a.slug}`} className="type-small font-semibold text-assoc-text hover:underline">
                      Nommer
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ManageEmpty icon="check" title="Chaque asso a sa présidence">
              <p>Une asso sans présidence apparaîtrait ici, avec de quoi en nommer une.</p>
            </ManageEmpty>
          )}
        </ManageSection>

        <ManageSection title="Passations en cours" count={o.open_transitions.length}>
          {o.open_transitions.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
              {o.open_transitions.map((t) => (
                <li key={t.id} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="font-semibold">
                    {t.organization_name} · {TRANSITION_KIND_LABEL[t.kind]}
                  </span>
                  <span className="type-meta text-subtle">
                    Proposée le {formatDayShort(t.created_at)} · effet le {formatDayShort(t.effective_at)} · expire le {formatDayShort(t.expires_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ManageEmpty icon="clock" title="Aucune passation en cours">
              <p>Les passations proposées par les présidences apparaissent ici jusqu&apos;à leur validation.</p>
            </ManageEmpty>
          )}
        </ManageSection>
      </div>

      <ManageSection
        title="Présidences qui se terminent"
        count={o.expiring_offices.length}
        description="Mandats qui s'arrêtent dans les 45 jours sans successeur prévu. Sans passation, le poste deviendra vacant à la date de fin."
      >
        {o.expiring_offices.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
            {o.expiring_offices.map((e) => (
              <li key={`${e.organization_slug}-${e.office}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-semibold">{e.holder_name}</span> · {OFFICE_LABEL[e.office]} · {e.organization_name}
                </span>
                <StatusBadge tone="warn">Jusqu&apos;au {formatDateLong(e.ends_at)}</StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <ManageEmpty icon="calendar" title="Rien ne se termine dans les 45 jours" />
        )}
      </ManageSection>

      <ManageSection title="Contrôles d'intégrité" description="Ce que la base vérifie à chaque chargement. Zéro partout : tout est cohérent.">
        <StatGroup label="Contrôles d'intégrité" columns={3}>
          <StatTile label="Postes sans adhésion active" value={o.health.orphaned_assignments} tone={o.health.orphaned_assignments ? "danger" : "ok"} comparison="Mandats d'un membre suspendu ou parti" />
          <StatTile label="Délégations expirées (30 j)" value={o.health.lapsed_delegations} comparison="Terminées d'elles-mêmes : rien à faire" />
          <StatTile label="Mandats en chevauchement" value={o.health.overlapping_offices} tone={o.health.overlapping_offices ? "danger" : "ok"} comparison="Impossible par construction" />
        </StatGroup>
        {healthIssues > 0 && (
          <p className="type-small text-danger">
            {plural(healthIssues, "anomalie")} à regarder&nbsp;: les mandats concernés ne donnent aucun droit tant que l&apos;adhésion n&apos;est pas active.
          </p>
        )}
      </ManageSection>

      <ManageSection title="Modération">
        <ManageEmpty icon="shield" title="Arrive avec les contenus publics">
          <p>Retirer un contenu public qui pose problème sera possible quand les assos publieront leurs articles et événements.</p>
        </ManageEmpty>
      </ManageSection>
    </div>
  );
}
