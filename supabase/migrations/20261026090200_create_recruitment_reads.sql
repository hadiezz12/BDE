-- Phase 8 · Reading recruitment: the public read model (visitors), a
-- student's own applications, the team's desk, editor and preview, and the
-- BDE's list. Visitors get public fields of published, visible campaigns on
-- public association pages only. Nobody reads anyone else's application: the
-- team and the BDE get counts, never a name, an answer or a file.

-- ---- Shapes ---------------------------------------------------------------------------------------

-- A position as visitors see it (effective closing, whether it takes applications now).
create or replace function private.position_card(p_position public.recruitment_positions, p_campaign public.recruitment_campaigns)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_position.id, 'slug', p_position.slug, 'title', p_position.title, 'team', p_position.team,
    'summary', p_position.summary, 'openings', p_position.openings,
    'closes_at', private.position_closes(p_position, p_campaign),
    'closes_early', p_position.closes_at is not null and p_position.closes_at < p_campaign.closes_at,
    'eligible_years', to_jsonb(coalesce(p_position.eligible_years, p_campaign.eligible_years)),
    'accepting', private.position_accepting(p_position, p_campaign),
    'retired', p_position.retired_at is not null);
$$;

-- What the live form asks a candidate to this position, in short (no question text needed to decide to apply).
create or replace function private.form_summary(p_schema jsonb, p_position_id uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'questions', count(*) filter (where q ->> 'type' not in ('file', 'cv')),
    'required', count(*) filter (where q ->> 'type' not in ('file', 'cv') and (q ->> 'required')::boolean),
    'documents', coalesce(jsonb_agg(jsonb_build_object('label', q ->> 'label', 'type', q ->> 'type',
                                                       'required', (q ->> 'required')::boolean, 'file_types', q -> 'file_types'))
                          filter (where q ->> 'type' in ('file', 'cv')), '[]'::jsonb))
    from private.form_questions(coalesce(p_schema, '{}'::jsonb), p_position_id) q;
$$;

-- A campaign as visitors see it: public fields, derived state, positions in order.
create or replace function private.campaign_card(p_campaign public.recruitment_campaigns)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_campaign.id, 'slug', p_campaign.slug, 'title', p_campaign.title, 'summary', p_campaign.summary,
    'academic_year', p_campaign.academic_year, 'cover', private.media_json(p_campaign.cover_media_id),
    'organization', private.organization_card(p_campaign.organization_id),
    'opens_at', p_campaign.opens_at, 'closes_at', p_campaign.closes_at, 'timezone', p_campaign.timezone,
    'state', private.campaign_state(p_campaign), 'paused_at', p_campaign.paused_at,
    'cancelled_at', p_campaign.cancelled_at, 'cancellation_reason', p_campaign.cancellation_reason,
    'max_applications', p_campaign.max_applications,
    'eligible_years', to_jsonb(p_campaign.eligible_years), 'eligibility_note', p_campaign.eligibility_note,
    'archived', p_campaign.archived_at is not null,
    'first_published_at', p_campaign.first_published_at, 'updated_at', p_campaign.updated_at,
    'positions', coalesce((select jsonb_agg(private.position_card(p, p_campaign) order by p.display_order, p.id)
                             from public.recruitment_positions p
                            where p.campaign_id = p_campaign.id and p.retired_at is null), '[]'::jsonb));
$$;

-- A whole position, for its page and the campaign page.
create or replace function private.position_detail(p_position public.recruitment_positions, p_campaign public.recruitment_campaigns)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.position_card(p_position, p_campaign) || jsonb_build_object(
    'description', p_position.description, 'missions', p_position.missions, 'expectations', p_position.expectations,
    'commitment', p_position.commitment,
    'form', private.form_summary((select f.schema from public.recruitment_form_versions f where f.id = p_campaign.active_form_version_id),
                                 p_position.id));
$$;

-- ---- Visitors ----------------------------------------------------------------------------------

-- The directory. Views: current (open, upcoming, paused), open, upcoming,
-- closing_soon (open, closing within 7 days), closed (closed or cancelled),
-- all. Filters: association, school year, search (French, accents folded,
-- campaign texts, association names, position titles).
create or replace function public.public_recruitment_campaigns(
  p_view text default 'current',
  p_organization_slug text default null,
  p_academic_year text default null,
  p_q text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select case when char_length(btrim(coalesce(p_q, ''))) < 2 then null
                else websearch_to_tsquery('french'::regconfig, private.fold_accents(left(p_q, 80))) end as tsq,
           private.fold_accents(btrim(coalesce(p_q, ''))) as raw
  ), visible as (
    select c as cc, c.id, c.opens_at, c.closes_at, private.campaign_state(c) as state
      from public.recruitment_campaigns c
      join public.organizations o on o.id = c.organization_id
      cross join q
     where private.campaign_is_public(c)
       and (p_organization_slug is null or o.slug = p_organization_slug)
       and (p_academic_year is null or c.academic_year = p_academic_year)
       and (q.tsq is null or c.search @@ q.tsq
            or private.fold_accents(o.name) like '%' || q.raw || '%'
            or private.fold_accents(coalesce(o.short_name, '')) like '%' || q.raw || '%'
            or exists (select 1 from public.recruitment_positions p
                        where p.campaign_id = c.id and p.retired_at is null
                          and private.fold_accents(p.title) like '%' || q.raw || '%'))
  ), chosen as (
    select * from visible
     where case coalesce(p_view, 'current')
             when 'current' then state in ('open', 'upcoming', 'paused') and (cc).archived_at is null
             when 'open' then state = 'open'
             when 'upcoming' then state = 'upcoming'
             when 'closing_soon' then state = 'open' and closes_at <= now() + interval '7 days'
             when 'closed' then state in ('closed', 'cancelled')
             else true
           end
     order by case state when 'open' then 0 when 'paused' then 1 when 'upcoming' then 2 else 3 end,
              case when state in ('closed', 'cancelled') then null else closes_at end asc,
              case when state in ('closed', 'cancelled') then closes_at end desc nulls last,
              id
     limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(private.campaign_card(chosen.cc) order by
           case chosen.state when 'open' then 0 when 'paused' then 1 when 'upcoming' then 2 else 3 end,
           case when chosen.state in ('closed', 'cancelled') then null else chosen.closes_at end asc,
           case when chosen.state in ('closed', 'cancelled') then chosen.closes_at end desc nulls last,
           chosen.id), '[]'::jsonb)
    from chosen;
$$;

-- One campaign page: ok (with its texts, positions and what the form asks), moved, or not_found.
create or replace function public.public_recruitment_campaign(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_campaign public.recruitment_campaigns%rowtype;
  v_moved text;
begin
  select * into v_campaign from public.recruitment_campaigns where slug = p_slug;
  if not found then
    select c.slug into v_moved
      from public.recruitment_campaign_slug_history h join public.recruitment_campaigns c on c.id = h.campaign_id
     where h.slug = p_slug and private.campaign_is_public(c);
    if v_moved is not null then
      return jsonb_build_object('state', 'moved', 'slug', v_moved);
    end if;
    return jsonb_build_object('state', 'not_found');
  end if;
  if not private.campaign_is_public(v_campaign) then
    return jsonb_build_object('state', 'not_found');
  end if;
  return jsonb_build_object('state', 'ok', 'campaign',
    private.campaign_card(v_campaign) || jsonb_build_object(
      'description', v_campaign.description, 'process', v_campaign.process, 'faq', v_campaign.faq,
      'contact', case when v_campaign.contact_name is null and v_campaign.contact_email is null then null
                      else jsonb_build_object('name', v_campaign.contact_name, 'role', v_campaign.contact_role,
                                              'email', v_campaign.contact_email) end,
      'positions', coalesce((select jsonb_agg(private.position_detail(p, v_campaign) order by p.display_order, p.id)
                               from public.recruitment_positions p
                              where p.campaign_id = v_campaign.id and p.retired_at is null), '[]'::jsonb)));
end;
$$;

-- One position page (a former campaign address redirects to the new one).
create or replace function public.public_recruitment_position(p_campaign_slug text, p_position_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_campaign public.recruitment_campaigns%rowtype;
  v_position public.recruitment_positions%rowtype;
  v_moved text;
begin
  select * into v_campaign from public.recruitment_campaigns where slug = p_campaign_slug;
  if not found then
    select c.slug into v_moved
      from public.recruitment_campaign_slug_history h join public.recruitment_campaigns c on c.id = h.campaign_id
     where h.slug = p_campaign_slug and private.campaign_is_public(c);
    if v_moved is not null then
      return jsonb_build_object('state', 'moved', 'slug', v_moved);
    end if;
    return jsonb_build_object('state', 'not_found');
  end if;
  if not private.campaign_is_public(v_campaign) then
    return jsonb_build_object('state', 'not_found');
  end if;
  select * into v_position from public.recruitment_positions
   where campaign_id = v_campaign.id and slug = p_position_slug and retired_at is null;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;
  return jsonb_build_object('state', 'ok',
    'campaign', private.campaign_card(v_campaign) || jsonb_build_object(
      'contact', case when v_campaign.contact_name is null and v_campaign.contact_email is null then null
                      else jsonb_build_object('name', v_campaign.contact_name, 'role', v_campaign.contact_role,
                                              'email', v_campaign.contact_email) end),
    'position', private.position_detail(v_position, v_campaign));
end;
$$;

-- What the directory's filters offer: associations and school years with something current.
create or replace function public.public_recruitment_facets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select c as cc, c.id, c.organization_id, c.academic_year, c.closes_at, c.archived_at, private.campaign_state(c) as state
      from public.recruitment_campaigns c where private.campaign_is_public(c)
  )
  select jsonb_build_object(
    'current', (select count(*) from visible where state in ('open', 'upcoming', 'paused') and archived_at is null),
    'open', (select count(*) from visible where state = 'open'),
    'upcoming', (select count(*) from visible where state = 'upcoming'),
    'closing_soon', (select count(*) from visible where state = 'open' and closes_at <= now() + interval '7 days'),
    'closed', (select count(*) from visible where state in ('closed', 'cancelled')),
    'open_positions', (select count(*) from visible v join public.recruitment_positions p on p.campaign_id = v.id
                        where v.state = 'open' and p.retired_at is null and now() < private.position_closes(p, v.cc)),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'accent', o.accent, 'count', x.n)
                       order by o.name)
        from (select organization_id, count(*) as n from visible group by organization_id) as x
        join public.organizations o on o.id = x.organization_id), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(distinct academic_year order by academic_year desc)
                                  from visible where academic_year is not null), '[]'::jsonb));
$$;

-- An association page's recruitment block: what is current, then the last ones closed.
create or replace function public.public_association_recruitment(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select c as cc, c.closes_at, private.campaign_state(c) as state
      from public.recruitment_campaigns c
      join public.organizations o on o.id = c.organization_id
     where o.slug = p_slug and private.campaign_is_public(c)
  )
  select jsonb_build_object(
    'current', coalesce((select jsonb_agg(private.campaign_card(v.cc) order by v.closes_at)
                           from visible v where v.state in ('open', 'upcoming', 'paused') and (v.cc).archived_at is null), '[]'::jsonb),
    'past', coalesce((select jsonb_agg(private.campaign_card(x.cc) order by x.closes_at desc)
                        from (select * from visible v where v.state in ('closed', 'cancelled')
                               order by v.closes_at desc limit 3) as x), '[]'::jsonb));
$$;

create or replace function public.public_recruitment_sitemap()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', c.slug, 'updated_at', c.updated_at,
           'positions', coalesce((select jsonb_agg(p.slug order by p.display_order) from public.recruitment_positions p
                                   where p.campaign_id = c.id and p.retired_at is null), '[]'::jsonb))
         order by c.updated_at desc), '[]'::jsonb)
    from public.recruitment_campaigns c
   where private.campaign_is_public(c);
$$;

-- What candidates are told before submitting (set by the BDE; null parts are still to be decided).
create or replace function public.public_recruitment_privacy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'notice', s.privacy_notice, 'contact', s.privacy_contact,
    'draft_months', s.draft_retention_months, 'withdrawn_months', s.withdrawn_retention_months,
    'submitted_months', s.submitted_retention_months, 'updated_at', s.updated_at)
    from public.recruitment_settings s where s.id;
$$;

-- ---- A student's own applications -----------------------------------------------------------------

-- How far a draft got, by section (shared sections, then "the position", then documents).
create or replace function private.application_progress(p_application public.applications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with f as (select schema from public.recruitment_form_versions where id = p_application.form_version_id),
  qs as (select q from f, private.form_questions(f.schema, p_application.position_id) q),
  missing as (
    select private.application_answer_errors(
             (select schema from f), p_application.position_id,
             private.clean_answers((select schema from f), p_application.position_id, p_application.answers),
             private.application_document_counts(p_application.id), true) as e)
  select jsonb_build_object(
    'required', (select count(*) from qs where (q ->> 'required')::boolean),
    'missing', (select count(*) from missing, jsonb_object_keys(missing.e)),
    'complete', (select missing.e = '{}'::jsonb from missing));
$$;

create or replace function public.my_applications()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'application', jsonb_build_object(
               'id', a.id, 'status', a.status, 'reference', a.reference, 'created_at', a.created_at,
               'updated_at', a.updated_at, 'last_saved_at', a.last_saved_at, 'submitted_at', a.submitted_at,
               'withdrawn_at', a.withdrawn_at,
               -- A draft that can no longer be sent says why (closed, paused, cancelled…).
               'refusal', case when a.status = 'draft' then private.position_refusal(p, c) end,
               'progress', case when a.status = 'draft' then private.application_progress(a) end),
             'campaign', case when private.campaign_is_public(c) then private.campaign_card(c)
                              else jsonb_build_object('id', c.id, 'slug', null, 'title', c.title,
                                                      'organization', private.organization_card(c.organization_id),
                                                      'state', private.campaign_state(c), 'closes_at', c.closes_at,
                                                      'cancellation_reason', c.cancellation_reason, 'unavailable', true) end,
             'position', jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'team', p.team,
                                            'closes_at', private.position_closes(p, c)))
           order by case a.status when 'draft' then 0 when 'submitted' then 1 else 2 end, a.updated_at desc)
      from public.applications a
      join public.recruitment_campaigns c on c.id = a.campaign_id
      join public.recruitment_positions p on p.id = a.position_id
     where a.candidate_id = v_actor), '[]'::jsonb);
end;
$$;

-- One application, everything the candidate needs to fill it or read it back.
create or replace function public.my_application(p_application_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_position public.recruitment_positions%rowtype;
  v_schema jsonb;
  v_profile public.profiles%rowtype;
begin
  select * into v_app from public.applications where id = p_application_id and candidate_id = v_actor;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0001';
  end if;
  select * into v_campaign from public.recruitment_campaigns where id = v_app.campaign_id;
  select * into v_position from public.recruitment_positions where id = v_app.position_id;
  select schema into v_schema from public.recruitment_form_versions where id = v_app.form_version_id;
  select * into v_profile from public.profiles where id = v_actor;
  return jsonb_build_object(
    'application', jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'reference', v_app.reference, 'version', v_app.version,
      'answers', v_app.answers, 'created_at', v_app.created_at, 'updated_at', v_app.updated_at,
      'last_saved_at', v_app.last_saved_at, 'submitted_at', v_app.submitted_at, 'withdrawn_at', v_app.withdrawn_at,
      'withdrawal_reason', v_app.withdrawal_reason, 'privacy_acknowledged_at', v_app.privacy_acknowledged_at,
      'form_version', (select number from public.recruitment_form_versions where id = v_app.form_version_id),
      'form_changed', v_app.status = 'draft' and v_campaign.active_form_version_id is distinct from v_app.form_version_id,
      'refusal', case when v_app.status = 'draft' then private.position_refusal(v_position, v_campaign) end,
      'eligibility', case when v_app.status = 'draft' then private.application_eligibility(v_actor, v_position, v_campaign) end,
      'progress', case when v_app.status = 'draft' then private.application_progress(v_app) end),
    'form', private.form_for_position(v_schema, v_app.position_id),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', d.id, 'question_id', d.question_id, 'file_name', d.file_name, 'mime_type', d.mime_type,
                             'size_bytes', d.size_bytes, 'status', d.status, 'created_at', d.created_at) order by d.created_at)
                             from public.application_documents d
                            where d.application_id = v_app.id and d.status = 'ready'), '[]'::jsonb),
    'campaign', (case when private.campaign_is_public(v_campaign) then private.campaign_card(v_campaign)
                      else jsonb_build_object('id', v_campaign.id, 'slug', null, 'title', v_campaign.title,
                                              'organization', private.organization_card(v_campaign.organization_id),
                                              'state', private.campaign_state(v_campaign), 'closes_at', v_campaign.closes_at,
                                              'cancellation_reason', v_campaign.cancellation_reason, 'unavailable', true) end)
                 || jsonb_build_object('contact', case when v_campaign.contact_name is null and v_campaign.contact_email is null then null
                                                       else jsonb_build_object('name', v_campaign.contact_name, 'role', v_campaign.contact_role,
                                                                               'email', v_campaign.contact_email) end),
    'position', jsonb_build_object('id', v_position.id, 'slug', v_position.slug, 'title', v_position.title, 'team', v_position.team,
                                   'closes_at', private.position_closes(v_position, v_campaign)),
    -- What the association receives with the answers: the profile now (draft) or as submitted.
    'candidate', coalesce(v_app.candidate_snapshot, jsonb_build_object(
      'first_name', v_profile.first_name, 'last_name', v_profile.last_name, 'display_name', v_profile.display_name,
      'email', (select u.email from auth.users u where u.id = v_actor),
      'program', v_profile.program, 'study_year', v_profile.study_year)),
    'history', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.occurred_at, 'details', e.details)
                                          order by e.occurred_at)
                           from public.application_events e where e.application_id = v_app.id), '[]'::jsonb),
    'privacy', public.public_recruitment_privacy());
end;
$$;

-- The document a candidate asks to download: theirs, still part of the application.
create or replace function public.my_application_document(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_doc public.application_documents%rowtype;
begin
  select d.* into v_doc
    from public.application_documents d join public.applications a on a.id = d.application_id
   where d.id = p_document_id and a.candidate_id = v_actor and d.status = 'ready';
  if not found then
    raise exception 'document_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object('object_path', v_doc.object_path, 'file_name', v_doc.file_name, 'mime_type', v_doc.mime_type,
                            'size_bytes', v_doc.size_bytes);
end;
$$;

-- ---- The team -----------------------------------------------------------------------------------------

create or replace function private.campaign_summary(p_campaign public.recruitment_campaigns)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_campaign.id, 'slug', p_campaign.slug, 'title', p_campaign.title, 'academic_year', p_campaign.academic_year,
    'state', private.campaign_state(p_campaign), 'publication', p_campaign.publication, 'status', p_campaign.status,
    'opens_at', p_campaign.opens_at, 'closes_at', p_campaign.closes_at,
    'hidden', case when p_campaign.hidden_at is null then null
                   else jsonb_build_object('at', p_campaign.hidden_at, 'reason', p_campaign.hidden_reason) end,
    'archived_at', p_campaign.archived_at, 'first_published_at', p_campaign.first_published_at,
    'is_public', private.campaign_is_public(p_campaign), 'blocker', private.recruitment_blocker(p_campaign),
    'cover', private.media_json(p_campaign.cover_media_id),
    'positions', (select count(*) from public.recruitment_positions p where p.campaign_id = p_campaign.id and p.retired_at is null),
    -- Counts only. Drafts are the candidates' own business and are not counted here.
    'submitted', (select count(*) from public.applications a where a.campaign_id = p_campaign.id and a.status = 'submitted'),
    'withdrawn', (select count(*) from public.applications a where a.campaign_id = p_campaign.id and a.status = 'withdrawn'),
    'form', jsonb_build_object(
      'live', (select number from public.recruitment_form_versions f where f.id = p_campaign.active_form_version_id),
      'draft', exists (select 1 from public.recruitment_form_versions f where f.campaign_id = p_campaign.id and f.status = 'draft')),
    'created_by_name', case when p_campaign.created_by is null then null else private.person_name(p_campaign.created_by) end,
    'updated_at', p_campaign.updated_at);
$$;

create or replace function public.recruitment_dashboard(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_can_manage boolean;
  v_can_questions boolean;
  v_can_publish boolean;
begin
  v_can_manage := private.user_has_organization_permission(v_actor, p_organization_id, 'recruitment.campaigns.manage', now());
  v_can_questions := private.user_has_organization_permission(v_actor, p_organization_id, 'recruitment.questions.manage', now());
  v_can_publish := private.user_has_organization_permission(v_actor, p_organization_id, 'recruitment.campaigns.publish', now());
  if not (v_can_manage or v_can_questions or v_can_publish) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return (
    select jsonb_build_object(
      'organization', jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
                                         'accent', o.accent, 'kind', o.kind, 'status', o.status,
                                         'page_public', private.association_page_is_public(o.id)),
      'can', jsonb_build_object('manage', v_can_manage, 'questions', v_can_questions, 'publish', v_can_publish),
      'campaigns', coalesce((select jsonb_agg(private.campaign_summary(c) order by c.archived_at nulls first, c.created_at desc)
                               from public.recruitment_campaigns c where c.organization_id = o.id), '[]'::jsonb))
      from public.organizations o where o.id = p_organization_id);
end;
$$;

-- Everything the campaign wizard needs (no candidate data: counts per position only).
create or replace function public.recruitment_editor(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_can_manage boolean;
  v_can_questions boolean;
  v_can_publish boolean;
begin
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  v_can_manage := private.user_has_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.campaigns.manage', now());
  v_can_questions := private.user_has_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.questions.manage', now());
  v_can_publish := private.user_has_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish', now());
  if not (v_can_manage or v_can_questions or v_can_publish) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'campaign', to_jsonb(v_campaign) - 'search',
    'summary', private.campaign_summary(v_campaign),
    'organization', private.organization_card(v_campaign.organization_id)
                    || jsonb_build_object('status', (select status from public.organizations where id = v_campaign.organization_id),
                                          'page_public', private.association_page_is_public(v_campaign.organization_id)),
    'positions', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
                                     'submitted', (select count(*) from public.applications a where a.position_id = p.id and a.status = 'submitted'),
                                     'withdrawn', (select count(*) from public.applications a where a.position_id = p.id and a.status = 'withdrawn'),
                                     'has_applications', exists (select 1 from public.applications a where a.position_id = p.id),
                                     'closes', private.position_closes(p, v_campaign))
                                   order by p.display_order, p.id)
                             from public.recruitment_positions p where p.campaign_id = p_campaign_id), '[]'::jsonb),
    'form', jsonb_build_object(
      'draft', (select jsonb_build_object('id', f.id, 'number', f.number, 'edit_version', f.edit_version, 'schema', f.schema,
                                          'updated_at', f.updated_at,
                                          'updated_by_name', case when f.updated_by is null then null else private.person_name(f.updated_by) end)
                  from public.recruitment_form_versions f where f.campaign_id = p_campaign_id and f.status = 'draft'),
      'live', (select jsonb_build_object('id', f.id, 'number', f.number, 'schema', f.schema, 'published_at', f.published_at)
                 from public.recruitment_form_versions f where f.id = v_campaign.active_form_version_id),
      'versions', coalesce((select jsonb_agg(jsonb_build_object(
                               'id', f.id, 'number', f.number, 'status', f.status, 'published_at', f.published_at,
                               'submitted', (select count(*) from public.applications a where a.form_version_id = f.id and a.status <> 'draft'))
                             order by f.number desc)
                              from public.recruitment_form_versions f where f.campaign_id = p_campaign_id), '[]'::jsonb)),
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.object_path, 'kind', m.kind, 'width', m.width,
                                                           'height', m.height, 'alt', m.alt_text) order by m.created_at desc)
                         from public.association_media m
                        where m.organization_id = v_campaign.organization_id and m.removed_at is null), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('key', t.key, 'label', t.label) order by t.sort_order)
                             from public.position_templates t where t.office is null), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
                            'occurred_at', g.occurred_at, 'action', g.action,
                            'actor_name', case when g.actor_user_id is null then null else private.person_name(g.actor_user_id) end,
                            'reason', g.reason, 'details', g.details) order by g.occurred_at desc)
                           from (select * from public.governance_audit_events g
                                  where g.organization_id = v_campaign.organization_id
                                    and (g.resource_id = p_campaign_id
                                         or (g.resource_type = 'recruitment_position'
                                             and g.resource_id in (select id from public.recruitment_positions where campaign_id = p_campaign_id))
                                         or (g.resource_type = 'recruitment_form'
                                             and g.resource_id in (select id from public.recruitment_form_versions where campaign_id = p_campaign_id)))
                                  order by g.occurred_at desc limit 60) as g), '[]'::jsonb),
    'can', jsonb_build_object('manage', v_can_manage, 'questions', v_can_questions, 'publish', v_can_publish),
    'blocker', private.recruitment_blocker(v_campaign));
end;
$$;

-- The form as a candidate to this position would see it (draft or live), for the
-- team's preview. Never an application: nothing here is saved.
create or replace function public.recruitment_form_preview(p_campaign_id uuid, p_position_id uuid, p_which text default 'draft')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_position public.recruitment_positions%rowtype;
  v_schema jsonb;
  v_number integer;
begin
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
  if not found or v_campaign.organization_id not in (select private.my_recruitment_organization_ids()) then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  select * into v_position from public.recruitment_positions where id = p_position_id and campaign_id = p_campaign_id;
  if not found then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  select f.schema, f.number into v_schema, v_number from public.recruitment_form_versions f
   where f.campaign_id = p_campaign_id
     and (case when p_which = 'live' then f.id = v_campaign.active_form_version_id else f.status = 'draft' end);
  if v_schema is null then
    select f.schema, f.number into v_schema, v_number from public.recruitment_form_versions f where f.id = v_campaign.active_form_version_id;
  end if;
  return jsonb_build_object(
    'campaign', private.campaign_card(v_campaign) || jsonb_build_object('description', v_campaign.description),
    'position', private.position_card(v_position, v_campaign) || jsonb_build_object('title', v_position.title),
    'form', private.form_for_position(coalesce(v_schema, '{"sections": [], "questions": []}'::jsonb), p_position_id),
    'number', v_number, 'which', case when p_which = 'live' then 'live' else 'draft' end,
    'privacy', public.public_recruitment_privacy());
end;
$$;

-- ---- The BDE -------------------------------------------------------------------------------------

-- Public information and counts; never a candidate. Views: current, past, hidden.
create or replace function public.platform_recruitment(p_q text default null, p_view text default 'current')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_raw text := private.fold_accents(btrim(coalesce(p_q, '')));
begin
  if not private.user_has_platform_permission(v_actor, 'platform.content.moderate', now()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(private.campaign_card(x.cc) || jsonb_build_object(
             'hidden', case when (x.cc).hidden_at is null then null
                            else jsonb_build_object('at', (x.cc).hidden_at, 'reason', (x.cc).hidden_reason,
                                                    'by_name', case when (x.cc).hidden_by is null then null
                                                                    else private.person_name((x.cc).hidden_by) end) end,
             'publication', (x.cc).publication, 'is_public', private.campaign_is_public(x.cc),
             'submitted', (select count(*) from public.applications a where a.campaign_id = (x.cc).id and a.status = 'submitted'))
           order by x.closes_at desc)
      from (select c as cc, c.closes_at from public.recruitment_campaigns c
              join public.organizations o on o.id = c.organization_id
             where c.first_published_at is not null
               and (case p_view when 'hidden' then c.hidden_at is not null
                                when 'past' then private.campaign_state(c) in ('closed', 'cancelled')
                                else private.campaign_state(c) not in ('closed', 'cancelled') end)
               and (v_raw = '' or private.fold_accents(c.title) like '%' || v_raw || '%'
                    or private.fold_accents(o.name) like '%' || v_raw || '%')
             order by c.closes_at desc limit 100) as x), '[]'::jsonb);
end;
$$;

-- ---- Grants ---------------------------------------------------------------------------------------

revoke all on function private.position_card(public.recruitment_positions, public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.form_summary(jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function private.campaign_card(public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.position_detail(public.recruitment_positions, public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.application_progress(public.applications) from public, anon, authenticated, service_role;
revoke all on function private.campaign_summary(public.recruitment_campaigns) from public, anon, authenticated, service_role;

revoke all on function public.public_recruitment_campaigns(text, text, text, text, integer, integer) from public;
revoke all on function public.public_recruitment_campaign(text) from public;
revoke all on function public.public_recruitment_position(text, text) from public;
revoke all on function public.public_recruitment_facets() from public;
revoke all on function public.public_association_recruitment(text) from public;
revoke all on function public.public_recruitment_sitemap() from public;
revoke all on function public.public_recruitment_privacy() from public;
grant execute on function public.public_recruitment_campaigns(text, text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.public_recruitment_campaign(text) to anon, authenticated;
grant execute on function public.public_recruitment_position(text, text) to anon, authenticated;
grant execute on function public.public_recruitment_facets() to anon, authenticated;
grant execute on function public.public_association_recruitment(text) to anon, authenticated;
grant execute on function public.public_recruitment_sitemap() to anon, authenticated;
grant execute on function public.public_recruitment_privacy() to anon, authenticated;

revoke all on function public.my_applications() from public, anon;
revoke all on function public.my_application(uuid) from public, anon;
revoke all on function public.my_application_document(uuid) from public, anon;
revoke all on function public.recruitment_dashboard(uuid) from public, anon;
revoke all on function public.recruitment_editor(uuid) from public, anon;
revoke all on function public.recruitment_form_preview(uuid, uuid, text) from public, anon;
revoke all on function public.platform_recruitment(text, text) from public, anon;
grant execute on function public.my_applications() to authenticated;
grant execute on function public.my_application(uuid) to authenticated;
grant execute on function public.my_application_document(uuid) to authenticated;
grant execute on function public.recruitment_dashboard(uuid) to authenticated;
grant execute on function public.recruitment_editor(uuid) to authenticated;
grant execute on function public.recruitment_form_preview(uuid, uuid, text) to authenticated;
grant execute on function public.platform_recruitment(text, text) to authenticated;
