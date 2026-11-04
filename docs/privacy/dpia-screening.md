# Impact assessment (AIPD / DPIA): screening

**Status: screening by the development team, not a decision.** Article 35
requires an assessment when processing is *likely to result in a high risk*.
The EDPB guidelines (WP248 rev.01) give nine criteria; processing meeting
two or more usually needs one. The CNIL publishes the list of processing
types for which an AIPD is required and a list of exemptions: the
controller must check this processing against the **current** lists on
cnil.fr. The final call, and the assessment itself, belong to the controller.

## Criteria, module by module

| Criterion (WP248) | Accounts / teams / events | Recruitment | Notifications | Statistics |
| --- | --- | --- | --- | --- |
| Evaluation or scoring | No | **Yes**: reviewers score and comment applications | No | No |
| Automated decision with legal or similar effect | No | No (human decisions only) | No | No |
| Systematic monitoring | No | No | No (no open tracking) | No (no audience measurement) |
| Sensitive or highly personal data | No | **Possible**: free-text answers and CVs may contain health, beliefs, origin…; forms asking for them need a justification | No | No |
| Large scale | One campus; to quantify | One campus | One campus | Aggregates |
| Matching or combining datasets | No | No | No | No (counts only) |
| Vulnerable data subjects or power imbalance | Students; mostly peers | **Arguably**: candidates depend on the association's decision to join it | No | No |
| Innovative technology | No | No | No | No |
| Prevents exercising a right or using a service | No | **Arguably**: a refusal keeps a student out of an association role | No | No |

## Reasoning

Recruitment meets **evaluation/scoring** and, depending on the answers
people give and on the reading of the last two rows, **sensitive data** and
**dependence**: at least two criteria. The rest of the platform meets none
or one.

**Recommendation:** carry out an AIPD for recruitment (applications,
documents, evaluations, interviews, decisions) before production, using the
CNIL's PIA method or tool. The controls already built feed it: scoped access
per association and committee, time-bound mandates, attachment-only CV
downloads with an access log, no automatic decision, neutral recruitment
e-mails, the sensitive-question justification, retention settings, erasure,
holds, and statistics with small-group suppression.

**Residual risks to address in the AIPD:** undecided retention (F2); no
malware scanning (F4); free text can still carry sensitive data the platform
cannot prevent; reviewers' notes are personal data of the candidate and must
be written knowing they may be disclosed on an access request; committee
members are students judging peers.

**The VSS / VDH alert channel** (today a demonstration that sends nothing)
would process reports about sexist and sexual violence — highly sensitive by
nature, possibly involving third parties. It must not be wired before its
own assessment, a defined handling team, and a decision on the legal basis
and art. 9 condition.

## What the controller signs

The AIPD itself, the decision (and its reasons) if it judges none is needed,
and any prior consultation of the CNIL if a high residual risk remains
(art. 36). No signature or approval is recorded here.
