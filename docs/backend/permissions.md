# Permissions, positions and templates

Source of truth: `supabase/migrations/20261019140902_create_permissions_and_positions.sql`
(`public.permissions`, `public.position_templates`, `public.position_template_permissions`,
`public.positions`, `public.position_permissions`, `public.platform_role_permissions`). The
catalog changes only by migration; nobody edits it from the site.

## Vocabulary

- **Permission (key)**: one capability, e.g. `members.invite`. Organization keys are always scoped
  to one organization; platform keys (`platform.*`) apply to the whole site.
- **Position**: a post inside one organization, with a free **title** (display only, never checked)
  and a set of organization keys. "Présidente", "Prez", "Head of Comms" are titles; what a holder
  can do is only the keys ticked on the position.
- **Office**: the three protected positions (`association_president`, `bde_president`,
  `bde_vice_president`). Their keys are fixed by migration and they change hands only through a
  leadership transition ([leadership-transitions.md](leadership-transitions.md)).
- **Template**: a starting bundle of keys for a new position. Rights are **copied once** at
  creation; editing or removing a template never rewrites existing positions (brief §52).
- **Live positions**: a holder's rights are the position's keys **now**. Editing a position changes
  them for every holder at once, and the change is audited (`position_updated` with added/removed
  keys). There is no per-holder snapshot.

## Flags

| Flag | Meaning |
| --- | --- |
| `is_grantable` | May be put on an ordinary position. False for `governance.succession` (offices only) and every platform key. |
| `is_delegable` | May be lent by delegation. Implies grantable. |
| `is_sensitive` | Personal data: never delegable, never implied by another key. |
| `module_ready` | The feature behind the key exists. False = the key can be held now and works when its module ships. |

Database guards: an ordinary position may only carry grantable organization keys
(`private.guard_position_permission`); a delegation may only carry delegable keys
(`private.guard_delegation_permission`).

## Organization keys

| Key | Category | Grantable | Delegable | Sensitive | Module ready |
| --- | --- | --- | --- | --- | --- |
| `members.view` | team | ✓ | ✓ | | ✓ |
| `members.invite` | team | ✓ | ✓ | | ✓ |
| `members.manage` (suspend, reactivate, remove) | team | ✓ | | | ✓ |
| `positions.manage` (create, edit, retire positions) | roles | ✓ | | | ✓ |
| `positions.assign` (give or end an ordinary position) | roles | ✓ | | | ✓ |
| `delegations.manage` (lend one's own keys) | roles | ✓ | | | ✓ |
| `governance.view` | governance | ✓ | ✓ | | ✓ |
| `audit.view` | governance | ✓ | ✓ | | ✓ |
| `governance.succession` (propose one's successor) | governance | | | | ✓ |
| `organization.settings.update` | settings | ✓ | ✓ | | Phase 5 |
| `posts.create`, `posts.edit`, `posts.publish` | content | ✓ | ✓ | | later |
| `events.create`, `events.edit`, `events.publish` | events | ✓ | ✓ | | later |
| `media.manage` | media | ✓ | ✓ | | later |
| `recruitment.campaigns.manage`, `recruitment.questions.manage` | recruitment | ✓ | ✓ | | later |
| `recruitment.applications.view`, `.review`, `.export` | recruitment | ✓ | | ✓ | later |
| `analytics.view` | insights | ✓ | ✓ | | later |

Keys that hand out power (`members.manage`, `positions.*`, `delegations.manage`) are not delegable:
lending them would let a borrower hand out rights the lender's position does not cover.

## Platform keys

| Key | Held by |
| --- | --- |
| `platform.governance.view` | BDE president, BDE vice-president, guardian |
| `platform.organizations.manage` (create, publish, suspend, archive) | BDE president, BDE vice-president |
| `platform.associations.intervene` (appoint or end an association presidency in an emergency) | BDE president, BDE vice-president |
| `platform.bde.succession` | BDE president, BDE vice-president |
| `platform.audit.view` | BDE president, BDE vice-president |
| `platform.content.moderate` (later phase) | BDE president, BDE vice-president |
| `platform.recovery` (restore a vacant BDE office, end a compromised one) | guardian only |

The two BDE offices also carry every organization key **of the BDE organization itself**, so they
run the BDE's own team like any president. They get no key inside another association.

## Templates

| Template | Keys |
| --- | --- |
| Présidence (office) | every organization key, including `governance.succession` |
| Présidence / Vice-présidence du BDE (offices) | every organization key except `governance.succession`, plus the BDE platform keys above |
| Vice-présidence | members.view, members.invite, positions.assign, governance.view, audit.view, organization.settings.update, posts.*, events.*, media.manage, recruitment.campaigns.manage, recruitment.questions.manage, analytics.view |
| Communication | members.view, posts.*, media.manage |
| Événements | members.view, events.*, media.manage |
| Responsable recrutement | members.view, recruitment.* (including the three sensitive application keys) |
| Évaluation des candidatures | recruitment.applications.view, recruitment.applications.review |
| Trésorerie | members.view, analytics.view |
| Membre | none |
| Sur mesure | none, chosen one by one |

The editor offers every template except the offices.

## Ceilings (no self-promotion, brief §20–21)

Whoever creates, edits, assigns or lends may only touch keys they hold **through a position**
(`private.require_ceiling`), never through a delegation:

- creating a position: every key on it;
- editing a position: every key added **or removed** (you cannot strip a key you do not hold
  either; the editor greys it and keeps it);
- assigning a position or inviting with one: every key of that position;
- delegating: every lent key, which must also be delegable.

Nobody can assign themselves a position (`self_assignment`) or delegate to themselves. Offices are
refused by the ordinary functions (`position_protected`).

## Multiple positions

A member may hold several positions at once (Lucas in the seed: Communication + Événements); their
rights are the union. The same position cannot be held twice by the same member over overlapping
dates (`position_assignments_no_double_holding`, an exclusion constraint).
