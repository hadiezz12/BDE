import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

export default function PlatformModerationLoading() {
  return <ManageSkeleton label="Chargement de la modération…" rows={4} />;
}
