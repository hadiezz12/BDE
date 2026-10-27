# Incidents

A small, deliberate workflow: make a serious problem visible, name who handles
it, write what was done. **Centre de contrôle › Continuité › Opérations ›
Incidents** (BDE offices, `platform.operations.monitor`).

1. **Open** it as soon as users are affected: what happens (one line), the
   type, the severity, what people notice. You become the person handling it.
2. **Tell** the people the site names for its type (below). The site does
   not send incident e-mails: use your usual channels.
3. **Update** it with each step: status (open → being analysed → monitoring
   → resolved) and a note. The person who writes an update takes over unless
   the handler stays.
4. **Resolve** it when users are no longer affected; write what fixed it and
   what should change so it does not happen again.

Never put an applicant's name, an application, a CV, a password or a key in
an incident. Describe the effect ("confirmations are delayed"), not the
people.

## Escalation

| Type | Tell |
|---|---|
| Gouvernance (an association) | the association's president, then the BDE |
| Gouvernance (the BDE has no leadership) | the guardian (the site has already told them) |
| Infrastructure, e-mails, automatic jobs | the technical owner (register) |
| Sécurité | the technical owner and the data/security contact (register) |
| Données personnelles | the data/security contact (register) |
| Autre | the BDE office |

Infrastructure access stays with the technical owner: the BDE never gets
provider credentials to "fix it faster".
