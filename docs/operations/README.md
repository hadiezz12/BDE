# Operations

Runbooks for the people who keep the platform running: the institutional
technical owner, the BDE's operations monitors (president and vice-president,
`platform.operations.monitor`), and future developers. The non-technical,
role-by-role guides (in French) are in `docs/guides/`. How continuity works
in the database: `docs/backend/continuity.md`.

| Runbook | When |
|---|---|
| [scheduled-jobs.md](scheduled-jobs.md) | A job is late or failing, the storage cleanup to configure, the external uptime check, schema drift, the security self-check |
| [backups-and-restore.md](backups-and-restore.md) | What is backed up (and what is not), restore tests, recording a verification |
| [disaster-recovery.md](disaster-recovery.md) | Something is down or broken: scenario by scenario |
| [technical-ownership.md](technical-ownership.md) | Who owns which account, handing accounts over, billing, the domain, secret rotation, deployments, failed migrations |
| [retention.md](retention.md) | Deciding how long data is kept, privacy requests, deleting an account that still holds responsibilities |
| [incidents.md](incidents.md) | Opening and following an incident, who to escalate to |

Rules that apply to every runbook:

- Production is changed through reviewed migrations and deployments only.
  Never "fix" production by hand in the SQL editor; never restore a backup
  over production to test it.
- No secret in the site, in the database's tables, in the register, in a
  document or in a chat. Secrets live in the providers' own secret stores
  (Supabase Vault and function secrets, the host's environment variables).
- Nobody shares a password. Every person uses their own account; access is
  granted and removed through each provider's own team management.
