import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

/**
 * Workspace home loading state. It sits inside the [asso] layout, so the
 * section nav stays usable, and it is also the fallback for any section that
 * has no loading.tsx of its own: hence the neutral label.
 */
export default function ManageHomeLoading() {
  return <ManageSkeleton label="Chargement de l'espace…" rows={6} />;
}
