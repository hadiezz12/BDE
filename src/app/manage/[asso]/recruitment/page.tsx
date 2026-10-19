import type { Metadata } from "next";
import { getManageContext } from "@/lib/data/manage";
import { ModuleSoon } from "@/components/manage/governance/ModuleSoon";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Recrutement" };

/** /manage/[asso]/recruitment — module of a later phase: what it will hold, and the rights that will apply. */
export default async function ManageRecruitmentPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  return <ModuleSoon section="recruitment" ctx={ctx} />;
}
