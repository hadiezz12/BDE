import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { formatDateLong, plural } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess } from "@/lib/governance/access";
import { getGovernanceInbox } from "@/lib/governance/queries";
import { ORGANIZATION_STATUS_LABEL } from "@/lib/governance/labels";
import { canHandlePrivacy, canUseContinuity, canUsePlatform, manageEntries, toWorkspaceRef } from "@/lib/governance/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState } from "@/components/manage/ManageState";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManagedAssociationList, type ChooserEntry } from "@/components/manage/chooser/ManagedAssociationList";

// The manage layout's "%s · Espace assos" template only reaches child segments,
// not this page of the same segment: name the workspace here.
export const metadata: Metadata = { title: "Tes espaces · Espace assos" };

/**
 * /manage — the door of the workspace, from what the database says this
 * person holds right now:
 *  - visitor                         → sign in first
 *  - member of nothing, no platform  → how one joins a team (and the invitations waiting)
 *  - exactly one space               → straight to it
 *  - several                         → pick one
 */
export default async function ManageChooserPage() {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") {
    return (
      <ManageMain>
        <ManageGateState reason="login" />
      </ManageMain>
    );
  }

  const access = await getMyAccess();
  const platform = canUsePlatform(access);
  const continuity = canUseContinuity(access);
  const organizations = access?.organizations ?? [];
  const privacy = canHandlePrivacy(access);
  const total = organizations.length + Number(platform) + Number(continuity) + Number(privacy);

  if (total === 0) {
    return (
      <ManageMain>
        <ManageGateState reason="none" />
      </ManageMain>
    );
  }
  if (total === 1) {
    redirect(
      platform
        ? routes.managePlatform
        : continuity
          ? routes.manageContinuity
          : privacy
            ? routes.managePrivacy
            : routes.manageHome(organizations[0].slug),
    );
  }

  const inbox = await getGovernanceInbox();
  const waiting = inbox.ok ? inbox.data.invitations.length + inbox.data.candidacies.length + inbox.data.approvals.length : 0;
  const platformEntries = manageEntries(access).filter((e) => e.icon);

  const entries: ChooserEntry[] = [
    ...platformEntries.map((entry) => ({
      entry,
      kicker: entry.key === "review" ? "Recrutement" : "Plateforme",
      title: entry.label,
      facts: [],
    })),
    ...organizations.map((org) => {
      const ref = toWorkspaceRef(org);
      const nextEnd = org.positions.map((p) => p.ends_at).sort()[0];
      return {
        entry: {
          key: org.id,
          href: routes.manageHome(org.slug),
          label: org.name,
          detail: ref.detail,
          name: org.name,
          shortName: org.short_name ?? undefined,
          accent: org.accent,
        },
        kicker: org.kind === "bde" ? "BDE" : "Association",
        title: org.name,
        facts: [
          org.status !== "active" ? ORGANIZATION_STATUS_LABEL[org.status] : null,
          nextEnd ? `Mandat jusqu'au ${formatDateLong(nextEnd)}` : null,
        ].filter((f): f is string => Boolean(f)),
      };
    }),
  ];

  return (
    <ManageMain>
      <div className="flex flex-col gap-8">
        <ManagePageHeader
          kicker="Espace assos"
          title="Tes espaces"
          description={
            <p>
              Chaque espace a sa propre adresse&nbsp;: tu peux les garder ouverts côte à côte, dans plusieurs onglets.
              Ce que tu y vois dépend de tes postes du moment.
            </p>
          }
          actions={
            waiting > 0 ? (
              <ButtonLink href={routes.accountInvitations} variant="secondary" icon="mail" iconPosition="start">
                {plural(waiting, "réponse attendue", "réponses attendues")}
              </ButtonLink>
            ) : undefined
          }
        />
        <ManagedAssociationList entries={entries} />
      </div>
    </ManageMain>
  );
}
