import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getManageGate, getPublicHref } from "@/lib/data/manage";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState } from "@/components/manage/ManageState";
import { ManageWorkspace } from "@/components/manage/ManageWorkspace";

type Params = Promise<{ asso: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { asso } = await params;
  const gate = await getManageGate(asso);
  if (!gate) return { title: "Association introuvable" };
  const { name } = gate.organization;
  return { title: { template: `%s · ${name} · Espace assos`, default: name } };
}

/**
 * One association's workspace. Resolves the slug (404 when unknown or not
 * visible), shows the access gate to visitors and to students outside the
 * team, otherwise the workspace frame with the sections their permissions
 * open. Section pages repeat the check with getManageContext() because a
 * layout does not stop its pages from rendering.
 */
export default async function ManageAssociationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { asso } = await params;
  const gate = await getManageGate(asso);
  if (!gate) notFound();

  if (gate.status !== "ok") {
    return (
      <ManageMain>
        <div data-accent={gate.organization.accent}>
          {gate.status === "login" ? (
            <ManageGateState reason="login" association={gate.organization} />
          ) : (
            <ManageGateState reason="forbidden" association={gate.organization} managed={gate.managed} />
          )}
        </div>
      </ManageMain>
    );
  }

  return (
    <ManageWorkspace association={gate.workspace} managed={gate.managed} publicHref={await getPublicHref(asso)}>
      {children}
    </ManageWorkspace>
  );
}
