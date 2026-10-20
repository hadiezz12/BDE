"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { safeNextPath } from "@/lib/auth/next-path";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { endOfParisDay, startOfParisDay, toDateInput, type DoneCode } from "@/lib/governance/labels";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";

/**
 * Every governance action of the interface. Each one only forwards the form
 * to a database function (supabase/migrations/2026101914*), which checks the
 * caller's rights, MFA level, mandate dates and ceilings, writes in one
 * transaction and records the audit event. Nothing here decides who may do
 * what: the ids in the form are untrusted, and a refused call comes back as
 * a sentence (lib/governance/messages.ts), never as a Postgres error.
 */

export interface GovernanceActionState {
  status: "idle" | "done" | "error";
  message?: string;
  code?: GovernanceErrorCode;
  /** Distinguishes two identical outcomes in a row (the form shows each one). */
  at?: number;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optional = (form: FormData, name: string) => text(form, name) || undefined;
const list = (form: FormData, name: string) => form.getAll(name).map(String).filter(Boolean);

/**
 * After an answer that removes the card it was given from (an invitation, a
 * candidacy, an approval), the confirmation is shown by the page itself:
 * back to where the form was (a same-site path only), with ?fait=<code>.
 */
function redirectDone(form: FormData, fallback: string, code: DoneCode): never {
  const path = (safeNextPath(text(form, "back")) ?? fallback).split(/[?#]/)[0];
  redirect(`${path}?fait=${code}`);
}

function failure(code: GovernanceErrorCode): GovernanceActionState {
  return { status: "error", code, message: governanceErrorMessage(code), at: Date.now() };
}

/** End of the chosen day in Paris; `undefined` for an empty optional field. */
function endDate(form: FormData, name: string): string | null {
  return endOfParisDay(text(form, name));
}

/**
 * Start of the chosen day in Paris. Today (or earlier) means "now": the
 * database then starts the mandate at the moment of the action.
 */
function startDate(form: FormData, name: string): string | undefined | null {
  const value = text(form, name);
  if (!value || value <= toDateInput(new Date())) return undefined;
  return startOfParisDay(value);
}

async function run(
  where: string,
  call: (supabase: Supabase) => PromiseLike<RpcResult>,
  done: string | ((data: unknown) => string),
): Promise<GovernanceActionState> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return failure("not_authenticated");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await call(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return failure(code);
  }
  // Rights may have changed for this person and for others: render fresh.
  revalidatePath("/", "layout");
  return { status: "done", message: typeof done === "function" ? done(data) : done, at: Date.now() };
}

/* ---- Team -------------------------------------------------------------- */

export async function inviteMember(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const positionId = optional(form, "position_id");
  const endsAt = positionId ? endDate(form, "ends_on") : null;
  if (positionId && !endsAt) return failure("invalid_period");
  const email = text(form, "email").toLowerCase();
  return run(
    "invite_member",
    (s) =>
      s.rpc("invite_member", {
        p_organization_id: text(form, "organization_id"),
        p_email: email,
        p_position_id: positionId,
        p_mandate_ends_at: endsAt ?? undefined,
      }),
    `Invitation prête pour ${email}. Elle l'attend dans son espace, rubrique Invitations, pendant 14 jours : préviens-la, aucun mail n'est envoyé.`,
  );
}

export async function revokeInvitation(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "revoke_invitation",
    (s) => s.rpc("revoke_invitation", { p_invitation_id: text(form, "invitation_id") }),
    "Invitation annulée.",
  );
}

export async function respondToInvitation(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const accept = text(form, "accept") === "1";
  const slug = text(form, "organization_slug");
  const result = await run(
    "respond_to_invitation",
    (s) => s.rpc("respond_to_invitation", { p_invitation_id: text(form, "invitation_id"), p_accept: accept }),
    accept ? "Bienvenue dans l'asso." : "Invitation refusée.",
  );
  if (result.status === "done" && accept && /^[a-z0-9-]+$/.test(slug)) redirect(routes.manageHome(slug));
  if (result.status === "done" && !accept) redirectDone(form, routes.accountInvitations, "invitation-refusee");
  return result;
}

export async function assignPosition(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const endsAt = endDate(form, "ends_on");
  const startsAt = startDate(form, "starts_on");
  if (!endsAt || startsAt === null) return failure("invalid_period");
  return run(
    "assign_position",
    (s) =>
      s.rpc("assign_position", {
        p_membership_id: text(form, "membership_id"),
        p_position_id: text(form, "position_id"),
        p_ends_at: endsAt,
        p_starts_at: startsAt,
      }),
    startsAt ? "Poste attribué : il commencera à la date choisie." : "Poste attribué.",
  );
}

export async function endAssignment(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "end_assignment",
    (s) => s.rpc("end_assignment", { p_assignment_id: text(form, "assignment_id"), p_reason: optional(form, "reason") }),
    "Mandat terminé : les droits de ce poste s'arrêtent maintenant.",
  );
}

export async function setMembershipStatus(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const status = text(form, "status");
  const done: Record<string, string> = {
    active: "Membre réactivé·e.",
    suspended: "Membre suspendu·e : plus aucun droit dans l'asso jusqu'à sa réactivation.",
    ended: "Membre retiré·e de l'asso. Ses mandats sont terminés.",
  };
  return run(
    "set_membership_status",
    (s) =>
      s.rpc("set_membership_status", {
        p_membership_id: text(form, "membership_id"),
        p_status: status,
        p_reason: optional(form, "reason"),
      }),
    done[status] ?? "Statut mis à jour.",
  );
}

export async function createDelegation(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const endsAt = endDate(form, "ends_on");
  const startsAt = startDate(form, "starts_on");
  if (!endsAt || startsAt === null) return failure("invalid_period");
  const permissions = list(form, "permissions");
  if (permissions.length === 0) {
    return { status: "error", message: "Choisis au moins un droit à déléguer.", at: Date.now() };
  }
  return run(
    "create_delegation",
    (s) =>
      s.rpc("create_delegation", {
        p_organization_id: text(form, "organization_id"),
        p_delegate_membership_id: text(form, "delegate_membership_id"),
        p_permissions: permissions,
        p_ends_at: endsAt,
        p_reason: text(form, "reason"),
        p_starts_at: startsAt,
      }),
    "Délégation en place. Elle s'arrête seule à la date de fin, ou dès que tu perds ces droits.",
  );
}

export async function revokeDelegation(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "revoke_delegation",
    (s) => s.rpc("revoke_delegation", { p_delegation_id: text(form, "delegation_id"), p_reason: optional(form, "reason") }),
    "Délégation terminée.",
  );
}

/* ---- Positions --------------------------------------------------------- */

export async function createPosition(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const asso = text(form, "organization_slug");
  const result = await run(
    "create_position",
    (s) =>
      s.rpc("create_position", {
        p_organization_id: text(form, "organization_id"),
        p_title: text(form, "title"),
        p_permissions: list(form, "permissions"),
        p_template_key: optional(form, "template_key"),
        p_description: optional(form, "description"),
      }),
    "Poste créé.",
  );
  if (result.status === "done" && /^[a-z0-9-]+$/.test(asso)) redirect(`${routes.manageRoles(asso)}?cree=1`);
  return result;
}

export async function updatePosition(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "update_position",
    (s) =>
      s.rpc("update_position", {
        p_position_id: text(form, "position_id"),
        p_title: text(form, "title"),
        // A protected office keeps its rights: only its title and description change.
        p_permissions: text(form, "permissions_fixed") === "1" ? undefined : list(form, "permissions"),
        p_description: optional(form, "description"),
      }),
    "Poste enregistré : ses droits changent tout de suite pour chaque personne qui l'occupe.",
  );
}

export async function archivePosition(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const asso = text(form, "organization_slug");
  const result = await run(
    "archive_position",
    (s) => s.rpc("archive_position", { p_position_id: text(form, "position_id"), p_reason: text(form, "reason") }),
    "Poste retiré. Les mandats en cours sur ce poste sont terminés.",
  );
  if (result.status === "done" && /^[a-z0-9-]+$/.test(asso)) redirect(routes.manageRoles(asso));
  return result;
}

/* ---- Leadership -------------------------------------------------------- */

export async function proposeAssociationSuccession(
  _prev: GovernanceActionState,
  form: FormData,
): Promise<GovernanceActionState> {
  const endsAt = endDate(form, "ends_on");
  const effective = startDate(form, "effective_on");
  if (!endsAt || effective === null) return failure("invalid_period");
  return run(
    "propose_association_succession",
    (s) =>
      s.rpc("propose_association_succession", {
        p_organization_id: text(form, "organization_id"),
        p_candidate_email: text(form, "candidate_email").toLowerCase(),
        p_mandate_ends_at: endsAt,
        p_effective_at: effective,
      }),
    "Passation proposée. Elle aboutit quand la personne l'accepte depuis son espace.",
  );
}

export async function proposeAssociationAppointment(
  _prev: GovernanceActionState,
  form: FormData,
): Promise<GovernanceActionState> {
  const endsAt = endDate(form, "ends_on");
  if (!endsAt) return failure("invalid_period");
  return run(
    "propose_association_appointment",
    (s) =>
      s.rpc("propose_association_appointment", {
        p_organization_id: text(form, "organization_id"),
        p_candidate_email: text(form, "candidate_email").toLowerCase(),
        p_reason: text(form, "reason"),
        p_mandate_ends_at: endsAt,
      }),
    "Nomination proposée. Elle aboutit quand la personne l'accepte depuis son espace.",
  );
}

export async function proposeBdeSuccession(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const endsAt = endDate(form, "ends_on");
  const effective = startDate(form, "effective_on");
  if (!endsAt || effective === null) return failure("invalid_period");
  return run(
    "propose_bde_succession",
    (s) =>
      s.rpc("propose_bde_succession", {
        p_president_email: text(form, "president_email").toLowerCase(),
        p_vice_president_email: text(form, "vice_president_email").toLowerCase(),
        p_mandate_ends_at: endsAt,
        p_effective_at: effective,
      }),
    "Passation du BDE proposée. Approuve-la ci-dessous ; il faudra aussi l'approbation de l'autre membre de la direction et l'accord des deux personnes.",
  );
}

export async function proposeBdeRecovery(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const endsAt = endDate(form, "ends_on");
  if (!endsAt) return failure("invalid_period");
  return run(
    "propose_bde_recovery",
    (s) =>
      s.rpc("propose_bde_recovery", {
        p_office: text(form, "office"),
        p_candidate_email: text(form, "candidate_email").toLowerCase(),
        p_reason: text(form, "reason"),
        p_mandate_ends_at: endsAt,
      }),
    "Reprise proposée. Elle aboutit quand la personne l'accepte depuis son espace.",
  );
}

export async function respondToCandidacy(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const accept = text(form, "accept") === "1";
  let outcome: DoneCode = "proposition-refusee";
  const result = await run(
    "respond_to_leadership_candidacy",
    (s) => s.rpc("respond_to_leadership_candidacy", { p_transition_id: text(form, "transition_id"), p_accept: accept }),
    (data) => {
      outcome = !accept ? "proposition-refusee" : data === "completed" ? "passation-validee" : "accord-enregistre";
      return "";
    },
  );
  if (result.status === "done") redirectDone(form, routes.accountInvitations, outcome);
  return result;
}

export async function approveBdeSuccession(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  let outcome: DoneCode = "approbation-enregistree";
  const result = await run(
    "approve_bde_succession",
    (s) => s.rpc("approve_bde_succession", { p_transition_id: text(form, "transition_id") }),
    (data) => {
      outcome = data === "completed" ? "passation-bde-validee" : "approbation-enregistree";
      return "";
    },
  );
  if (result.status === "done") redirectDone(form, routes.accountInvitations, outcome);
  return result;
}

export async function withdrawBdeApproval(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "withdraw_bde_approval",
    (s) => s.rpc("withdraw_bde_approval", { p_transition_id: text(form, "transition_id") }),
    "Approbation retirée.",
  );
}

export async function cancelTransition(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "cancel_leadership_transition",
    (s) =>
      s.rpc("cancel_leadership_transition", {
        p_transition_id: text(form, "transition_id"),
        p_reason: optional(form, "reason"),
      }),
    "Passation annulée. Rien n'a changé dans les mandats.",
  );
}

export async function endOfficeMandate(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "end_office_mandate",
    (s) => s.rpc("end_office_mandate", { p_assignment_id: text(form, "assignment_id"), p_reason: text(form, "reason") }),
    "Mandat terminé en urgence. Le poste est vacant : propose une nouvelle personne.",
  );
}

/* ---- Platform ---------------------------------------------------------- */

export async function createOrganization(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const slug = text(form, "slug").toLowerCase();
  const result = await run(
    "create_organization",
    (s) =>
      s.rpc("create_organization", {
        p_name: text(form, "name"),
        p_slug: slug,
        p_category: optional(form, "category"),
        p_accent: optional(form, "accent"),
        p_short_name: optional(form, "short_name"),
        p_tagline: optional(form, "tagline"),
      }),
    "Asso créée, en préparation.",
  );
  if (result.status === "done") redirect(`${routes.managePlatformOrganizations}?cree=${encodeURIComponent(slug)}`);
  return result;
}

export async function setOrganizationStatus(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const status = text(form, "status");
  const done: Record<string, string> = {
    active: "L'asso est active.",
    suspended: "L'asso est suspendue : son équipe garde la lecture, plus aucune modification.",
    archived: "L'asso est archivée.",
  };
  return run(
    "set_organization_status",
    (s) =>
      s.rpc("set_organization_status", {
        p_organization_id: text(form, "organization_id"),
        p_status: status,
        p_reason: optional(form, "reason"),
      }),
    done[status] ?? "Statut mis à jour.",
  );
}
