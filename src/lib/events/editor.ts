import "server-only";
import { cache } from "react";
import { readGovernance } from "@/lib/governance/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import type { AccentKey, EventLocationType, RegistrationMode } from "@/lib/types";
import type { OrganizationCardPayload } from "@/lib/posts/model";
import type { AttendeeRow, EventCardPayload, EventSummary } from "./model";

/**
 * Loaders of the event desk, the wizard, the private preview, the
 * participant list and the BDE's platform list. Each database function
 * identifies the caller and checks the right itself (events.* in the
 * event's own association, events.attendees.* for people, the platform keys
 * for the BDE); a refusal comes back as `{ ok: false, code }`, never as data.
 */

export interface EventDashboard {
  organization: {
    id: string;
    slug: string;
    name: string;
    short_name: string | null;
    accent: AccentKey;
    kind: "bde" | "association";
    status: "setup" | "active" | "suspended" | "archived";
    page_public: boolean;
  };
  can: {
    create: boolean;
    edit: boolean;
    publish: boolean;
    attendees_view: boolean;
    attendees_manage: boolean;
    attendees_export: boolean;
    /** Sees every event of the association (otherwise only one's own drafts). */
    all: boolean;
  };
  events: EventSummary[];
}

/** Every column of an event, as its team may read it (private joining details included). */
export interface EventRow {
  id: string;
  organization_id: string;
  slug: string | null;
  series_key: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  category_id: string | null;
  cover_media_id: string | null;
  location_type: EventLocationType;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  online_url: string | null;
  access_details: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  registration_mode: RegistrationMode;
  external_url: string | null;
  capacity: number | null;
  waitlist_enabled: boolean;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  cancellation_cutoff_minutes: number;
  publication: "draft" | "published" | "unpublished";
  first_published_at: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  status: "scheduled" | "cancelled";
  cancelled_at: string | null;
  cancellation_reason: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  pinned_at: string | null;
  prominence: "normal" | "featured";
  prominence_until: string | null;
  confirmed_count: number;
  waitlist_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface EventHistoryEntry {
  occurred_at: string;
  action: string;
  actor_name: string | null;
  details: Record<string, unknown>;
  reason: string | null;
}

export interface EventEditor {
  event: EventRow;
  summary: EventSummary;
  organization: OrganizationCardPayload & { status: EventDashboard["organization"]["status"]; page_public: boolean };
  coorganizers: OrganizationCardPayload[];
  /** Associations that may be credited as co-organizers. */
  organizations: { id: string; name: string; short_name: string | null }[];
  categories: { id: string; slug: string; label: string; archived: boolean }[];
  media: { id: string; path: string; kind: "logo" | "cover" | "image"; width: number; height: number; alt: string | null }[];
  history: EventHistoryEntry[];
  creator_name: string;
  can: {
    edit: boolean;
    publish: boolean;
    upload: boolean;
    attendees_view: boolean;
    attendees_manage: boolean;
    attendees_export: boolean;
    delete: boolean;
    /** The BDE: may link an event to one of its events of the year. */
    series: boolean;
  };
}

/** The event as visitors will see it, for its team. */
export type EventPreview = EventCardPayload & {
  description: string | null;
  publication: "draft" | "published" | "unpublished";
  is_public: boolean;
  access_details: string | null;
  blocker: string | null;
};

export interface EventAttendees {
  event: EventSummary;
  total: number;
  counts: { confirmed: number; waitlisted: number; cancelled: number };
  can_manage: boolean;
  can_export: boolean;
  rows: AttendeeRow[];
}

export interface AttendeesExport {
  event: { title: string; starts_at: string | null; slug: string | null };
  rows: { name: string; status: "confirmed" | "waitlisted"; reference: string; created_at: string; confirmed_at: string | null; position: number | null }[];
}

export type PlatformEvent = EventCardPayload & {
  hidden: { at: string; reason: string; by_name: string | null } | null;
  publication: "draft" | "published" | "unpublished";
  is_public: boolean;
};

export interface EventCategoryRow {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  archived_at: string | null;
}

export const getEventDashboard = cache((organizationId: string) =>
  readGovernance<EventDashboard>("event_dashboard", (s) => s.rpc("event_dashboard", { p_organization_id: organizationId })),
);

export const getEventEditor = cache((eventId: string) =>
  readGovernance<EventEditor>("event_editor", (s) => s.rpc("event_editor", { p_event_id: eventId })),
);

export const getEventPreview = cache((eventId: string) =>
  readGovernance<EventPreview>("event_preview", (s) => s.rpc("event_preview", { p_event_id: eventId })),
);

export const getEventAttendees = cache(
  (eventId: string, status: "confirmed" | "waitlisted" | "cancelled" | null, q: string | null, offset: number, limit: number) =>
    readGovernance<EventAttendees>("event_attendees", (s) =>
      s.rpc("event_attendees", {
        p_event_id: eventId,
        p_status: status ?? undefined,
        p_q: q ?? undefined,
        p_offset: offset,
        p_limit: limit,
      }),
    ),
);

export const getPlatformEvents = cache((q: string | null, view: "upcoming" | "past" | "hidden") =>
  readGovernance<PlatformEvent[]>("platform_events", (s) => s.rpc("platform_events", { p_q: q ?? undefined, p_view: view })),
);

/** The category catalog (active ones for everyone; BDE leadership also reads archived ones). */
export const getEventCategories = cache(async (): Promise<EventCategoryRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_categories")
    .select("id, slug, label, sort_order, archived_at")
    .order("sort_order")
    .order("label");
  if (error) {
    logDataError("event_categories", error);
    return [];
  }
  return data as EventCategoryRow[];
});


/** The event an article points to, and the ones it may point to (its editor's side panel). */
export interface PostEventOptions {
  current: {
    id: string;
    slug: string | null;
    title: string;
    starts_at: string | null;
    publication: "draft" | "published" | "unpublished";
    status: "scheduled" | "cancelled";
    is_public: boolean;
    organization: OrganizationCardPayload;
  } | null;
  can_change: boolean;
  options: {
    id: string;
    title: string;
    starts_at: string | null;
    publication: "draft" | "published" | "unpublished";
    own: boolean;
    organization: OrganizationCardPayload;
  }[];
}

export const getPostEventOptions = cache((postId: string) =>
  readGovernance<PostEventOptions>("post_event_options", (s) => s.rpc("post_event_options", { p_post_id: postId })),
);
