# Authorization (Phase 4)

**Authentication** says who you are (Phase 3, [authentication.md](authentication.md)).
**Authorization** says what you may do, here, right now. They never mix: signing in grants nothing,
and no title, e-mail address, profile column or user metadata ever grants a right.

This page is the map. Details live in:

| Document | What it covers |
| --- | --- |
| [permissions.md](permissions.md) | The permission catalog, position templates, ceilings, delegable and sensitive keys |
| [governance.md](governance.md) | Organizations, memberships, mandates, delegations, invitations, the guardian, bootstrap, recovery, audit |
| [leadership-transitions.md](leadership-transitions.md) | Association succession and appointment, BDE dual-approval succession, guardian recovery |
| [rls-policies.md](rls-policies.md) | Every table's policies and grants, the private helpers, the RPC surface |

## The chain

```text
identity (auth.users)            → who
  └─ membership (open)           → belongs to this organization (active or suspended)
       └─ position assignment    → holds this position from starts_at to ends_at (a mandate)
            └─ position          → a title (display only) + a set of permission keys
                 └─ permission   → one key, scoped to this organization
  └─ delegation (optional)       → keys lent by a member who holds them through a position
organization status              → setup/active: full; suspended/archived: read-only keys only
```

A person has key `K` in organization `O` at instant `t` when **all** of these hold
(`private.user_has_organization_permission(user, O, K, t)`):

1. `O`'s status allows `K` (`private.organization_status_allows`): every key while `setup` or
   `active`; only `members.view`, `governance.view` and `audit.view` while `suspended` or `archived`.
2. Either a **position** grants it (`private.position_grants`): an `active` assignment with
   `starts_at <= t < ends_at`, an `active` membership, a non-archived position carrying `K`;
3. or a **delegation** does: an `active` delegation to them with `starts_at <= t < ends_at`, their
   membership `active`, `K` delegable, and the delegator **still** holding `K` through a position
   at `t` (a delegation never outlives its source).

Platform keys (`platform.*`) come only from the two BDE offices (president, vice-president) or the
guardian's platform assignment (`private.user_has_platform_permission`).

Everything is evaluated **at request time** from rows and `now()`: an expired mandate, a revoked
delegation, a suspended membership or a suspended organization stop working on the next request,
with no job, no cache and no sign-out (brief §25, §80). The JWT carries no role.

## Default deny

- No row, no right. A new student has an identity and nothing else.
- Tables are readable only through row level security; nobody (not even `authenticated`) has
  INSERT/UPDATE/DELETE on any governance table. Every write goes through a `security definer`
  function in `public` that checks the caller's rights itself, then writes in one transaction and
  records an audit event ([rls-policies.md](rls-policies.md#the-rpc-surface)).
- Cross-organization access does not exist: holding a key in Finance says nothing about Sports. BDE
  leadership gets **platform** keys (create/suspend associations, name or remove a president in an
  emergency, see governance) but no key inside an association's own space (§64).

## Second factor (aal2)

`private.require_aal2()` refuses with `mfa_required` unless the session's JWT says `aal2`. It guards
every action that hands out power or changes leadership: creating or editing positions, assigning a
position (with rights), inviting with a position, delegating, every leadership transition step
(propose, accept, approve), emergency ends, organization creation and status. Plain reads,
invitations without a position, accepting an invitation, revoking things and ending ordinary
mandates do not need it. Phase 3's rule still applies: someone who enrolled a factor sees nothing at
aal1 (`private.mfa_requirement_met()`, restrictive policies).

## How the application uses it

- `public.my_access()` returns, for the caller, the platform keys and every open membership with
  its current keys and positions. `src/lib/governance/access.ts` (`getMyAccess`, memoised per
  request only) feeds the workspace navigation, the account menu and the chooser.
- Read screens call read functions that check their own rights: `organization_team`,
  `member_access` (the permission inspector, with `private.explain_permission`'s reason for each
  key), `organization_governance`, `governance_overview`, `platform_organizations`,
  `my_governance_inbox`, `governance_history` (`src/lib/governance/queries.ts`).
- Actions are Server Actions in `src/app/actions/governance.ts` that only forward the form to one
  database function. The ids in the form are untrusted; the database decides. A refusal comes back
  as a code, turned into a French sentence by `src/lib/governance/messages.ts` (unit-tested against
  the migrations: every raised code has a sentence).
- Hiding a button is comfort, never protection (§15). The e2e test
  `e2e/governance.spec.ts` submits a form whose right was revoked meanwhile and checks the refusal.

## Adding a module in a later phase (how Phase 5+ plugs in)

1. The keys already exist in `public.permissions` with `module_ready = false`. Flip it with a
   migration when the module ships (the interface then drops the "à venir" marks).
2. RLS on the module's tables uses the same helpers, e.g.
   `using (organization_id in (select private.my_organization_ids_with('posts.edit')))` for reads,
   or a `security definer` function that calls `private.require_organization_permission(...)`.
3. Sensitive data (recruitment applications, CVs) uses the explicit `recruitment.applications.*`
   keys, which are never delegable and never implied by another key; do not grant them through
   `members.view` or any platform key. A campaign- or position-level narrowing can be added as an
   extra condition in those policies without changing the model.
4. Add the module's section to `src/components/manage/sections.ts` (`requires`, drop `soon`).
5. Add pgTAP cases (allowed, denied, other organization, expired mandate, suspended organization).

## Tests

- `supabase/tests/database/governance.test.sql` — 163 pgTAP checks: isolation between
  organizations, no self-promotion, ceilings, protected offices, overlapping mandates, expiry,
  delegations losing their source, suspended organizations and memberships, invitations bound to an
  e-mail, every transition kind, dual approval, recovery, concurrency guards, audit immutability,
  grants and function privileges.
- `supabase/tests/database/foundation.test.sql` — the allowlist of private helpers `authenticated`
  may execute.
- `src/lib/governance/governance.test.mjs` — refusal sentences and dates.
- `e2e/governance.spec.ts` — navigation by rights, invitation acceptance, revocation without
  sign-out, a presidency handed over with the successor's second factor.
