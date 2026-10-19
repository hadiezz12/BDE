# Leadership transitions

Offices (an association's presidency, the BDE's presidency and vice-presidency) never change
through the ordinary position functions. They change through a **leadership transition**:
`public.leadership_transitions` + `leadership_transition_candidates` +
`leadership_transition_approvals`, in `supabase/migrations/20261019141415_create_leadership_transitions.sql`.

## The four kinds

| Kind | Started by | Needs | Typical use |
| --- | --- | --- | --- |
| `association_succession` | the sitting association president (`governance.succession`) | the candidate's acceptance | yearly handover |
| `association_appointment` | BDE leadership (`platform.associations.intervene`), with a reason | the candidate's acceptance | first president of a new association; association left without a president |
| `bde_succession` | the BDE president or vice-president; their proposal counts as their approval | both sitting officers' approvals (or the guardian's when one office is vacant) **and** both candidates' acceptances | yearly BDE handover (president + vice-president together) |
| `bde_recovery` | the guardian (`platform.recovery`), with a reason, for a **vacant** BDE office | the candidate's acceptance | a BDE office left vacant, or after an emergency end |

Every proposing, accepting and approving step requires a second factor (aal2). Candidates must
already have an account (they sign in once first); a candidate who is suspended in the
organization, already holds the other BDE office, or is the guardian (for BDE offices) is refused.

## Lifecycle

```text
open ──(last missing step)──▶ completed     (atomic, in the transaction of that last step)
  │
  ├──(a candidate declines)──▶ cancelled
  ├──(proposer, BDE for association kinds, a sitting BDE officer for bde_succession,
  │    the guardian for recovery: cancel, optional reason)──▶ cancelled
  ├──(organization archived)──▶ cancelled
  └──(14 days without completing)──▶ expired
```

- **One open transition per organization** (unique partial index): a second proposal is refused
  with `transition_conflict` until the first completes, is cancelled or expires.
- **Expiry** needs no job: an open transition past `expires_at` is treated as expired everywhere
  (reads show it as expired; the next proposal for that organization marks it expired first).
- **Withdrawal**: a BDE officer can withdraw their approval while the transition is open.

## Completion (`private.try_complete_transition`)

Called at the end of every accepting or approving step. When everything required is there, in the
same transaction:

1. re-checks that the proposer still has the authority they used (`proposer_lost_authority`
   otherwise: a president who already left cannot hand over), that the approvals come from the
   people holding the offices **now**, and that the organization is `active` or `setup`;
2. sets the **effective moment**: the proposed date, or now if that date has passed;
3. ends the outgoing office mandates at that moment (or cancels mandates planned inside the new
   mandate's window);
4. creates the incoming people's memberships if needed and their office mandates from the effective
   moment to the mandate end;
5. marks the transition `completed` and audits it.

Because the exclusion constraints forbid two holders of one office at any instant, and the BDE
president and vice-president from being the same person, a completed transition can never produce
an overlap even under concurrent requests; a losing concurrent step fails cleanly and nothing is
half-written.

### Future effective dates

A transition may take effect up to 6 months later (`effective_at`); the new mandate is at most 13
months from that moment. Completing it early simply writes a mandate that **starts later**: the
outgoing president keeps their rights until the effective moment and the successor gets theirs from
it, with no scheduled job (brief §25). The governance page shows both ("À partir du …").

## Emergency end of an office (`public.end_office_mandate`)

For a compromised account, an abandoned office or a decision outside the site, with a written reason
and aal2:

- an association presidency: BDE leadership (`platform.associations.intervene`);
- a BDE office: the guardian only.

The office becomes vacant immediately; the next step is an appointment (association) or a recovery
(BDE). The outgoing person keeps their membership, without the office.

## BDE dual approval in detail

- Proposal by the president (or the vice-president) for both offices at once: two different people.
- Required approvals are computed **at completion time** from who holds the offices then:
  - both offices filled: the president's and the vice-president's approvals;
  - one office vacant: the remaining officer's approval and the guardian's;
  - both vacant: a succession cannot complete (`bde_leadership_vacant`); the guardian first restores
    an office by recovery.
- An approval given by someone who no longer holds the office does not count.

## Where it shows in the interface

- `/manage/<asso>/governance`: the offices, the open transition as a checklist (approvals,
  acceptances, dates, expiry), the buttons that belong to the viewer, past transitions and the
  audit log.
- `/account/invitations`: proposed presidencies (accept/decline, aal2) and BDE approvals waiting.
- `/manage/plateforme`: associations without a president, open transitions, offices ending soon;
  appointment and emergency end per association.
- `/manage/continuite`: the guardian's recovery and emergency end.

## Tests

`supabase/tests/database/governance.test.sql` runs complete handovers: association succession
(pending changes nothing, competing proposal refused, decline, cancellation, replay of a completed or
expired transition refused, a proposer who lost the office before the successor accepted), BDE
appointment after an emergency end, BDE dual approval (one approval is not enough, one person never
counts twice, aal2 required, the guardian's approval with one vacant office, a future-dated
succession kept across an interim), recovery and its refusals, and the overlap constraints.
Withdrawing a BDE approval is not covered yet. `e2e/governance.spec.ts` hands a presidency over in
the browser, including the refusal without a second factor.
