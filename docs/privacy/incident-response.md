# Personal-data breach: runbook

A breach is any security incident that leads to the accidental or unlawful
destruction, loss, alteration, unauthorised disclosure of, or access to,
personal data (art. 4(12)). The site records the facts and the decisions;
**it never notifies the CNIL or the people concerned itself**, and nobody
publishes anything about an incident before the controller decides.

Where it lives: **Données personnelles › Incidents de données**
(`/manage/donnees`, the privacy officer) for the assessment; the operational
side stays in **Centre de contrôle › Continuité › Opérations** (BDE,
`docs/operations/incidents.md`).

## 1. Detect and record (hour 0)

- Anyone who suspects a breach tells the technical owner and the privacy
  officer (BDE offices for an operational problem). Do not investigate by
  copying data around.
- The officer opens the incident (**Ouvrir un incident de données**) with
  the moment the controller became **aware** of it: the 72-hour clock starts
  there (art. 33(1)). Describe the facts, never the exposed data itself;
  the site refuses secret-looking text.

## 2. Contain (as fast as possible)

| Situation | First action | Who |
| --- | --- | --- |
| A compromised officer account | Revoke the position or the committee seat (Gouvernance / Comité); sign the account out everywhere; ask the person to reset their second factor | Association president / BDE; technical owner for sessions |
| A CV or document reachable by the wrong person | Remove the file or the application; check `application_access_log` for who opened it | Association / privacy officer |
| A leaked secret (database URL, secret key, Vault token, Brevo key) | Rotate it in Supabase / the provider, redeploy what uses it | Technical owner (`docs/operations/technical-ownership.md`) |
| A dump or export outside where it belongs | Get it deleted, note who had it | Technical owner |

Preserve evidence: note times, accounts, request ids; keep logs; do not
delete the audit trail.

## 3. Assess (before hour 72)

**Évaluer et décider** records: personal data or not, categories,
estimated number of people, confidentiality / integrity / availability,
risk (unlikely, risk, high). Guidance: CNIL, *Notifier une violation de
données personnelles*.

- **Risk to people** → notification to the CNIL within 72 hours of
  awareness, by the controller, through the CNIL's online service; later
  information may be added in phases.
- **Unlikely to result in a risk** → no notification, but the incident and
  the reasoning stay documented (art. 33(5)): the register is that record.
- **High risk** → the people concerned are also informed without undue
  delay (art. 34), in clear words: what happened, likely consequences,
  measures taken, a contact.

Every decision needs its written reason. The hourly `privacy-housekeeping`
job reminds the officer and the BDE operations every hour while the
decision is pending.

## 4. Notify (the controller)

The site gives the dates to record (`Notifiée le`, `Informées le`); the
controller sends. Template for the people concerned (adapt, approve):

> Objet : Information sur un incident concernant tes données
> Le [date], [ce qui s'est passé, en une phrase]. Les données concernées sont
> [catégories]. [Conséquences possibles]. Nous avons [mesures prises]. Tu peux
> [ce que la personne peut faire]. Pour toute question : [contact du
> responsable]. Tu peux aussi saisir la CNIL (www.cnil.fr).

## 5. Close

Resolve the incident in Opérations once contained and decided; add the
lessons learnt (what to change, who, by when) as an update. A simulated
incident is in `privacy.test.sql` §7 (opened 70 hours after awareness,
reminders sent to the officer and the BDE, never the guardian, decision
recorded with its reason).

## Escalation

| Event | To |
| --- | --- |
| Compromised association officer | Association president → BDE office if the president is the one compromised |
| CV or application exposure | Privacy officer (+ the association) |
| Production credential leak | Technical owner |
| Any possible personal-data breach | Privacy officer → controller (and DPO if one is appointed) |

The guardian is not an investigator: their role stays BDE availability and
recovery.
