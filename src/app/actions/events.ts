"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { endOfParisDay } from "@/lib/governance/labels";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { parseEventStep, type EventStep, type FieldErrors, type Fields } from "@/lib/events/input";
import { ordinal, publicationDoneMessage } from "@/lib/events/model";
import { eventSeries } from "@/data/mock";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of events (Phase 7): the association's event desk and wizard,
 * students' registrations, saved events and messages, BDE moderation and
 * front page. Each one forwards to a database function
 * (supabase/migrations/2026102312*) that identifies the caller, checks the
 * right in the event's own association (or the platform right), locks the
 * event when seats are involved, writes in one transaction and audits.
 * Ids in forms are untrusted: the database refuses what the person may not do.
 */

export interface EventActionState extends GovernanceActionState {
  fieldErrors?: FieldErrors;
  /** The event's new version after a save (the next save must send it). */
  version?: number;
}

export interface RegistrationActionState extends GovernanceActionState {
  /** The database's answer, never a guess: confirmed or waitlisted (with the place). */
  outcome?: { status: "confirmed" | "waitlisted" | "cancelled"; position: number | null; already: boolean; reference?: string };
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string; details?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STEPS: EventStep[] = ["infos", "lieu", "visuels", "inscriptions"];
/** Where "save and continue" may lead (the wizard's steps). */
const NEXT_STEPS = [...STEPS, "apercu", "publication"];

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optional = (form: FormData, name: string) => text(form, name) || undefined;
const id = (form: FormData, name: string) => {
  const v = text(form, name);
  return UUID.test(v) ? v : null;
};

function failure(code: GovernanceErrorCode, message?: string): GovernanceActionState {
  return { status: "error", code, message: message ?? governanceErrorMessage(code), at: Date.now() };
}

async function call(
  where: string,
  rpc: (supabase: Supabase) => PromiseLike<RpcResult>,
): Promise<{ ok: true; data: unknown } | { ok: false; state: GovernanceActionState }> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return { ok: false, state: failure("not_authenticated") };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await rpc(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return { ok: false, state: failure(code) };
  }
  // The agenda, the calendar, the event page, association pages, the home
  // page and the student's own pages all read live data: render fresh.
  revalidatePath("/", "layout");
  return { ok: true, data };
}

async function run(
  where: string,
  rpc: (supabase: Supabase) => PromiseLike<RpcResult>,
  done: string | ((data: unknown) => string),
): Promise<GovernanceActionState> {
  const result = await call(where, rpc);
  if (!result.ok) return result.state;
  return { status: "done", message: typeof done === "string" ? done : done(result.data), at: Date.now() };
}

/** Form fields as the step parser reads them (multi-valued ones kept as lists). */
function fieldsOf(form: FormData): Fields {
  const out: Fields = {};
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key).map(String);
    out[key] = all.length > 1 || key === "coorganizer_ids" ? all : all[0];
  }
  return out;
}

// ---- The event desk -------------------------------------------------------------------------

/** Starts an event (a draft with its title), then opens the wizard. */
export async function createEvent(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const organizationId = id(form, "organization_id");
  const asso = text(form, "organization_slug");
  if (!organizationId || !SLUG.test(asso)) return failure("organization_not_found");
  const title = text(form, "title").replace(/\s+/g, " ").slice(0, 120);
  const result = await call("create_event", (s) => s.rpc("create_event", { p_organization_id: organizationId, p_title: title }));
  if (!result.ok) return result.state;
  redirect(routes.manageEvent(asso, String(result.data), "infos"));
}

/**
 * Saves one step of the wizard. The version guards against a teammate's
 * newer save; "continue" goes to the next step once saved.
 */
export async function saveEventStep(_prev: EventActionState, form: FormData): Promise<EventActionState> {
  const eventId = id(form, "event_id");
  const asso = text(form, "organization_slug");
  const step = text(form, "step") as EventStep;
  const version = Number.parseInt(text(form, "version"), 10);
  if (!eventId || !SLUG.test(asso) || !STEPS.includes(step) || !Number.isInteger(version)) return failure("event_not_found");

  const parsed = parseEventStep(step, fieldsOf(form), {
    isBde: text(form, "is_bde") === "1",
    seriesKeys: eventSeries.map((s) => s.slug),
  });
  if (Object.keys(parsed.errors).length > 0) {
    return {
      status: "error",
      code: "event_invalid",
      message: "Certains champs sont à corriger (voir ci-dessous).",
      fieldErrors: parsed.errors,
      at: Date.now(),
    };
  }
  const result = await call("save_event", (s) =>
    s.rpc("save_event", { p_event_id: eventId, p_version: version, p_patch: parsed.patch as never }),
  );
  if (!result.ok) return result.state;
  const saved = result.data as { version: number; promoted: number; notified: number };
  const next = text(form, "next");
  if (NEXT_STEPS.includes(next)) redirect(routes.manageEvent(asso, eventId, next));
  const extra = [
    saved.promoted > 0 ? `${saved.promoted === 1 ? "La première personne" : `Les ${saved.promoted} premières personnes`} de la liste d'attente ${saved.promoted === 1 ? "a" : "ont"} reçu une place.` : null,
    saved.notified > 0 ? `${saved.notified === 1 ? "La personne inscrite est prévenue" : `Les ${saved.notified} personnes inscrites sont prévenues`} du changement.` : null,
    ...parsed.notes,
  ].filter(Boolean);
  return { status: "done", message: ["Enregistré.", ...extra].join(" "), version: saved.version, at: Date.now() };
}

/** Back to the publication step with a confirmation (the form that acted disappears with the change). */
function backToPublication(form: FormData, done: string): void {
  const eventId = id(form, "event_id");
  const asso = text(form, "organization_slug");
  if (eventId && SLUG.test(asso)) redirect(`${routes.manageEvent(asso, eventId, "publication")}&fait=${done}`);
}

export async function publishEvent(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const result = await call("publish_event", (s) => s.rpc("publish_event", { p_event_id: text(form, "event_id") }));
  if (!result.ok) return result.state;
  backToPublication(form, "publie");
  return { status: "done", message: publicationDoneMessage("publie") ?? "", at: Date.now() };
}

export async function unpublishEvent(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const result = await call("unpublish_event", (s) =>
    s.rpc("unpublish_event", { p_event_id: text(form, "event_id"), p_reason: optional(form, "reason") }),
  );
  if (!result.ok) return result.state;
  backToPublication(form, "retire");
  return { status: "done", message: publicationDoneMessage("retire") ?? "", at: Date.now() };
}

export async function cancelEvent(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const result = await call("cancel_event", (s) => s.rpc("cancel_event", { p_event_id: text(form, "event_id"), p_reason: text(form, "reason") }));
  if (!result.ok) return result.state;
  const told = Math.max(0, Number(result.data) || 0);
  backToPublication(form, `annule-${told}`);
  return { status: "done", message: publicationDoneMessage(`annule-${told}`) ?? "", at: Date.now() };
}


/** Deletes an event that was never online, then back to the desk. */
export async function deleteEventDraft(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const eventId = id(form, "event_id");
  const asso = text(form, "organization_slug");
  if (!eventId || !SLUG.test(asso)) return failure("event_not_found");
  const result = await call("delete_event_draft", (s) => s.rpc("delete_event_draft", { p_event_id: eventId }));
  if (!result.ok) return result.state;
  redirect(`${routes.manageEvents(asso)}?fait=supprime`);
}

export async function setEventPin(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const pinned = text(form, "pinned") === "1";
  return run(
    "set_event_pin",
    (s) => s.rpc("set_event_pin", { p_event_id: text(form, "event_id"), p_pinned: pinned }),
    pinned ? "Épinglé en tête des événements de la page de l'asso." : "Désépinglé.",
  );
}

export async function changeEventSlug(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const slug = text(form, "slug").toLowerCase();
  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 100) return failure("slug_invalid");
  return run(
    "change_event_slug",
    (s) => s.rpc("change_event_slug", { p_event_id: text(form, "event_id"), p_slug: slug }),
    "Adresse changée. L'ancienne redirige vers la nouvelle.",
  );
}

/** The team removes a registration (events.attendees.manage), with a reason the student reads. */
export async function removeEventRegistration(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "remove_event_registration",
    (s) => s.rpc("remove_event_registration", { p_registration_id: text(form, "registration_id"), p_reason: text(form, "reason") }),
    "Inscription retirée. La personne est prévenue, avec ta raison ; la place suit la liste d'attente.",
  );
}

// ---- Students ----------------------------------------------------------------------------------

/**
 * Registers (or joins the waiting list): the database decides under the
 * event's lock and says which. A double click returns the same registration.
 */
export async function registerForEvent(_prev: RegistrationActionState, form: FormData): Promise<RegistrationActionState> {
  const eventId = id(form, "event_id");
  if (!eventId) return failure("event_not_found");
  const result = await call("register_for_event", (s) => s.rpc("register_for_event", { p_event_id: eventId }));
  if (!result.ok) return result.state;
  const r = result.data as { status: "confirmed" | "waitlisted"; position: number | null; already: boolean; reference: string };
  const message =
    r.status === "confirmed"
      ? r.already
        ? "Tu étais déjà inscrit·e : ta place est bien là."
        : "C'est fait, tu es inscrit·e !"
      : `Tu es sur la liste d'attente${r.position ? `, ${ordinal(r.position)}` : ""}. Si une place se libère, elle te revient automatiquement : tu seras prévenu·e.`;
  return {
    status: "done",
    message,
    outcome: { status: r.status, position: r.position, already: r.already, reference: r.reference },
    at: Date.now(),
  };
}

export async function cancelMyRegistration(_prev: RegistrationActionState, form: FormData): Promise<RegistrationActionState> {
  const eventId = id(form, "event_id");
  if (!eventId) return failure("event_not_found");
  const result = await call("cancel_my_registration", (s) => s.rpc("cancel_my_registration", { p_event_id: eventId }));
  if (!result.ok) return result.state;
  const r = result.data as { was: "confirmed" | "waitlisted" };
  return {
    status: "done",
    message: r.was === "waitlisted" ? "Tu as quitté la liste d'attente." : "Inscription annulée : ta place revient à quelqu'un d'autre.",
    outcome: { status: "cancelled", position: null, already: false },
    at: Date.now(),
  };
}

export async function setEventBookmark(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const saved = text(form, "saved") === "1";
  return run(
    "set_event_bookmark",
    (s) => s.rpc("set_event_bookmark", { p_event_id: text(form, "event_id"), p_saved: saved }),
    saved ? "Enregistré dans Mes événements." : "Retiré de tes événements enregistrés.",
  );
}

export async function markNotificationsRead(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const ids = form.getAll("id").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  return run(
    "mark_notifications_read",
    (s) => s.rpc("mark_notifications_read", ids.length ? { p_ids: ids } : {}),
    "Messages marqués comme lus.",
  );
}

// ---- BDE: moderation, the front page, the catalog ------------------------------------------------

export async function hideEvent(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "hide_event",
    (s) => s.rpc("hide_event", { p_event_id: text(form, "event_id"), p_reason: text(form, "reason") }),
    "Événement masqué. Il n'est pas annulé : ses inscriptions restent, l'asso voit la raison.",
  );
}

export async function restoreEventVisibility(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "restore_event_visibility",
    (s) => s.rpc("restore_event_visibility", { p_event_id: text(form, "event_id"), p_reason: text(form, "reason") }),
    "Événement rétabli : il revient tel que l'asso l'avait laissé.",
  );
}

export async function setEventProminence(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const prominence = text(form, "prominence") === "featured" ? "featured" : "normal";
  const untilRaw = text(form, "until");
  const until = untilRaw ? endOfParisDay(untilRaw) : null;
  if (untilRaw && !until) return failure("prominence_period");
  return run(
    "set_event_prominence",
    (s) => s.rpc("set_event_prominence", { p_event_id: text(form, "event_id"), p_prominence: prominence, p_until: until ?? undefined }),
    prominence === "featured" ? "Mis à l'affiche de l'agenda et de l'accueil." : "Retiré de l'affiche.",
  );
}

export async function createEventCategory(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const slug = text(form, "slug").toLowerCase();
  if (!SLUG.test(slug) || slug.length > 40) return failure("slug_invalid");
  return run(
    "create_event_category",
    (s) =>
      s.rpc("create_event_category", {
        p_slug: slug,
        p_label: text(form, "label"),
        p_sort_order: Number.parseInt(text(form, "sort_order") || "100", 10) || 100,
      }),
    "Catégorie créée.",
  );
}

export async function updateEventCategory(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "update_event_category",
    (s) =>
      s.rpc("update_event_category", {
        p_category_id: text(form, "category_id"),
        p_label: text(form, "label"),
        p_sort_order: Number.parseInt(text(form, "sort_order") || "100", 10) || 100,
        p_archived: text(form, "archived") === "1",
      }),
    text(form, "archived") === "1" ? "Catégorie retirée (les événements qui l'ont la gardent)." : "Catégorie enregistrée.",
  );
}

// ---- Articles about an event ----------------------------------------------------------------------

export async function setPostEvent(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const eventId = text(form, "event_id");
  return run(
    "set_post_event",
    (s) => s.rpc("set_post_event", { p_post_id: text(form, "post_id"), p_event_id: (UUID.test(eventId) ? eventId : null) as never }),
    UUID.test(eventId) ? "Événement relié : l'article affiche sa date et son état, toujours à jour." : "Événement retiré de l'article.",
  );
}
