import "server-only";
import { cache } from "react";
import { readGovernance } from "@/lib/governance/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import type { AccentKey } from "@/lib/types";
import type { AssociationPayload, MediaPayload } from "./model";
import type { DraftValues } from "./validation";

/**
 * Loaders of the page editor and its preview. Both database functions check
 * the caller's rights themselves (preparing the page, publishing it, or
 * managing its images) and refuse anyone else; a refusal comes back as
 * `{ ok: false, code }`.
 */

export type PageStatus = "draft" | "published" | "unpublished";

export interface EditorMedia extends MediaPayload {
  kind: "logo" | "cover" | "image";
  bytes: number;
  created_at: string;
  /** logo_draft, cover_published, gallery_draft… (empty: unused, removable). */
  uses: string[];
}

export interface EditorTeamMember {
  membership_id: string;
  name: string;
  titles: string | null;
  is_office: boolean;
  /** Holds a current position: shown on the public team (unless hidden). */
  eligible: boolean;
  member_hidden: boolean;
  show_photo: boolean;
  has_bio: boolean;
  is_you: boolean;
}

export interface EditorTeamEntry {
  membership_id: string;
  display_title: string | null;
  hidden: boolean;
}

export interface AssociationEditor {
  organization: {
    id: string;
    slug: string;
    name: string;
    short_name: string | null;
    kind: "bde" | "association";
    status: "setup" | "active" | "suspended" | "archived";
    accent: AccentKey;
  };
  page: {
    status: PageStatus;
    published_revision: number | null;
    first_published_at: string | null;
    published_at: string | null;
    published_by_name: string | null;
    unpublished_at: string | null;
    withheld_at: string | null;
    withheld_reason: string | null;
    is_public: boolean;
  };
  draft: DraftValues & { revision: number; updated_at: string; updated_by_name: string | null };
  published: (Omit<DraftValues, "name" | "short_name" | "accent"> & { revision: number }) | null;
  gallery: { media_id: string; caption: string | null }[];
  team_entries: EditorTeamEntry[];
  team_members: EditorTeamMember[];
  media: EditorMedia[];
  categories: { id: string; slug: string; label: string; archived: boolean }[];
  can: { edit: boolean; publish: boolean; media: boolean };
}

export const getAssociationEditor = cache((organizationId: string) =>
  readGovernance<AssociationEditor>("association_editor", (s) =>
    s.rpc("association_editor", { p_organization_id: organizationId }),
  ),
);

export const getAssociationPreview = cache((organizationId: string) =>
  readGovernance<AssociationPayload & { revision: number }>("association_preview", (s) =>
    s.rpc("association_preview", { p_organization_id: organizationId }),
  ),
);

/** Has the draft changed since the last publication? */
export function hasUnpublishedChanges(editor: AssociationEditor): boolean {
  return editor.page.published_revision === null || editor.draft.revision !== editor.page.published_revision;
}

/** The public team as it will look, from the editor's lists (eligible people, arrangement applied). */
export function arrangedTeam(editor: AssociationEditor) {
  const byId = new Map(editor.team_entries.map((e, i) => [e.membership_id, { ...e, position: i }]));
  return editor.team_members
    .filter((m) => m.eligible)
    .map((m) => ({ member: m, entry: byId.get(m.membership_id) }))
    .sort((a, b) => {
      const pa = a.entry?.position ?? Number.MAX_SAFE_INTEGER;
      const pb = b.entry?.position ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      if (a.member.is_office !== b.member.is_office) return a.member.is_office ? -1 : 1;
      return a.member.name.localeCompare(b.member.name, "fr");
    });
}

/** What a member chose to show on public team sections (their own row; defaults when never set). */
export interface MyPublicProfile {
  hidden: boolean;
  show_photo: boolean;
  bio: string | null;
}

export const getMyPublicProfile = cache(async (membershipId: string): Promise<MyPublicProfile> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("membership_public_profiles")
    .select("hidden, show_photo, bio")
    .eq("membership_id", membershipId)
    .maybeSingle();
  if (error) logDataError("membership_public_profiles.mine", error);
  return data ?? { hidden: false, show_photo: false, bio: null };
});
