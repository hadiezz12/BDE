# Privacy and data protection (Phase 14)

What the site does with personal data, which controls are built and tested,
and what still needs a legal or institutional decision before launch. This
folder is engineering documentation: it is **not** a legal opinion, a
certification or a statement that the site complies with the GDPR. The
controller (still to be confirmed, see `processing-register.md`) and its
advisers decide the legal points; until they do, they are marked **À VALIDER**.

| Document | What it answers |
| --- | --- |
| [data-inventory.md](data-inventory.md) | Every category of personal data: where it is, why, who sees it, how long, how it is deleted, how sensitive |
| [processing-register.md](processing-register.md) | Draft register of processing activities, controller/processor matrix, proposed legal bases (all À VALIDER) |
| [processors-and-transfers.md](processors-and-transfers.md) | Real providers, contract (DPA) status, regions, transfer questions, data-flow map |
| [trackers.md](trackers.md) | Cookies and terminal storage, why there is no consent banner, what would change that |
| [rights-procedure.md](rights-procedure.md) | How a request is filed, verified, decided, executed and closed; deadlines; lost access; erasure; exports |
| [retention-schedule.md](retention-schedule.md) | Each dataset's trigger, current setting, deletion method, holds, backups |
| [security.md](security.md) | Threat model, controls inventory, findings register with severities and status |
| [incident-response.md](incident-response.md) | Personal-data breach runbook: detection, containment, 72-hour assessment, decisions, closure |
| [dpia-screening.md](dpia-screening.md) | Whether an impact assessment (AIPD) is needed, with the reasoning |
| [launch-checklist.md](launch-checklist.md) | Open decisions and launch blockers, prioritized, with who decides |

## The rule in one paragraph

Personal data is read and written only through database functions that
check, at the moment of the call, who is asking and what their current
mandate allows (Phases 4–13). Phase 14 adds the person's own rights: a
self-service download of their data, requests handled by a distinct
**privacy officer** (`platform.privacy.requests`, provisioned by the project
owner, never the BDE offices or the guardian by default) with the one-month
deadline, a coordinated **erasure** across modules and Storage that a backup
restore cannot silently undo, **retention holds** instead of a global "keep
everything" switch, a decision reference for every retention period, a
**breach register** with the 72-hour clock, approved **notice versions**, and
a justification gate for sensitive questions in recruitment forms.

## Status at the end of Phase 14

| Area | Technical control | Tested | Legal / institutional |
| --- | --- | --- | --- |
| Inventory and classification | Written from the code and the schema | Reviewed against the migrations | Controller to confirm |
| Privacy notice | Draft from verified facts; approved versions recorded with text and hash | Unit (no placeholder, validator) + e2e | **Approval pending**; controller identity, contact, DPO, bases, retention, hosting missing |
| Cookies / trackers | Two cookies (session, theme), no third-party request | e2e (no third-party host, no visitor cookie) | Assessment to confirm; no banner needed while nothing optional is added |
| Rights requests | Intake, identity, deadlines, extension, decisions, notes, history, reminders | pgTAP `privacy.test.sql` | Procedure to approve; who the officer is in production |
| Access / portability | Self-service JSON; officer export (14 days, counted downloads), evaluations without names | pgTAP + e2e | Policy on disclosing evaluations to approve |
| Erasure | Plan, confirmation, responsibilities, holds, Storage queue, stub account, ledger, reconciliation | pgTAP (incl. restore simulation) + hosted check (rolled back) | Exceptions policy to approve |
| Retention | Policies with decision note, dry run, confirmation, holds, append-only logs purged only by the job | pgTAP | **Every period undecided**: nothing is deleted automatically yet |
| Recruitment forms | Sensitive-question flag + recorded justification + officer told | pgTAP | Word list and policy to review |
| Breaches | Register, assessment, 72-hour reminders, decisions recorded | pgTAP simulation | Who notifies the CNIL; templates |
| Security | RLS everywhere, no table writes for API roles, definer functions pinned, private buckets, headers, patched Next.js | pgTAP posture block, CI | Penetration test (Phase 15); malware scanning undecided |
| DPIA | Screening written | — | **Controller decides**; recommendation: carry out an AIPD for recruitment |
