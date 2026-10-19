# Governance: organizations, mandates, delegations, invitations, recovery

How the platform stays run by the right people after its creator leaves. Read
[authorization.md](authorization.md) first for how a right is evaluated.

## Organizations

`public.organizations`: one row per association, plus exactly one BDE (`kind = 'bde'`, slug
`very-pink-club`, created by migration).

- **The BDE row is protected**: always `active` (check), cannot be deleted (trigger
  `forbid_bde_deletion`), its kind cannot change (`guard_organization_identity`), there is only one
  (`organizations_single_bde_idx`).
- **Slug** (`/associations/<slug>`, `/manage/<slug>`): lowercase words and dashes; `plateforme` and
  `continuite` are reserved for fixed workspace routes (`organizations_slug_reserved_check`).
- **Lifecycle** (`public.set_organization_status`, BDE leadership, aal2, reason required except to
  activate):

  | From | To | Effect |
  | --- | --- | --- |
  | `setup` (created) | `active`, `archived` | `setup`: invisible to the public, its team works normally |
  | `active` | `suspended`, `archived` | `suspended`: team keeps `members.view`, `governance.view`, `audit.view`, nothing else; pending invitations revoked |
  | `suspended` | `active`, `archived` | |
  | `archived` | `active` | `archived`: read-only like suspended, public page kept; open transitions cancelled |

  Nothing is ever deleted: history stays attached to the organization.
- **Creation** (`public.create_organization`, BDE leadership, aal2): status `setup`, the presidency
  office position created empty. The next step is naming a president (an appointment, below).

## Memberships

`public.memberships`: a person in an organization. One **open** membership (`active` or
`suspended`) per person and organization; `ended` ones stay as history. A membership gives no key by
itself: keys come from positions and delegations.

- **Join**: only by accepting an invitation, or automatically when accepting a presidency.
- **Suspend / reactivate** (`members.manage`, reason required to suspend): a suspended member has no
  key at all, but keeps their mandates for when they are reactivated.
- **Remove** (`members.manage`) or **leave** (the member themselves): mandates end now (future ones
  are cancelled), delegations to and from them are revoked.
- **The presidency is protected**: someone holding an office cannot be suspended, removed or leave
  (`office_holder`) until a transition hands the office over, or an emergency end (below).

## Mandates (position assignments)

`public.position_assignments`: a person holds a position from `starts_at` to `ends_at`.

- Every mandate has an end: at most 25 months for an ordinary position, 13 months for an office.
  The interface suggests the next 31 August (end of the academic year).
- **Expiry is evaluation, not a job**: a right exists while `starts_at <= now() < ends_at`. Nothing
  needs to run for a mandate to stop (brief §25). Statuses `ended`/`cancelled` record early ends.
- **No extension, no reopening** (`guard_position_assignment`): a mandate's dates and holder are
  immutable once written, except ending it early. A new mandate is a new row.
- **No overlap** (exclusion constraints on `tstzrange(starts_at, ends_at)`): the same member cannot
  hold the same position twice at once; an office has one holder at any instant; the BDE
  president and vice-president are always two different people.
- **End early**: `public.end_assignment` (ordinary positions, `positions.assign`); offices only by a
  transition or an emergency end (`public.end_office_mandate`). A mandate not started yet is
  `cancelled` instead.

## Delegations

`public.delegations` + `public.delegation_permissions`: a member lends some of their keys to another
member of the same organization (`public.create_delegation`, `delegations.manage`, aal2).

- At most 92 days, a written reason, never to oneself, delegable keys only, and only keys the lender
  holds **through a position** (no chains).
- It stops by itself at its end date, and silently stops working as soon as the lender no longer
  holds a lent key (each check re-verifies the lender). The team page flags such a delegation
  "Sans effet".
- Revoked early by the lender, the borrower, or anyone with `delegations.manage` here.

## Invitations

`public.organization_invitations`: bound to an **e-mail address**, valid 14 days, one pending per
address and organization.

- Sent with `members.invite`; offering a position also needs `positions.assign`, the ceiling on that
  position's keys, a mandate end, and aal2.
- Only an address that has an account, or could create one (an allowed school domain), can be
  invited (`user_not_eligible`): an invitation never opens the platform to anyone else.
- The invitee answers in **Mon espace › Invitations** (`public.respond_to_invitation`). Accepting
  re-checks, at that moment, that the inviter may still invite and still give that position (its
  keys within their own); otherwise the invitation is refused as no longer valid
  (`invitation_invalid`) and a new one must be sent.
- **No e-mail is sent in Phase 4** (the generalized notification engine is a later phase; Supabase's
  mailer only sends sign-in codes). The inviter is told to warn the person; the inbox is the reliable
  place, and nothing security-critical depends on an e-mail arriving (brief §70).

## The continuity guardian ("School Responsible")

The brief's **School Responsible** is called **Garant·e de continuité** in the interface: the site is
not validated by the school, so the role must not suggest an official school position. It is a
platform role (`public.platform_assignments`, `role = 'guardian'`), held by one person at a time,
for at most 5 years, never by a BDE officeholder.

What it can do (`platform.governance.view`, `platform.recovery`):

- see the platform's governance (BDE leadership, associations without a president, transitions,
  expiring offices, integrity checks, leadership/recovery history);
- approve a BDE succession **when one BDE office is vacant** (the missing second approval);
- propose a **recovery** for a vacant BDE office (`public.propose_bde_recovery`, aal2, reason);
- end a compromised BDE mandate (`public.end_office_mandate`, aal2, reason).

What it cannot do: anything inside an association, read recruitment data, create or suspend
associations, or appoint itself.

**Provisioning and replacement happen outside the site**, by the project owner, as the database
owner, after a written decision (for example by the BDE's assembly):

```sql
-- Supabase dashboard › SQL editor (runs as postgres). Find the person's account id first:
select id, email from auth.users where email = '<address of the new guardian>';
select private.provision_guardian('<user id>', now() + interval '3 years',
                                  'Décision du <date> : <who decided and why>');
```

It ends the previous guardian's assignment in the same transaction and is audited
(`guardian_provisioned`). No API role can execute it.

## Bootstrap (first BDE leadership)

The very first BDE president and vice-president cannot be appointed by anyone through the site.
`private.bootstrap_governance` does it once, as the database owner:

```sql
-- After the three people have each signed in once (so their accounts exist):
select id, email from auth.users where email in ('<president>', '<vice-president>', '<guardian>');
select private.bootstrap_governance(
  '<president user id>', '<vice-president user id>', '<guardian user id or null>',
  '<mandate end, e.g. 2027-08-31 23:59+02>', '<guardian end, e.g. 2029-08-31 23:59+02>',
  'Mise en place initiale : <who decided, when>');
```

- Refuses once any BDE office or guardian assignment ever existed (`bootstrap_already_done`), but
  returns `already_bootstrapped` when called again with the same people (safe to re-run).
- The president and vice-president must be different people, mandates at most 13 months; the
  guardian must not be one of them.
- Audited as `governance_bootstrapped`. From then on, everything happens through the site.

**Development project** (`verypinkclub-dev`): bootstrapped on 2026-10-19 with fictional accounts only
(`president-bde@`, `vp-bde@`, `garant@comptes.example.test`) plus one fictional association
"Asso test (exemple)". **Production**: not bootstrapped; it waits for the real people (see the
launch checklist in [environments.md](environments.md)).

## When someone disappears: the recovery matrix

| Situation | Who acts | How |
| --- | --- | --- |
| An association president leaves normally | that president | proposes a successor ([leadership-transitions.md](leadership-transitions.md)) |
| An association has no president (mandate ended, person gone) | BDE leadership | appoints a president (association appointment) |
| An association president's account is compromised or they refuse to hand over | BDE leadership | ends the presidency (emergency end, reason), then appoints |
| One BDE officer is gone, the other is there | the remaining officer + guardian | BDE succession: the guardian gives the missing approval |
| One or both BDE offices vacant | guardian | recovery, one office at a time |
| A BDE officer's account is compromised | guardian | ends that mandate (emergency end), then recovery |
| No guardian, or the guardian is gone too | project owner (database) | `private.provision_guardian` after a written decision, then the new guardian uses the site |
| Nobody can be reached | project owner | same; never edit tables by hand |

Every row of this table is covered by pgTAP (governance.test.sql) except the last two, which are SQL
procedures run by the owner.

## Audit

`public.governance_audit_events` records every governance action: actor, the authority used
(`position`, `delegation`, `bde`, `guardian`, `provisioning`, `self`), action, category,
organization, subject, resource, details (no personal data beyond names and ids) and the written
reason when one was required.

- **Append-only**: written only by `private.log_governance_event`, inside the same transaction as
  the change it describes; triggers refuse UPDATE, DELETE and TRUNCATE for everyone, and no API role
  has write grants.
- **Who reads it**: an organization's history with `audit.view` there; the whole platform for BDE
  leadership; leadership, recovery, bootstrap and organization events for the guardian; and
  everyone sees the events where they are the actor or the subject.
- **Limits, stated honestly**: this is not a cryptographic ledger. The database owner (the project
  owner, or Supabase staff) could still alter rows by disabling triggers. Protection against that is
  organizational: few owners, MFA on the Supabase account, backups/point-in-time recovery on the paid
  plan ([environments.md](environments.md)). Recruitment applications never appear in it.

## Health checks

`public.governance_overview()` (BDE leadership, guardian) computes on each call: associations
without a president, open transitions, offices ending within 45 days without a planned successor,
mandates of members who are no longer active, delegations that lapsed in the last 30 days, and
overlapping office mandates (impossible by construction; checked anyway). Authorization never
depends on these checks; reminders and scheduled monitoring belong to a later phase.
