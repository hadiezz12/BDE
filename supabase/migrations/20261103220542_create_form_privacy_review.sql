-- Phase 14 · The recruitment form builder's privacy safeguard. A form whose
-- questions touch special categories (health, religion, politics, union
-- membership, sexuality, ethnic origin), criminal records, identity
-- documents or other data an association rarely needs (date of birth, home
-- address, phone, bank details) cannot be published until someone who may
-- publish it explains, in their own words, why each is necessary. The
-- explanation is recorded with the exact version and sent to the privacy
-- officer, who can follow up. The word list flags; it decides nothing: a
-- human justification and the officer's review are the safeguard.

insert into public.notification_types (key, topic, importance, email, confidential, description) values
  ('privacy_form_flagged', 'governance_actions', 'normal', true, true,
   'Un formulaire de recrutement pose des questions sensibles, justifiées par l''asso (à examiner).');

-- The flagged themes of a form (labels, help texts, options, section titles).
create or replace function private.form_sensitive_terms(p_schema jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(t.term order by t.term), '{}')
    from (values
      ('sante', '(\msant[eé]\M|maladie|m[eé]dica|handicap|grossesse|enceinte|allergi|traitement m[eé]dical)'),
      ('religion', '(religi|croyance|\mculte\M|confession religieuse|pratique religieuse)'),
      ('politique', '(opinion politique|parti politique|engagement politique|militan|\mvote\M)'),
      ('syndicat', '(syndica)'),
      ('vie_sexuelle', '(orientation sexuelle|sexualit|vie sexuelle|identit[eé] de genre)'),
      ('origine', '(origine ethnique|\methni|\mrace\M|racial|nationalit)'),
      ('justice', '(casier judiciaire|condamnation|infraction|\mpénal|\mpenal)'),
      ('identite', '(pi[eè]ce d.identit|carte d.identit|passeport|titre de s[eé]jour|s[eé]curit[eé] sociale|num[eé]ro fiscal)'),
      ('naissance', '(date de naissance|lieu de naissance|\m[aâ]ge\M)'),
      ('adresse', '(adresse postale|adresse personnelle|domicile)'),
      ('telephone', '(t[eé]l[eé]phone|num[eé]ro de portable)'),
      ('banque', '(\miban\M|\mrib\M|coordonn[eé]es bancaires|carte bancaire)')
    ) as t (term, pattern)
   where lower(coalesce((select string_agg(coalesce(q ->> 'label', '') || ' ' || coalesce(q ->> 'help', '') || ' '
                                           || coalesce(q ->> 'placeholder', '') || ' ' || coalesce((q -> 'options')::text, ''), ' ')
                           from jsonb_array_elements(coalesce(p_schema -> 'questions', '[]'::jsonb)) q), '')
                  || ' ' || coalesce((select string_agg(coalesce(s ->> 'title', '') || ' ' || coalesce(s ->> 'description', ''), ' ')
                                        from jsonb_array_elements(coalesce(p_schema -> 'sections', '[]'::jsonb)) s), ''))
         ~ t.pattern;
$$;

create table public.recruitment_form_privacy_reviews (
  form_version_id uuid primary key
    constraint recruitment_form_privacy_reviews_form_version_id_fkey references public.recruitment_form_versions (id) on delete cascade,
  flagged text[] not null,
  justification text not null
    constraint recruitment_form_privacy_reviews_justification_check check (char_length(btrim(justification)) between 20 and 1000),
  reviewed_by uuid
    constraint recruitment_form_privacy_reviews_reviewed_by_fkey references auth.users (id) on delete set null,
  reviewed_at timestamptz not null default now()
);
comment on table public.recruitment_form_privacy_reviews is
  'Why a recruitment form asks sensitive questions, written by the person publishing it (Phase 14). One per form version.';
create index recruitment_form_privacy_reviews_reviewed_by_idx on public.recruitment_form_privacy_reviews (reviewed_by);
alter table public.recruitment_form_privacy_reviews enable row level security;
revoke all on public.recruitment_form_privacy_reviews from anon, authenticated;

-- The guard: a version goes live only with the justification of what it flags.
create or replace function private.guard_form_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terms text[];
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    v_terms := private.form_sensitive_terms(new.schema);
    if cardinality(v_terms) > 0 and not exists (
         select 1 from public.recruitment_form_privacy_reviews r where r.form_version_id = new.id and r.flagged @> v_terms) then
      raise exception 'form_privacy_review_required' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger recruitment_form_versions_privacy_guard
  before update on public.recruitment_form_versions
  for each row execute function private.guard_form_privacy();

-- The draft's check, for the editor (anyone who may edit or publish the form).
create or replace function public.recruitment_form_privacy_check(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_draft public.recruitment_form_versions%rowtype;
  v_review public.recruitment_form_privacy_reviews%rowtype;
begin
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  if not (private.user_has_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.questions.manage', now())
          or private.user_has_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select * into v_draft from public.recruitment_form_versions where campaign_id = p_campaign_id and status = 'draft';
  if not found then
    return jsonb_build_object('draft', false, 'flagged', '[]'::jsonb, 'reviewed', true);
  end if;
  select * into v_review from public.recruitment_form_privacy_reviews where form_version_id = v_draft.id;
  return jsonb_build_object(
    'draft', true,
    'flagged', to_jsonb(private.form_sensitive_terms(v_draft.schema)),
    'reviewed', cardinality(private.form_sensitive_terms(v_draft.schema)) = 0
                or (v_review.form_version_id is not null and v_review.flagged @> private.form_sensitive_terms(v_draft.schema)),
    'justification', v_review.justification,
    'reviewed_at', v_review.reviewed_at);
end;
$$;

-- Records why the flagged questions are needed, and tells the privacy officer.
create or replace function public.record_form_privacy_review(p_campaign_id uuid, p_justification text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_draft public.recruitment_form_versions%rowtype;
  v_terms text[];
  v_u uuid;
begin
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  if not (private.user_has_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.questions.manage', now())
          or private.user_has_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_justification, ''))) not between 20 and 1000 or private.looks_secret(coalesce(p_justification, '')) then
    raise exception 'form_privacy_justification_invalid' using errcode = 'P0001';
  end if;
  select * into v_draft from public.recruitment_form_versions where campaign_id = p_campaign_id and status = 'draft' for update;
  if not found then
    raise exception 'form_not_found' using errcode = 'P0001';
  end if;
  v_terms := private.form_sensitive_terms(v_draft.schema);
  if cardinality(v_terms) = 0 then
    return jsonb_build_object('flagged', '[]'::jsonb);
  end if;
  insert into public.recruitment_form_privacy_reviews (form_version_id, flagged, justification, reviewed_by)
  values (v_draft.id, v_terms, btrim(p_justification), v_actor)
  on conflict (form_version_id) do update
    set flagged = excluded.flagged, justification = excluded.justification, reviewed_by = excluded.reviewed_by, reviewed_at = now();
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.questions.manage'),
    'recruitment_form_privacy_reviewed', 'recruitment', v_campaign.organization_id, null, 'recruitment_form', v_draft.id,
    jsonb_build_object('campaign', p_campaign_id, 'flagged', to_jsonb(v_terms)));
  for v_u in select private.privacy_handlers() loop
    perform private.notify(
      v_u, 'privacy_form_flagged', 'privacy-form:' || v_draft.id || ':' || to_char(now(), 'YYYYMMDDHH24MISS') || ':' || v_u,
      jsonb_build_object('title', v_campaign.title, 'organization', (select o.name from public.organizations o where o.id = v_campaign.organization_id),
                         'flagged', to_jsonb(v_terms)),
      v_campaign.organization_id, 'recruitment_campaign', p_campaign_id);
  end loop;
  return jsonb_build_object('flagged', to_jsonb(v_terms));
end;
$$;

revoke all on function private.form_sensitive_terms(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.guard_form_privacy() from public, anon, authenticated, service_role;
revoke all on function public.recruitment_form_privacy_check(uuid) from public, anon;
revoke all on function public.record_form_privacy_review(uuid, text) from public, anon;
grant execute on function public.recruitment_form_privacy_check(uuid) to authenticated;
grant execute on function public.record_form_privacy_review(uuid, text) to authenticated;
