import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

export default function ManageContentLoading() {
  return <ManageSkeleton label="Chargement des contenus…" rows={6} />;
}
