import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

export default function ManageRecruitmentLoading() {
  return <ManageSkeleton label="Chargement des candidatures…" stats={3} rows={8} />;
}
