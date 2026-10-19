# Row level security, grants and the RPC surface (Phase 4)

Every table in `public` has RLS enabled in the migration that creates it. The governance tables are
**read-only for the API roles**: `authenticated` has SELECT (filtered by the policies below) and no
INSERT, UPDATE or DELETE on any of them; `anon` reads only public organization columns. All writes go
through `security definer` functions (last section). Phase 3's profile and avatar policies are
unchanged.

Helpers used by the policies (all in `private`, `security definer`, `search_path = ''`, answering
about the **caller** only, wrapped in `(select …)` so Postgres evaluates them once per statement):

| Helper | Returns |
| --- | --- |
| `private.mfa_requirement_met()` (Phase 3) | false when the caller enrolled a factor but the session is aal1 |
| `private.has_organization_permission(org, key)` | the caller holds `key` in `org` now |
| `private.has_platform_permission(key)` | the caller holds the platform key now |
| `private.my_organization_ids_with(key)` | organizations where the caller holds `key` now |
| `private.my_open_organization_ids()` | organizations where the caller has an open membership |
| `private.my_transition_ids()` | transitions where the caller is the proposer, a candidate or an approver |
| `private.current_user_email()` | the caller's e-mail (for invitations bound to an address) |

These seven are the only private functions `authenticated` may execute (checked by
`foundation.test.sql`); every other private function is revoked from `public`, `anon`,
`authenticated` and `service_role`.

## Policies by table

| Table | Who reads what |
| --- | --- |
| `organizations` | everyone (`anon` too): `active` and `archived` rows, public columns only (column grants; `created_by`, `status_reason` never granted); members: their own organizations whatever the status; platform governance (BDE leadership, guardian): all. Restrictive: an enrolled-MFA aal1 session sees only active/archived ones. |
| `memberships` | your own; the whole team of organizations where you have `members.view`. |
| `permissions`, `position_templates`, `position_template_permissions`, `platform_role_permissions` | every signed-in person (the catalog is not secret). |
| `positions`, `position_permissions` | members of the organization; platform governance. |
| `position_assignments` | your own mandates; the team's where you have `members.view`; **office** mandates of every organization for platform governance. |
| `platform_assignments` | your own; platform governance. |
| `delegations`, `delegation_permissions` | the lender and the borrower; the team where you have `members.view`. |
| `organization_invitations` | the invitee (by e-mail); the team where you have `members.invite`. |
| `leadership_transitions` (+ candidates, approvals) | the parties; organizations where you have `governance.view`; platform governance. |
| `governance_audit_events` | organizations where you have `audit.view`; all for `platform.audit.view`; leadership, recovery, bootstrap and organization events for the guardian (`platform.recovery`); events where you are the actor or the subject. |

Every governance table except the catalog also has a **restrictive** policy
`<table>_require_mfa_when_enrolled` (`private.mfa_requirement_met()`): a half-finished sign-in reads
nothing, as in Phase 3.

Several permissive SELECT policies per table (own / team / platform) are kept on purpose: each says
one rule in one line, which is easier to review than one long `or`. The Supabase advisor's "multiple
permissive policies" performance warning is accepted for that reason (decision D22); the volumes
here are small (a few hundred associations, a few thousand memberships).

## Grants

- `anon`: SELECT on the public columns of `organizations`; nothing else; no function.
- `authenticated`: SELECT on the governance tables (through the policies); EXECUTE on the seven
  private helpers above and on the `public` governance functions; no table writes.
- `service_role`: nothing new. No server code uses the secret key for governance; there is no
  admin bypass in the application.
- `postgres` (the project owner, SQL editor only): `private.bootstrap_governance`,
  `private.provision_guardian`.

## The RPC surface

Each function below is `security definer` with `search_path = ''`, executable by `authenticated`
only, and starts by identifying the caller (`private.require_actor`, which also enforces
`mfa_requirement_met`). It then checks the caller's right in the target organization (never a
client-supplied flag), the second factor where needed, the ceiling, dates and states; writes in
one transaction; and calls `private.log_governance_event`.

| Function | Right checked | aal2 |
| --- | --- | --- |
| `create_organization` | `platform.organizations.manage` | ✓ |
| `set_organization_status` | `platform.organizations.manage` | ✓ |
| `create_position`, `update_position`, `archive_position` | `positions.manage` + ceiling | ✓ |
| `assign_position` | `positions.assign` + ceiling | ✓ (when the position carries keys) |
| `end_assignment` | `positions.assign` (ordinary positions only) | |
| `set_membership_status` | `members.manage` (or yourself, to leave) | |
| `invite_member` | `members.invite` (+ `positions.assign` and ceiling with a position) | ✓ (with a position) |
| `revoke_invitation` | `members.invite` | |
| `respond_to_invitation` | the invitee's e-mail; the inviter's rights re-checked | |
| `create_delegation` | `delegations.manage` + the lender's own position keys | ✓ |
| `revoke_delegation` | lender, borrower or `delegations.manage` | |
| `propose_association_succession` | sitting president + `governance.succession` | ✓ |
| `propose_association_appointment` | `platform.associations.intervene` + reason | ✓ |
| `propose_bde_succession` | sitting BDE president or vice-president | ✓ |
| `propose_bde_recovery` | `platform.recovery` + reason, vacant office only | ✓ |
| `respond_to_leadership_candidacy` | the candidate | ✓ |
| `approve_bde_succession` | sitting BDE officer, or the guardian for a vacant office | ✓ |
| `withdraw_bde_approval`, `cancel_leadership_transition` | the approver; the proposer, BDE or guardian per kind | |
| `end_office_mandate` | association office: `platform.associations.intervene`; BDE office: guardian; + reason | ✓ |
| `my_access`, `organization_team`, `member_access`, `organization_governance`, `governance_overview`, `platform_organizations`, `my_governance_inbox`, `governance_history` | read functions; each checks its own right and returns only what the caller may see | |

Errors are raised as SQLSTATE `P0001` with a short code as message (`insufficient_permission`,
`permission_ceiling`, `mfa_required`, `office_occupied`…); the interface maps each code to a French
sentence (`src/lib/governance/messages.ts`) and never shows Postgres text.

The Supabase security advisor lists each of these as "authenticated can execute a SECURITY DEFINER
function". That is the intended API (decision D21): every one checks authority itself, and the
pgTAP suite calls each as unauthorized users to prove the refusal.

## Performance (brief §61)

- Policies call the helpers through `(select …)` subqueries (initPlan, once per statement).
- The helpers hit composite indexes: assignments by `(user_id, organization_id)`, memberships by
  user and by the one-open-membership unique index, delegations by
  `(delegate_user_id, organization_id)`, the audit log by `(organization_id, occurred_at)` and
  `(category, occurred_at)`; the exclusion constraints' GiST indexes serve the period checks; every
  foreign key is covered (`20261019141733_index_governance_foreign_keys.sql`).
- Lists are built server-side in one function call per screen (no per-row policy round trips from
  the client).
