# Disaster recovery

Scenario by scenario: how it shows, who acts, what to do first, how to
recover, how to check, and the limits. Open an incident in **Continuité ›
Opérations › Incidents** for anything users notice, and write what you do in
its updates.

| Scenario | Detected by | Responsible | Contain | Recover | Verify | Limits |
|---|---|---|---|---|---|---|
| **Database unavailable** | `/api/health` 503 (`database:false`), uptime alert, pages failing | Technical owner | Nothing to stop: the site shows errors, no data is written | Supabase status page and support; if the project is lost, restore into a new project (`backups-and-restore.md`) and point the site's environment to it | `/api/health` 200, sign-in, a public page, the operations page | Data since the last backup is lost on a restore |
| **Accidental schema change** (by hand in production) | Operations › Contrôle de sécurité, schema drift line, failing pages | Technical owner | Stop further manual changes | Write a migration that puts back the intended state, review it, apply it; never "re-apply" an old file over it | `supabase test db` green on a copy, the security self-check all OK | — |
| **Failed migration** | Deployment or CI failure, `apply` error | Whoever deployed | Do not retry blindly; the failed migration was rolled back (transactional) | Fix forward with a new migration; never edit a migration already applied anywhere | Migration list equal in code and database, tests green | A partially applied non-transactional step (rare: extensions) needs a manual review |
| **Missing Storage objects** | Broken images, documents failing to download | Technical owner | — | Copy back from the Storage copy; database rows still point to the same paths | Open the files in the site | Only what was in the last copy |
| **Hosting outage** | Uptime alert, host status page | Technical owner | — | Wait for the host, or redeploy the same commit on another project of the host | `/api/health` 200 | DNS changes take time to propagate |
| **Domain or DNS failure** | Site unreachable by name, certificate errors | Domain owner (register line *Nom de domaine*) | — | Renew the domain, fix the records at the registrar/DNS host | Site reachable, HTTPS valid | A lapsed domain can be lost: the renewal reminder exists for this |
| **E-mail provider failure** | Communication page alerts (`worker_silent`, `high_failure`), failed deliveries | Technical owner | Nothing is lost: e-mails wait in the queue, notifications still reach the site | Fix the provider account or key (function secret `BREVO_API_KEY`); retry failed deliveries from the communication page | Accepted deliveries rise again | Very old queued e-mails may be pointless: decide case by case |
| **Compromised administrator account** | Unexpected audit lines, a person reports it | BDE (or guardian for a BDE office) | The person changes their password and resets their second factor; the guardian can end a compromised BDE mandate (**Continuité du BDE › Mettre fin à ce mandat**); association presidents end other mandates | Re-appoint through the normal transitions; review the history | History reviewed, sessions ended | Actions done meanwhile stay in the history |
| **Lost BDE leadership** (both mandates ended, nobody approved) | Governance checker: `bde_office_vacant`, the guardian is told | Guardian | Expired rights already stopped; nobody is appointed automatically | Guardian proposes a recovery for a vacant office (reason, second factor); the person accepts with their own account | Both offices held, the checker resolves the issue | The guardian cannot take an office themselves |
| **Broken deployment** | Pages failing after a deploy | Whoever deployed | Roll back to the previous deployment in the host | Fix and redeploy through CI | CI green, pages fine | Database migrations are not rolled back by a site rollback: keep them backward compatible |
| **Scheduler stopped** | Operations page "En retard", `/api/health` 503 (`jobs:"late"`) | Technical owner | Nothing expires late: rights still stop at their dates | Check pg_cron in the project; re-schedule through a migration if jobs are missing | Jobs "À l'heure" again | Work queued meanwhile runs at the next run |

Production changes during an incident follow `technical-ownership.md`
(reviewed, from a branch, through CI) unless the technical owner decides an
emergency step and writes it in the incident.
