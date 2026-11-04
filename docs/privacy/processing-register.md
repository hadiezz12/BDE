# Draft register of processing activities (art. 30)

**Status: draft.** Every legal basis and every controller cell is a proposal
for the controller and its advisers, marked **À VALIDER**. Nothing here is a
legal conclusion. No institutional name, contact or DPO is invented: missing
facts are listed in `launch-checklist.md`.

## Who decides (controller / processor)

The questions the controller must answer, with what the code makes possible:

| Actor | What it does on the site | Candidate role | To confirm |
| --- | --- | --- | --- |
| The BDE (Very Pink Club) as a legal entity — **form, registration and address unknown** | Runs the platform, decides its purposes and its means (which modules exist, retention periods, who handles requests) | Controller of the platform's processing | Whether the BDE is a registered association (loi 1901), who represents it, whether it is a **joint controller** with each association for recruitment and events |
| Each association | Decides what it asks in its recruitment forms, whom it selects, which events it runs | Possibly **joint controller** (with the BDE) or a separate controller for its own recruitment; not a processor of the BDE as the code stands (associations decide purposes) | The legal status of each association (many are not registered), and an agreement on art. 26 if joint |
| GEM Alpine Business School | **None**: the school does not run, validate or access the site (the site is not an official school site) | Not a controller or processor of the site | Confirm the school has no role; do not present the site as the school's |
| Supabase | Hosts the database, accounts and files | **Processor** | DPA accepted under the account that owns production; region; subprocessors |
| Hosting provider of the site (not chosen) | Serves the site, sees request logs | Processor | Choice, DPA, region |
| E-mail provider (Brevo configured, not live) | Sends transactional e-mails | Processor | DPA, region, subprocessors before enabling `live` |
| The privacy officer | Handles requests and incidents for the controller | A person acting for the controller | Who, appointed how |

The code supports any of these answers: each association's data is scoped to
it, the BDE has no access to associations' private data, and requests are
handled by a role distinct from the BDE offices.

## Activities

| # | Activity | Purpose | Data | Subjects | Proposed basis (À VALIDER) | Recipients | Retention (today) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Student accounts | Sign in, identify the person to their teams | School e-mail, names, optional programme/year/photo, MFA | Students | Art. 6(1)(b) — the service the student signs up for; or (f) legitimate interest of the BDE in running student life | The person; teams; privacy officer | Until erasure (no inactivity rule decided) |
| 2 | Association membership and governance | Run teams, mandates, successions, accountability | Memberships, positions, mandates, delegations, invitations, audit | Members, officers | (b) membership; (f) accountability and continuity; possibly (c) if the BDE's statutes impose records | The association's officers; BDE for continuity | History kept pseudonymously after erasure; periods undecided |
| 3 | Public team pages | Show who runs an association | Name, role, optional photo and bio | Officers | **(a) consent** of each member (already implemented: per-member switch) | Public | Until withdrawn |
| 4 | Events and registrations | Organise events, seats, waiting lists, reminders | Registrations, references, cancellations | Students | (b) the registration the student asks for | The organising association (names only) | Policy undecided |
| 5 | Recruitment applications | Let associations select members | Answers, CVs, documents, snapshot | Candidates | (b) pre-contractual steps at the candidate's request, or (f); **not consent by default** | Association leadership, appointed committee members | Recruitment settings undecided |
| 6 | Recruitment evaluation and decisions | Assess and decide | Scores, notes, interviews, decisions, offers | Candidates; reviewers | (f) legitimate interest of the association in choosing its members, with safeguards (human decision, scoped access, no automatic decision) | Committee within scope | With the application |
| 7 | Notifications and e-mail | Tell people what concerns them | Notifications, deliveries, choices, follows | All users | (b) for service messages; **(a) consent** for optional topics (choices already implemented) | The recipient; e-mail provider | Policies undecided; technical logs 7–30 days |
| 8 | Discovery | Saved items, chosen interests | Saved items, categories | Students | (b) or (a) — chosen by the person, removable | The person only | Until removed |
| 9 | Moderation | Handle reports on public content | Reports, reasons | Reporters | (f) | BDE moderators | Policy undecided |
| 10 | Statistics | Association and BDE figures | Counts only, small groups hidden | — | Aggregates: (f); no personal data leaves the database | Officers with the keys | Kept (no person) |
| 11 | Security and audit | Detect and investigate misuse | Audit log, access log, incident register | Officers, candidates (about) | (f) security; (c) art. 33(5) for breach documentation | Officers with audit keys; privacy officer | Policies undecided (≥ 12 months enforced) |
| 12 | Data-subject requests | Answer rights requests | Requests, history, exports | Requesters | (c) art. 12–22 obligations | Requester, privacy officer | Exports 14 days; requests undecided |
| 13 | Continuity | Mandate reminders, governance health | Mandate dates, issues | Officers | (f) | Officers, guardian (BDE availability only) | Policy undecided |

**Special categories (art. 9) and criminal data (art. 10):** the platform
does not ask for them. Free-text answers and CVs may contain them by the
candidate's choice; forms that ask for related themes need a recorded
justification and the officer is told. Whether any association may ever
collect such data, and on what art. 9(2) ground, is a controller decision —
the default answer should be "no". The VSS / VDH alert form is a
demonstration that sends nothing; wiring it would process highly sensitive
reports and requires its own assessment first (`dpia-screening.md`).

**Automated decisions (art. 22):** none. Scores assist humans; no automatic
ranking, shortlist, rejection or decision exists in the code (Phase 9: every
decision is proposed, approved under the campaign's policy and released by
people, see `docs/backend/recruitment-review.md`).
