-- Phase 8 · Recruitment functions: the team's writes (campaigns, positions,
-- forms, publication), the application engine (start, autosave, documents,
-- submission, withdrawal), BDE moderation, the platform settings, reminders
-- and cleanup. Every function identifies the caller (private.require_actor),
-- checks the right in the campaign's own organization and writes in one
-- transaction; organizer actions are audited, a candidate's are recorded in
-- their own application_events.

-- ---- Internals --------------------------------------------------------------------------------

create or replace function private.recruitment_reserved_slugs()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['apercu', 'nouveau', 'new', 'recherche', 'rss', 'flux', 'postuler', 'candidature', 'candidatures'];
$$;

create or replace function private.slugify(p_text text, p_max integer default 80)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(left(btrim(regexp_replace(private.fold_accents(p_text), '[^a-z0-9]+', '-', 'g'), '-'), p_max), '-');
$$;

create or replace function private.unique_campaign_slug(p_title text, p_campaign_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := private.slugify(p_title, 80);
  v_slug text;
  v_n integer := 1;
begin
  if char_length(v_base) < 3 or v_base = any (private.recruitment_reserved_slugs()) then
    v_base := 'recrutement-' || coalesce(nullif(v_base, ''), 'asso');
  end if;
  v_slug := v_base;
  while exists (select 1 from public.recruitment_campaigns where slug = v_slug and id <> p_campaign_id)
     or exists (select 1 from public.recruitment_campaign_slug_history where slug = v_slug and campaign_id <> p_campaign_id) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

create or replace function private.unique_position_slug(p_title text, p_campaign_id uuid, p_position_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := private.slugify(p_title, 70);
  v_slug text;
  v_n integer := 1;
begin
  if char_length(v_base) < 2 then
    v_base := 'poste';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.recruitment_positions
                 where campaign_id = p_campaign_id and slug = v_slug and id is distinct from p_position_id) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- Where a campaign stands, derived at read time from the stored concerns and
-- the dates (no job moves it): draft, unpublished, cancelled, closed, paused,
-- upcoming or open. Moderation (hidden_at) is checked separately.
create or replace function private.campaign_state(p_campaign public.recruitment_campaigns)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_campaign.status = 'cancelled' then 'cancelled'
    when p_campaign.publication <> 'published' then p_campaign.publication
    when p_campaign.status = 'closed' or p_campaign.closes_at <= now() then 'closed'
    when p_campaign.status = 'paused' then 'paused'
    when now() < p_campaign.opens_at then 'upcoming'
    else 'open'
  end;
$$;

-- What visitors may see: published, not hidden, on a public association page.
-- (Closed and cancelled campaigns stay readable, saying so.)
create or replace function private.campaign_is_public(p_campaign public.recruitment_campaigns)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_campaign.publication = 'published' and p_campaign.hidden_at is null
     and private.association_page_is_public(p_campaign.organization_id);
$$;

-- The instant a position stops taking applications.
create or replace function private.position_closes(p_position public.recruitment_positions, p_campaign public.recruitment_campaigns)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select least(coalesce(p_position.closes_at, p_campaign.closes_at), p_campaign.closes_at);
$$;

-- Whether the trusted backend accepts an application to this position right now.
create or replace function private.position_accepting(p_position public.recruitment_positions, p_campaign public.recruitment_campaigns)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.campaign_is_public(p_campaign) and private.campaign_state(p_campaign) = 'open'
     and p_position.retired_at is null and now() < private.position_closes(p_position, p_campaign);
$$;

-- Why the campaign cannot be published, or null.
create or replace function private.recruitment_blocker(p_campaign public.recruitment_campaigns)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text := (select status from public.organizations where id = p_campaign.organization_id);
begin
  if p_campaign.hidden_at is not null then
    return 'campaign_hidden';
  end if;
  if p_campaign.status = 'cancelled' then
    return 'campaign_cancelled';
  end if;
  if v_status <> 'active' then
    return 'organization_inactive';
  end if;
  if not private.association_page_is_public(p_campaign.organization_id) then
    return 'page_not_public';
  end if;
  if char_length(p_campaign.title) < 3 or p_campaign.summary is null or p_campaign.opens_at is null or p_campaign.closes_at is null then
    return 'campaign_incomplete';
  end if;
  if p_campaign.closes_at <= now() then
    return 'campaign_past';
  end if;
  if not exists (select 1 from public.recruitment_positions p where p.campaign_id = p_campaign.id and p.retired_at is null) then
    return 'campaign_needs_position';
  end if;
  if p_campaign.cover_media_id is not null and not exists (
       select 1 from public.association_media m
        where m.id = p_campaign.cover_media_id and m.organization_id = p_campaign.organization_id and m.removed_at is null) then
    return 'media_not_found';
  end if;
  return null;
end;
$$;

-- The campaign and the caller's right in its organization, or a refusal.
create or replace function private.campaign_for(p_actor uuid, p_campaign_id uuid, p_permission text, p_lock boolean default false)
returns public.recruitment_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.recruitment_campaigns%rowtype;
begin
  if p_lock then
    select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id for update;
  else
    select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
  end if;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(p_actor, v_campaign.organization_id, p_permission);
  return v_campaign;
end;
$$;

-- ---- The form schema: data, never code --------------------------------------------------------

-- The question types and, for each, the keys it may carry. Anything else is refused.
create or replace function private.form_question_keys(p_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['id', 'type', 'scope', 'section', 'label', 'help', 'required'] || case p_type
    when 'short_text' then array['max_length']
    when 'long_text' then array['max_length']
    when 'single_choice' then array['options']
    when 'multiple_choice' then array['options', 'min_selected', 'max_selected']
    when 'yes_no' then array[]::text[]
    when 'number' then array['min', 'max', 'integer']
    when 'date' then array['min_date', 'max_date']
    when 'url' then array[]::text[]
    when 'file' then array['file_types', 'max_files', 'max_size_mb']
    when 'cv' then array['file_types', 'max_size_mb']
  end;
$$;

create or replace function private.form_invalid(p_detail text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  raise exception 'form_invalid' using errcode = 'P0001', detail = left(p_detail, 200);
end;
$$;

-- Validates a whole form document: sections, questions, options, scopes. Raises
-- form_invalid (with a detail naming the question) on the first problem.
create or replace function private.validate_form_schema(p_schema jsonb, p_campaign_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_section jsonb;
  v_question jsonb;
  v_option jsonb;
  v_sections text[] := '{}';
  v_ids text[] := '{}';
  v_option_ids text[];
  v_type text;
  v_id text;
  v_key text;
  v_scope text;
  v_n integer;
begin
  if jsonb_typeof(p_schema) <> 'object' or exists (select 1 from jsonb_object_keys(p_schema) k where k not in ('sections', 'questions')) then
    perform private.form_invalid('schema');
  end if;
  if jsonb_typeof(p_schema -> 'sections') <> 'array' or jsonb_array_length(p_schema -> 'sections') not between 1 and 10 then
    perform private.form_invalid('sections');
  end if;
  if jsonb_typeof(p_schema -> 'questions') <> 'array' or jsonb_array_length(p_schema -> 'questions') > 80 then
    perform private.form_invalid('questions');
  end if;

  for v_section in select value from jsonb_array_elements(p_schema -> 'sections') loop
    if jsonb_typeof(v_section) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_section) k where k not in ('id', 'title', 'description'))
       or coalesce(v_section ->> 'id', '') !~ '^[a-z0-9_]{1,40}$'
       or (v_section ->> 'id') = any (v_sections)
       or jsonb_typeof(v_section -> 'title') is distinct from 'string'
       or char_length(btrim(v_section ->> 'title')) not between 1 and 80
       or (v_section ? 'description' and (jsonb_typeof(v_section -> 'description') <> 'string'
                                           or char_length(v_section ->> 'description') > 300)) then
      perform private.form_invalid('section ' || coalesce(v_section ->> 'id', '?'));
    end if;
    v_sections := v_sections || (v_section ->> 'id');
  end loop;

  for v_question in select value from jsonb_array_elements(p_schema -> 'questions') loop
    v_id := v_question ->> 'id';
    v_type := v_question ->> 'type';
    if jsonb_typeof(v_question) <> 'object' or coalesce(v_id, '') !~ '^[a-z0-9_]{1,40}$' or v_id = any (v_ids) then
      perform private.form_invalid('question id ' || coalesce(v_id, '?'));
    end if;
    v_ids := v_ids || v_id;
    if v_type is null or v_type not in ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'yes_no',
                                         'number', 'date', 'url', 'file', 'cv') then
      perform private.form_invalid(v_id || ': type');
    end if;
    for v_key in select jsonb_object_keys(v_question) loop
      if not v_key = any (private.form_question_keys(v_type)) then
        perform private.form_invalid(v_id || ': ' || left(v_key, 40));
      end if;
    end loop;
    if jsonb_typeof(v_question -> 'label') is distinct from 'string' or char_length(btrim(v_question ->> 'label')) not between 1 and 300
       or v_question ->> 'label' ~ '[[:cntrl:]]' then
      perform private.form_invalid(v_id || ': label');
    end if;
    if v_question ? 'help' and (jsonb_typeof(v_question -> 'help') <> 'string' or char_length(v_question ->> 'help') > 500) then
      perform private.form_invalid(v_id || ': help');
    end if;
    if jsonb_typeof(v_question -> 'required') is distinct from 'boolean' then
      perform private.form_invalid(v_id || ': required');
    end if;
    -- Who is asked: everyone ("shared", in one of the sections) or one position of this campaign.
    v_scope := v_question ->> 'scope';
    if v_scope = 'shared' then
      if not coalesce(v_question ->> 'section', '') = any (v_sections) then
        perform private.form_invalid(v_id || ': section');
      end if;
    elsif v_scope ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      if not exists (select 1 from public.recruitment_positions p where p.id = v_scope::uuid and p.campaign_id = p_campaign_id) then
        perform private.form_invalid(v_id || ': scope');
      end if;
      if v_question ? 'section' and jsonb_typeof(v_question -> 'section') <> 'null' then
        perform private.form_invalid(v_id || ': section');
      end if;
    else
      perform private.form_invalid(v_id || ': scope');
    end if;

    if v_type in ('short_text', 'long_text') and v_question ? 'max_length' then
      if jsonb_typeof(v_question -> 'max_length') <> 'number'
         or (v_question ->> 'max_length')::numeric <> trunc((v_question ->> 'max_length')::numeric)
         or (v_question ->> 'max_length')::numeric not between 1 and (case v_type when 'short_text' then 300 else 10000 end) then
        perform private.form_invalid(v_id || ': max_length');
      end if;
    end if;

    if v_type in ('single_choice', 'multiple_choice') then
      if jsonb_typeof(v_question -> 'options') is distinct from 'array'
         or jsonb_array_length(v_question -> 'options') not between 2 and 30 then
        perform private.form_invalid(v_id || ': options');
      end if;
      v_option_ids := '{}';
      for v_option in select value from jsonb_array_elements(v_question -> 'options') loop
        if jsonb_typeof(v_option) <> 'object'
           or exists (select 1 from jsonb_object_keys(v_option) k where k not in ('id', 'label'))
           or coalesce(v_option ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' or (v_option ->> 'id') = any (v_option_ids)
           or jsonb_typeof(v_option -> 'label') is distinct from 'string'
           or char_length(btrim(v_option ->> 'label')) not between 1 and 120 or v_option ->> 'label' ~ '[[:cntrl:]]' then
          perform private.form_invalid(v_id || ': option');
        end if;
        v_option_ids := v_option_ids || (v_option ->> 'id');
      end loop;
      v_n := jsonb_array_length(v_question -> 'options');
      if v_type = 'multiple_choice' then
        if (v_question ? 'min_selected' and (jsonb_typeof(v_question -> 'min_selected') <> 'number'
                                             or (v_question ->> 'min_selected')::numeric not between 0 and v_n))
           or (v_question ? 'max_selected' and (jsonb_typeof(v_question -> 'max_selected') <> 'number'
                                                or (v_question ->> 'max_selected')::numeric not between 1 and v_n))
           or coalesce((v_question ->> 'min_selected')::numeric, 0) > coalesce((v_question ->> 'max_selected')::numeric, v_n) then
          perform private.form_invalid(v_id || ': selection');
        end if;
      end if;
    end if;

    if v_type = 'number' then
      if (v_question ? 'min' and (jsonb_typeof(v_question -> 'min') <> 'number' or abs((v_question ->> 'min')::numeric) > 1000000000))
         or (v_question ? 'max' and (jsonb_typeof(v_question -> 'max') <> 'number' or abs((v_question ->> 'max')::numeric) > 1000000000))
         or (v_question ? 'integer' and jsonb_typeof(v_question -> 'integer') <> 'boolean')
         or ((v_question ->> 'min')::numeric > (v_question ->> 'max')::numeric) then
        perform private.form_invalid(v_id || ': bounds');
      end if;
    end if;

    if v_type = 'date' then
      if (v_question ? 'min_date' and coalesce(v_question ->> 'min_date', '') !~ '^\d{4}-\d{2}-\d{2}$')
         or (v_question ? 'max_date' and coalesce(v_question ->> 'max_date', '') !~ '^\d{4}-\d{2}-\d{2}$')
         or ((v_question ->> 'min_date') > (v_question ->> 'max_date')) then
        perform private.form_invalid(v_id || ': dates');
      end if;
    end if;

    if v_type in ('file', 'cv') then
      if jsonb_typeof(v_question -> 'file_types') is distinct from 'array' or jsonb_array_length(v_question -> 'file_types') < 1
         or exists (select 1 from jsonb_array_elements(v_question -> 'file_types') t
                     where jsonb_typeof(t.value) <> 'string'
                        or (t.value #>> '{}') <> all (case when v_type = 'cv' then array['pdf', 'docx'] else array['pdf', 'docx', 'image'] end)) then
        perform private.form_invalid(v_id || ': file_types');
      end if;
      if v_question ? 'max_size_mb' and (jsonb_typeof(v_question -> 'max_size_mb') <> 'number'
                                         or (v_question ->> 'max_size_mb')::numeric not in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)) then
        perform private.form_invalid(v_id || ': max_size_mb');
      end if;
      if v_type = 'file' and v_question ? 'max_files' and (jsonb_typeof(v_question -> 'max_files') <> 'number'
                                                          or (v_question ->> 'max_files')::numeric not in (1, 2, 3, 4, 5)) then
        perform private.form_invalid(v_id || ': max_files');
      end if;
    end if;
  end loop;

  if (select count(*) from jsonb_array_elements(p_schema -> 'questions') q where q.value ->> 'type' = 'cv') > 1 then
    perform private.form_invalid('cv');
  end if;
end;
$$;

-- The questions a candidate to this position answers (shared ones + this position's), in order.
create or replace function private.form_questions(p_schema jsonb, p_position_id uuid)
returns setof jsonb
language sql
immutable
set search_path = ''
as $$
  select q.value
    from jsonb_array_elements(coalesce(p_schema -> 'questions', '[]'::jsonb)) with ordinality as q (value, n)
   where q.value ->> 'scope' = 'shared' or q.value ->> 'scope' = p_position_id::text
   order by q.n;
$$;

-- The form as the candidate to this position sees it.
create or replace function private.form_for_position(p_schema jsonb, p_position_id uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'sections', coalesce(p_schema -> 'sections', '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(q) from private.form_questions(p_schema, p_position_id) q), '[]'::jsonb));
$$;

-- Keeps only answers to questions this candidate is asked (and never files: those are documents).
create or replace function private.clean_answers(p_schema jsonb, p_position_id uuid, p_answers jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end) a
   where exists (select 1 from private.form_questions(p_schema, p_position_id) q
                  where q ->> 'id' = a.key and q ->> 'type' not in ('file', 'cv'))
     and jsonb_typeof(a.value) <> 'null';
$$;

-- Answers checked against the form version: {question_id: error}. With p_final,
-- required questions, minimum selections and required documents count too.
-- Error codes: required, wrong_type, too_long, invalid_option, too_few, too_many,
-- out_of_range, not_integer, invalid_date, invalid_url, too_many_files.
create or replace function private.application_answer_errors(
  p_schema jsonb, p_position_id uuid, p_answers jsonb, p_documents jsonb, p_final boolean
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_q jsonb;
  v_id text;
  v_type text;
  v_value jsonb;
  v_text text;
  v_errors jsonb := '{}'::jsonb;
  v_count integer;
  v_options text[];
  v_num numeric;
  v_date date;
  v_required boolean;
begin
  for v_q in select * from private.form_questions(p_schema, p_position_id) loop
    v_id := v_q ->> 'id';
    v_type := v_q ->> 'type';
    v_required := coalesce((v_q ->> 'required')::boolean, false);
    if v_type in ('file', 'cv') then
      v_count := coalesce((p_documents ->> v_id)::integer, 0);
      if p_final and v_required and v_count = 0 then
        v_errors := v_errors || jsonb_build_object(v_id, 'required');
      elsif v_count > (case when v_type = 'cv' then 1 else coalesce((v_q ->> 'max_files')::integer, 1) end) then
        v_errors := v_errors || jsonb_build_object(v_id, 'too_many_files');
      end if;
      continue;
    end if;

    v_value := p_answers -> v_id;
    if v_value is null or jsonb_typeof(v_value) = 'null'
       or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '')
       or (jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) = 0) then
      if p_final and v_required then
        v_errors := v_errors || jsonb_build_object(v_id, 'required');
      end if;
      continue;
    end if;

    if v_type in ('short_text', 'long_text') then
      if jsonb_typeof(v_value) <> 'string' then
        v_errors := v_errors || jsonb_build_object(v_id, 'wrong_type');
      elsif char_length(btrim(v_value #>> '{}'))
            > coalesce((v_q ->> 'max_length')::integer, case when v_type = 'short_text' then 150 else 2000 end) then
        v_errors := v_errors || jsonb_build_object(v_id, 'too_long');
      end if;
    elsif v_type = 'single_choice' then
      v_options := array(select o ->> 'id' from jsonb_array_elements(v_q -> 'options') o);
      if jsonb_typeof(v_value) <> 'string' or not (v_value #>> '{}') = any (v_options) then
        v_errors := v_errors || jsonb_build_object(v_id, 'invalid_option');
      end if;
    elsif v_type = 'multiple_choice' then
      v_options := array(select o ->> 'id' from jsonb_array_elements(v_q -> 'options') o);
      if jsonb_typeof(v_value) <> 'array'
         or exists (select 1 from jsonb_array_elements(v_value) e where jsonb_typeof(e) <> 'string' or not (e #>> '{}') = any (v_options))
         or (select count(*) from jsonb_array_elements(v_value)) <> (select count(distinct e #>> '{}') from jsonb_array_elements(v_value) e) then
        v_errors := v_errors || jsonb_build_object(v_id, 'invalid_option');
      elsif jsonb_array_length(v_value) > coalesce((v_q ->> 'max_selected')::integer, jsonb_array_length(v_q -> 'options')) then
        v_errors := v_errors || jsonb_build_object(v_id, 'too_many');
      elsif p_final and jsonb_array_length(v_value) < coalesce((v_q ->> 'min_selected')::integer, 0) then
        v_errors := v_errors || jsonb_build_object(v_id, 'too_few');
      end if;
    elsif v_type = 'yes_no' then
      if jsonb_typeof(v_value) <> 'boolean' then
        v_errors := v_errors || jsonb_build_object(v_id, 'wrong_type');
      end if;
    elsif v_type = 'number' then
      if jsonb_typeof(v_value) <> 'number' then
        v_errors := v_errors || jsonb_build_object(v_id, 'wrong_type');
      else
        v_num := (v_value #>> '{}')::numeric;
        if coalesce((v_q ->> 'integer')::boolean, false) and v_num <> trunc(v_num) then
          v_errors := v_errors || jsonb_build_object(v_id, 'not_integer');
        elsif v_num < coalesce((v_q ->> 'min')::numeric, -1000000000) or v_num > coalesce((v_q ->> 'max')::numeric, 1000000000) then
          v_errors := v_errors || jsonb_build_object(v_id, 'out_of_range');
        end if;
      end if;
    elsif v_type = 'date' then
      v_text := v_value #>> '{}';
      if jsonb_typeof(v_value) <> 'string' or v_text !~ '^\d{4}-\d{2}-\d{2}$' then
        v_errors := v_errors || jsonb_build_object(v_id, 'invalid_date');
      else
        begin
          v_date := v_text::date;
          if to_char(v_date, 'YYYY-MM-DD') <> v_text then
            v_errors := v_errors || jsonb_build_object(v_id, 'invalid_date');
          elsif (v_q ? 'min_date' and v_text < v_q ->> 'min_date') or (v_q ? 'max_date' and v_text > v_q ->> 'max_date') then
            v_errors := v_errors || jsonb_build_object(v_id, 'out_of_range');
          end if;
        exception when others then
          v_errors := v_errors || jsonb_build_object(v_id, 'invalid_date');
        end;
      end if;
    elsif v_type = 'url' then
      v_text := v_value #>> '{}';
      if jsonb_typeof(v_value) <> 'string' or char_length(v_text) > 500 or v_text !~* '^https?://[^[:space:]/?#@]+\.[^[:space:]/?#@]+([/?#][^[:space:]]*)?$' then
        v_errors := v_errors || jsonb_build_object(v_id, 'invalid_url');
      end if;
    end if;
  end loop;
  return v_errors;
end;
$$;

-- Ready documents of an application, counted per question.
create or replace function private.application_document_counts(p_application_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.question_id, x.n), '{}'::jsonb)
    from (select question_id, count(*) as n from public.application_documents
           where application_id = p_application_id and status = 'ready' group by question_id) as x;
$$;

-- Can this student apply to this position? null, or the refusal.
create or replace function private.application_eligibility(
  p_actor uuid, p_position public.recruitment_positions, p_campaign public.recruitment_campaigns
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_years smallint[] := coalesce(p_position.eligible_years, p_campaign.eligible_years);
begin
  select * into v_profile from public.profiles where id = p_actor;
  if not found or v_profile.onboarding_completed_at is null then
    return 'profile_incomplete';
  end if;
  if v_years is not null and (v_profile.study_year is null or not v_profile.study_year = any (v_years)) then
    return 'not_eligible';
  end if;
  return null;
end;
$$;

-- Why an application cannot be started or submitted now, or null.
create or replace function private.position_refusal(p_position public.recruitment_positions, p_campaign public.recruitment_campaigns)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  if not private.campaign_is_public(p_campaign) then
    return 'campaign_not_found';
  end if;
  v_state := private.campaign_state(p_campaign);
  if v_state = 'cancelled' then
    return 'campaign_cancelled';
  elsif v_state = 'paused' then
    return 'campaign_paused';
  elsif v_state = 'upcoming' then
    return 'campaign_not_open';
  elsif v_state <> 'open' then
    return 'campaign_closed';
  end if;
  if p_position.retired_at is not null or now() >= private.position_closes(p_position, p_campaign) then
    return 'position_closed';
  end if;
  return null;
end;
$$;

-- What a message about an application says (public facts only).
create or replace function private.application_message_payload(p_application public.applications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', c.title, 'slug', c.slug, 'position', p.title, 'position_slug', p.slug,
    'organization', coalesce(o.short_name, o.name), 'reference', p_application.reference,
    'closes_at', private.position_closes(p, c))
    from public.recruitment_campaigns c
    join public.recruitment_positions p on p.id = p_application.position_id
    join public.organizations o on o.id = c.organization_id
   where c.id = p_application.campaign_id;
$$;

create or replace function private.enqueue_application_message(p_application public.applications, p_kind text, p_key text, p_extra jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_outbox (recipient_id, kind, application_id, payload, dedupe_key)
  values (p_application.candidate_id, p_kind, p_application.id,
          private.application_message_payload(p_application) || coalesce(p_extra, '{}'::jsonb), p_key)
  on conflict (dedupe_key) do nothing;
$$;

-- ---- Campaigns: the team ----------------------------------------------------------------------

create or replace function public.create_recruitment_campaign(p_organization_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_title text := left(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), 120);
  v_id uuid;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'recruitment.campaigns.manage');
  if (select count(*) from public.recruitment_campaigns
       where organization_id = p_organization_id and publication = 'draft' and first_published_at is null) >= 10 then
    raise exception 'campaign_limit' using errcode = 'P0001';
  end if;
  insert into public.recruitment_campaigns (organization_id, title, created_by, updated_by)
  values (p_organization_id, v_title, v_actor, v_actor)
  returning id into v_id;
  insert into public.recruitment_form_versions (campaign_id, number, created_by, updated_by)
  values (v_id, 1, v_actor, v_actor);
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'recruitment.campaigns.manage'), 'recruitment_campaign_created',
    'recruitment', p_organization_id, null, 'recruitment_campaign', v_id, jsonb_build_object('title', v_title));
  return v_id;
end;
$$;

-- Saves campaign fields (a whitelist). A published campaign's dates, eligibility and
-- application limit change only with recruitment.campaigns.publish, and its
-- closing never moves into the past (closing early is close, below).
create or replace function public.save_recruitment_campaign(p_campaign_id uuid, p_version integer, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_old public.recruitment_campaigns%rowtype;
  v_new public.recruitment_campaigns%rowtype;
  v_allowed text[] := array['title', 'summary', 'description', 'cover_media_id', 'academic_year', 'opens_at', 'closes_at',
                            'max_applications', 'eligible_years', 'eligibility_note', 'contact_name', 'contact_role',
                            'contact_email', 'process', 'faq'];
  v_material boolean;
  v_item jsonb;
begin
  v_old := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.manage', true);
  if v_old.version <> p_version then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  if v_old.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_object_keys(p_patch) k where not k = any (v_allowed)) then
    raise exception 'campaign_invalid' using errcode = 'P0001';
  end if;

  v_new := jsonb_populate_record(v_old, p_patch);
  v_new.title := btrim(regexp_replace(coalesce(v_new.title, ''), '\s+', ' ', 'g'));

  if v_new.cover_media_id is distinct from v_old.cover_media_id and v_new.cover_media_id is not null
     and not exists (select 1 from public.association_media m
                      where m.id = v_new.cover_media_id and m.organization_id = v_old.organization_id and m.removed_at is null) then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(v_new.process, '[]'::jsonb)) loop
    if jsonb_typeof(v_item) <> 'object' or exists (select 1 from jsonb_object_keys(v_item) k where k not in ('label', 'detail', 'date'))
       or char_length(btrim(coalesce(v_item ->> 'label', ''))) not between 1 and 80
       or char_length(coalesce(v_item ->> 'detail', '')) > 300
       or (v_item ? 'date' and coalesce(v_item ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception 'campaign_invalid' using errcode = 'P0001';
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_new.faq, '[]'::jsonb)) loop
    if jsonb_typeof(v_item) <> 'object' or exists (select 1 from jsonb_object_keys(v_item) k where k not in ('question', 'answer'))
       or char_length(btrim(coalesce(v_item ->> 'question', ''))) not between 1 and 200
       or char_length(btrim(coalesce(v_item ->> 'answer', ''))) not between 1 and 1000 then
      raise exception 'campaign_invalid' using errcode = 'P0001';
    end if;
  end loop;

  v_material := v_old.first_published_at is not null
    and (v_new.opens_at is distinct from v_old.opens_at or v_new.closes_at is distinct from v_old.closes_at
         or v_new.eligible_years is distinct from v_old.eligible_years or v_new.max_applications <> v_old.max_applications);
  if v_material then
    perform private.require_organization_permission(v_actor, v_old.organization_id, 'recruitment.campaigns.publish');
    if v_new.closes_at is distinct from v_old.closes_at and v_new.closes_at <= now() then
      raise exception 'campaign_dates_invalid' using errcode = 'P0001';
    end if;
  end if;
  if v_new.opens_at is not null and v_new.closes_at is not null and v_new.closes_at <= v_new.opens_at then
    raise exception 'campaign_dates_invalid' using errcode = 'P0001';
  end if;
  -- A position closing earlier must still close before (or with) the campaign.
  if v_new.closes_at is not null and exists (select 1 from public.recruitment_positions p
                                              where p.campaign_id = p_campaign_id and p.closes_at > v_new.closes_at) then
    raise exception 'campaign_dates_invalid' using errcode = 'P0001';
  end if;

  update public.recruitment_campaigns
     set title = v_new.title, summary = v_new.summary, description = v_new.description, cover_media_id = v_new.cover_media_id,
         academic_year = v_new.academic_year, opens_at = v_new.opens_at, closes_at = v_new.closes_at,
         max_applications = v_new.max_applications, eligible_years = v_new.eligible_years,
         eligibility_note = v_new.eligibility_note, contact_name = v_new.contact_name, contact_role = v_new.contact_role,
         contact_email = v_new.contact_email, process = coalesce(v_new.process, '[]'::jsonb), faq = coalesce(v_new.faq, '[]'::jsonb),
         version = version + 1, updated_by = v_actor
   where id = p_campaign_id
  returning * into v_new;

  if v_old.first_published_at is not null then
    perform private.log_governance_event(
      v_actor, private.authority_for(v_actor, v_old.organization_id,
                                     case when v_material then 'recruitment.campaigns.publish' else 'recruitment.campaigns.manage' end),
      case when v_material then 'recruitment_campaign_rescheduled' else 'recruitment_campaign_updated' end, 'recruitment',
      v_old.organization_id, null, 'recruitment_campaign', p_campaign_id,
      case when v_material then jsonb_build_object(
        'before', jsonb_build_object('opens_at', v_old.opens_at, 'closes_at', v_old.closes_at,
                                     'eligible_years', v_old.eligible_years, 'max_applications', v_old.max_applications),
        'after', jsonb_build_object('opens_at', v_new.opens_at, 'closes_at', v_new.closes_at,
                                    'eligible_years', v_new.eligible_years, 'max_applications', v_new.max_applications))
      else jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)) end);
  end if;
  return jsonb_build_object('version', v_new.version);
end;
$$;

-- ---- Positions --------------------------------------------------------------------------------

create or replace function public.add_recruitment_position(p_campaign_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_title text := left(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), 80);
  v_id uuid;
begin
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.manage', true);
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  if char_length(v_title) < 1 then
    raise exception 'position_invalid' using errcode = 'P0001';
  end if;
  if (select count(*) from public.recruitment_positions where campaign_id = p_campaign_id) >= 20 then
    raise exception 'position_limit' using errcode = 'P0001';
  end if;
  insert into public.recruitment_positions (campaign_id, title, slug, display_order)
  values (p_campaign_id, v_title, private.unique_position_slug(v_title, p_campaign_id, null),
          coalesce((select max(display_order) + 1 from public.recruitment_positions where campaign_id = p_campaign_id), 0))
  returning id into v_id;
  update public.recruitment_campaigns set version = version + 1, updated_by = v_actor where id = p_campaign_id;
  if v_campaign.first_published_at is not null then
    perform private.log_governance_event(
      v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.manage'),
      'recruitment_position_created', 'recruitment', v_campaign.organization_id, null, 'recruitment_position', v_id,
      jsonb_build_object('campaign', p_campaign_id, 'title', v_title));
  end if;
  return v_id;
end;
$$;

create or replace function public.save_recruitment_position(p_position_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_old public.recruitment_positions%rowtype;
  v_new public.recruitment_positions%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_allowed text[] := array['title', 'team', 'summary', 'description', 'missions', 'expectations', 'commitment',
                            'openings', 'closes_at', 'eligible_years', 'template_key'];
begin
  select * into v_old from public.recruitment_positions where id = p_position_id for update;
  if not found then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  v_campaign := private.campaign_for(v_actor, v_old.campaign_id, 'recruitment.campaigns.manage', true);
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_object_keys(p_patch) k where not k = any (v_allowed)) then
    raise exception 'position_invalid' using errcode = 'P0001';
  end if;
  v_new := jsonb_populate_record(v_old, p_patch);
  v_new.title := btrim(regexp_replace(coalesce(v_new.title, ''), '\s+', ' ', 'g'));
  if char_length(v_new.title) < 1 then
    raise exception 'position_invalid' using errcode = 'P0001';
  end if;
  if v_new.closes_at is not null and (v_campaign.closes_at is null or v_new.closes_at > v_campaign.closes_at
                                      or (v_campaign.opens_at is not null and v_new.closes_at <= v_campaign.opens_at)) then
    raise exception 'campaign_dates_invalid' using errcode = 'P0001';
  end if;
  if v_campaign.first_published_at is not null
     and (v_new.closes_at is distinct from v_old.closes_at or v_new.eligible_years is distinct from v_old.eligible_years) then
    perform private.require_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish');
    if v_new.closes_at is distinct from v_old.closes_at and v_new.closes_at <= now() then
      raise exception 'campaign_dates_invalid' using errcode = 'P0001';
    end if;
  end if;
  if v_new.template_key is not null and not exists (select 1 from public.position_templates t
                                                     where t.key = v_new.template_key and t.office is null) then
    raise exception 'position_invalid' using errcode = 'P0001';
  end if;

  update public.recruitment_positions
     set title = v_new.title, team = v_new.team, summary = v_new.summary, description = v_new.description,
         missions = v_new.missions, expectations = v_new.expectations, commitment = v_new.commitment,
         openings = v_new.openings, closes_at = v_new.closes_at, eligible_years = v_new.eligible_years,
         template_key = v_new.template_key,
         -- The address follows the title until the campaign first goes online, then stays.
         slug = case when v_campaign.first_published_at is null and v_new.title <> v_old.title
                     then private.unique_position_slug(v_new.title, v_old.campaign_id, p_position_id) else slug end
   where id = p_position_id;
  update public.recruitment_campaigns set version = version + 1, updated_by = v_actor where id = v_old.campaign_id;
  if v_campaign.first_published_at is not null then
    perform private.log_governance_event(
      v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.manage'),
      'recruitment_position_updated', 'recruitment', v_campaign.organization_id, null, 'recruitment_position', p_position_id,
      jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  end if;
end;
$$;

create or replace function public.move_recruitment_position(p_position_id uuid, p_direction integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_position public.recruitment_positions%rowtype;
  v_other public.recruitment_positions%rowtype;
begin
  select * into v_position from public.recruitment_positions where id = p_position_id;
  if not found then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  perform private.campaign_for(v_actor, v_position.campaign_id, 'recruitment.campaigns.manage', true);
  if p_direction < 0 then
    select * into v_other from public.recruitment_positions
     where campaign_id = v_position.campaign_id and (display_order, id) < (v_position.display_order, v_position.id)
     order by display_order desc, id desc limit 1;
  else
    select * into v_other from public.recruitment_positions
     where campaign_id = v_position.campaign_id and (display_order, id) > (v_position.display_order, v_position.id)
     order by display_order, id limit 1;
  end if;
  if not found then
    return;
  end if;
  -- Renumber the whole list, then swap, so equal orders never stall a move.
  update public.recruitment_positions p set display_order = x.n
    from (select id, row_number() over (order by display_order, id) as n
            from public.recruitment_positions where campaign_id = v_position.campaign_id) as x
   where p.id = x.id;
  update public.recruitment_positions p
     set display_order = case when p.id = v_position.id then (select display_order from public.recruitment_positions where id = v_other.id)
                              else (select display_order from public.recruitment_positions where id = v_position.id) end
   where p.id in (v_position.id, v_other.id);
end;
$$;

-- Deletes a position nobody applied to (its questions leave the draft form);
-- one that received applications is retired instead: closed to new
-- applications, off the public pages, kept with its applications.
create or replace function public.remove_recruitment_position(p_position_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_position public.recruitment_positions%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_draft public.recruitment_form_versions%rowtype;
begin
  select * into v_position from public.recruitment_positions where id = p_position_id for update;
  if not found then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  v_campaign := private.campaign_for(v_actor, v_position.campaign_id, 'recruitment.campaigns.manage', true);
  if v_campaign.publication = 'published' and v_position.retired_at is null
     and not exists (select 1 from public.recruitment_positions p
                      where p.campaign_id = v_campaign.id and p.id <> p_position_id and p.retired_at is null) then
    raise exception 'campaign_needs_position' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.applications a where a.position_id = p_position_id)
     or exists (select 1 from public.recruitment_form_versions f
                 where f.campaign_id = v_campaign.id and f.status <> 'draft'
                   and exists (select 1 from jsonb_array_elements(f.schema -> 'questions') q where q.value ->> 'scope' = p_position_id::text)) then
    if v_campaign.first_published_at is not null then
      perform private.require_organization_permission(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish');
    end if;
    update public.recruitment_positions set retired_at = coalesce(retired_at, now()) where id = p_position_id;
    perform private.log_governance_event(
      v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.manage'),
      'recruitment_position_retired', 'recruitment', v_campaign.organization_id, null, 'recruitment_position', p_position_id,
      jsonb_build_object('title', v_position.title));
    update public.recruitment_campaigns set version = version + 1, updated_by = v_actor where id = v_campaign.id;
    return 'retired';
  end if;

  -- Its questions leave the draft form; published versions never named it (checked above).
  select * into v_draft from public.recruitment_form_versions where campaign_id = v_campaign.id and status = 'draft' for update;
  if found then
    update public.recruitment_form_versions
       set schema = jsonb_set(schema, '{questions}', coalesce((
             select jsonb_agg(q.value order by q.n)
               from jsonb_array_elements(schema -> 'questions') with ordinality as q (value, n)
              where q.value ->> 'scope' <> p_position_id::text), '[]'::jsonb)),
           edit_version = edit_version + 1, updated_by = v_actor
     where id = v_draft.id;
  end if;
  delete from public.recruitment_positions where id = p_position_id;
  update public.recruitment_campaigns set version = version + 1, updated_by = v_actor where id = v_campaign.id;
  if v_campaign.first_published_at is not null then
    perform private.log_governance_event(
      v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.manage'),
      'recruitment_position_deleted', 'recruitment', v_campaign.organization_id, null, 'recruitment_position', p_position_id,
      jsonb_build_object('title', v_position.title));
  end if;
  return 'deleted';
end;
$$;

-- ---- Forms -------------------------------------------------------------------------------------

-- Saves the draft form (created from the live version when there is none). The
-- builder sends the edit_version it loaded: a teammate's newer save is never
-- overwritten (draft_conflict).
create or replace function public.save_recruitment_form(p_campaign_id uuid, p_edit_version integer, p_schema jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_draft public.recruitment_form_versions%rowtype;
begin
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.questions.manage', true);
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  perform private.validate_form_schema(p_schema, p_campaign_id);

  select * into v_draft from public.recruitment_form_versions where campaign_id = p_campaign_id and status = 'draft' for update;
  if not found then
    if p_edit_version <> 0 then
      raise exception 'draft_conflict' using errcode = 'P0001';
    end if;
    insert into public.recruitment_form_versions (campaign_id, number, schema, created_by, updated_by)
    values (p_campaign_id, coalesce((select max(number) + 1 from public.recruitment_form_versions where campaign_id = p_campaign_id), 1),
            p_schema, v_actor, v_actor)
    returning * into v_draft;
  else
    if v_draft.edit_version <> p_edit_version then
      raise exception 'draft_conflict' using errcode = 'P0001';
    end if;
    update public.recruitment_form_versions
       set schema = p_schema, edit_version = edit_version + 1, updated_by = v_actor
     where id = v_draft.id
    returning * into v_draft;
  end if;
  return jsonb_build_object('form_version_id', v_draft.id, 'number', v_draft.number, 'edit_version', v_draft.edit_version);
end;
$$;

-- Throws the draft away (the live version stays). Only once a version is live.
create or replace function public.discard_recruitment_form_draft(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
begin
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.questions.manage', true);
  if v_campaign.active_form_version_id is null then
    raise exception 'form_not_live' using errcode = 'P0001';
  end if;
  delete from public.recruitment_form_versions where campaign_id = p_campaign_id and status = 'draft';
end;
$$;

-- Makes the draft the version new applicants answer. Submitted applications
-- keep the version they answered; drafts move to the new one at their next
-- opening (refresh_application_form), and their candidates are told.
create or replace function private.publish_form_draft(p_actor uuid, p_campaign public.recruitment_campaigns)
returns public.recruitment_form_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.recruitment_form_versions%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_draft from public.recruitment_form_versions where campaign_id = p_campaign.id and status = 'draft' for update;
  if not found then
    raise exception 'form_no_draft' using errcode = 'P0001';
  end if;
  perform private.validate_form_schema(v_draft.schema, p_campaign.id);
  update public.recruitment_form_versions set status = 'superseded', superseded_at = now()
   where campaign_id = p_campaign.id and status = 'published';
  update public.recruitment_form_versions set status = 'published', published_at = now(), published_by = p_actor
   where id = v_draft.id
  returning * into v_draft;
  update public.recruitment_campaigns set active_form_version_id = v_draft.id, version = version + 1, updated_by = p_actor
   where id = p_campaign.id;
  for v_app in select * from public.applications where campaign_id = p_campaign.id and status = 'draft' and form_version_id <> v_draft.id loop
    perform private.enqueue_application_message(v_app, 'application_form_updated', 'app:' || v_app.id || ':form:' || v_draft.number);
  end loop;
  return v_draft;
end;
$$;

create or replace function public.publish_recruitment_form(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_version public.recruitment_form_versions%rowtype;
  v_previous integer;
begin
  perform private.require_aal2();
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.publish', true);
  if v_campaign.first_published_at is null then
    raise exception 'form_not_live' using errcode = 'P0001';
  end if;
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  v_previous := (select count(*) from public.applications where campaign_id = p_campaign_id and status <> 'draft');
  v_version := private.publish_form_draft(v_actor, v_campaign);
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish'),
    'recruitment_form_published', 'recruitment', v_campaign.organization_id, null, 'recruitment_form', v_version.id,
    jsonb_build_object('campaign', p_campaign_id, 'number', v_version.number, 'applications_on_earlier_versions', v_previous));
  return jsonb_build_object('number', v_version.number, 'applications_on_earlier_versions', v_previous);
end;
$$;

-- ---- Publication and operations ----------------------------------------------------------------

create or replace function public.publish_recruitment_campaign(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_blocker text;
  v_slug text;
begin
  perform private.require_aal2();
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.publish', true);
  if v_campaign.publication = 'published' then
    return v_campaign.slug;
  end if;
  v_blocker := private.recruitment_blocker(v_campaign);
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001';
  end if;
  if v_campaign.active_form_version_id is null then
    perform private.publish_form_draft(v_actor, v_campaign);
  end if;
  v_slug := coalesce(v_campaign.slug, private.unique_campaign_slug(v_campaign.title, p_campaign_id));
  update public.recruitment_campaigns
     set publication = 'published', slug = v_slug, published_at = now(),
         first_published_at = coalesce(first_published_at, now()), version = version + 1, updated_by = v_actor
   where id = p_campaign_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish'),
    'recruitment_campaign_published', 'recruitment', v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
    jsonb_build_object('slug', v_slug, 'first', v_campaign.first_published_at is null));
  return v_slug;
end;
$$;

-- Off the site. Not once someone submitted: pause, close or cancel instead, so
-- their application keeps a campaign they can read.
create or replace function public.unpublish_recruitment_campaign(p_campaign_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
begin
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.publish', true);
  if v_campaign.publication <> 'published' then
    raise exception 'campaign_not_published' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.applications where campaign_id = p_campaign_id and status <> 'draft') then
    raise exception 'campaign_has_applications' using errcode = 'P0001';
  end if;
  update public.recruitment_campaigns
     set publication = 'unpublished', unpublished_at = now(), version = version + 1, updated_by = v_actor
   where id = p_campaign_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish'),
    'recruitment_campaign_unpublished', 'recruitment', v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
    '{}'::jsonb, nullif(btrim(coalesce(p_reason, '')), ''));
end;
$$;

-- Pause (no new submission, the page says so), resume, close early or reopen.
-- Resuming never reopens past the closing date: the dates still decide.
create or replace function public.set_recruitment_status(p_campaign_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_action text;
begin
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.publish', true);
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  if p_status not in ('scheduled', 'paused', 'closed') then
    raise exception 'campaign_invalid' using errcode = 'P0001';
  end if;
  if v_campaign.publication <> 'published' then
    raise exception 'campaign_not_published' using errcode = 'P0001';
  end if;
  if p_status = v_campaign.status then
    return private.campaign_state(v_campaign);
  end if;
  if p_status = 'scheduled' and v_campaign.closes_at <= now() then
    raise exception 'campaign_closed' using errcode = 'P0001';
  end if;
  v_action := case p_status when 'paused' then 'recruitment_campaign_paused'
                            when 'closed' then 'recruitment_campaign_closed'
                            else case when v_campaign.status = 'closed' then 'recruitment_campaign_reopened'
                                      else 'recruitment_campaign_resumed' end end;
  update public.recruitment_campaigns
     set status = p_status,
         paused_at = case when p_status = 'paused' then now() else paused_at end,
         closed_at = case when p_status = 'closed' then now() when p_status = 'scheduled' then null else closed_at end,
         version = version + 1, updated_by = v_actor
   where id = p_campaign_id
  returning * into v_campaign;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish'),
    v_action, 'recruitment', v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id, '{}'::jsonb);
  return private.campaign_state(v_campaign);
end;
$$;

-- Irreversible. Applications are kept (never deleted by a cancellation); every
-- candidate with a draft or a submitted application is told, with the reason.
create or replace function public.cancel_recruitment_campaign(p_campaign_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_reason text := private.require_reason(p_reason);
  v_app public.applications%rowtype;
  v_count integer := 0;
begin
  perform private.require_aal2();
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.publish', true);
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  if v_campaign.first_published_at is null then
    raise exception 'campaign_not_published' using errcode = 'P0001';
  end if;
  update public.recruitment_campaigns
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancellation_reason = v_reason,
         version = version + 1, updated_by = v_actor
   where id = p_campaign_id;
  for v_app in select * from public.applications where campaign_id = p_campaign_id and status in ('draft', 'submitted') loop
    perform private.enqueue_application_message(v_app, 'recruitment_cancelled', 'app:' || v_app.id || ':cancelled',
                                                jsonb_build_object('reason', v_reason, 'was', v_app.status));
    v_count := v_count + 1;
  end loop;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish'),
    'recruitment_campaign_cancelled', 'recruitment', v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
    jsonb_build_object('notified', v_count), v_reason);
  return v_count;
end;
$$;

-- Out of the team's current list (a campaign that no longer takes applications).
create or replace function public.archive_recruitment_campaign(p_campaign_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
begin
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.publish', true);
  if p_archived and private.campaign_state(v_campaign) in ('open', 'upcoming', 'paused') then
    raise exception 'campaign_still_open' using errcode = 'P0001';
  end if;
  update public.recruitment_campaigns
     set archived_at = case when p_archived then coalesce(archived_at, now()) end, version = version + 1, updated_by = v_actor
   where id = p_campaign_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish'),
    case when p_archived then 'recruitment_campaign_archived' else 'recruitment_campaign_unarchived' end, 'recruitment',
    v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id, '{}'::jsonb);
end;
$$;

-- Only a campaign that was never online and has no application.
create or replace function public.delete_recruitment_draft(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
begin
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.manage', true);
  if v_campaign.first_published_at is not null or exists (select 1 from public.applications where campaign_id = p_campaign_id) then
    raise exception 'campaign_was_published' using errcode = 'P0001';
  end if;
  update public.recruitment_campaigns set active_form_version_id = null where id = p_campaign_id;
  delete from public.recruitment_campaigns where id = p_campaign_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.manage'),
    'recruitment_campaign_draft_deleted', 'recruitment', v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
    jsonb_build_object('title', v_campaign.title));
end;
$$;

-- Next year's campaign from this one: its texts, positions and form (the live
-- version, else the draft), as a new draft with no dates. Never an applicant,
-- an answer, a document, a reference or a decision.
create or replace function public.duplicate_recruitment_campaign(p_campaign_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_source public.recruitment_campaigns%rowtype;
  v_id uuid;
  v_schema jsonb;
  v_map jsonb := '{}'::jsonb;
  v_position public.recruitment_positions%rowtype;
  v_new_position uuid;
  v_title text := left(btrim(regexp_replace(coalesce(nullif(btrim(p_title), ''), ''), '\s+', ' ', 'g')), 120);
begin
  v_source := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.manage', false);
  if (select count(*) from public.recruitment_campaigns
       where organization_id = v_source.organization_id and publication = 'draft' and first_published_at is null) >= 10 then
    raise exception 'campaign_limit' using errcode = 'P0001';
  end if;
  insert into public.recruitment_campaigns (
    organization_id, title, summary, description, cover_media_id, academic_year, max_applications, eligible_years,
    eligibility_note, contact_name, contact_role, contact_email, process, faq, duplicated_from, created_by, updated_by)
  values (
    v_source.organization_id, coalesce(nullif(v_title, ''), v_source.title), v_source.summary, v_source.description,
    (select m.id from public.association_media m where m.id = v_source.cover_media_id and m.removed_at is null),
    null, v_source.max_applications, v_source.eligible_years, v_source.eligibility_note,
    v_source.contact_name, v_source.contact_role, v_source.contact_email,
    -- Process steps keep their wording, not their dates.
    coalesce((select jsonb_agg(s.value - 'date') from jsonb_array_elements(v_source.process) s), '[]'::jsonb),
    v_source.faq, p_campaign_id, v_actor, v_actor)
  returning id into v_id;

  for v_position in select * from public.recruitment_positions
                     where campaign_id = p_campaign_id and retired_at is null order by display_order, id loop
    insert into public.recruitment_positions (campaign_id, slug, title, team, summary, description, missions, expectations,
                                              commitment, openings, eligible_years, template_key, display_order)
    values (v_id, v_position.slug, v_position.title, v_position.team, v_position.summary, v_position.description,
            v_position.missions, v_position.expectations, v_position.commitment, v_position.openings,
            v_position.eligible_years, v_position.template_key, v_position.display_order)
    returning id into v_new_position;
    v_map := v_map || jsonb_build_object(v_position.id::text, v_new_position::text);
  end loop;

  v_schema := coalesce(
    (select schema from public.recruitment_form_versions where id = v_source.active_form_version_id),
    (select schema from public.recruitment_form_versions where campaign_id = p_campaign_id and status = 'draft'),
    '{"sections": [{"id": "s1", "title": "Ta candidature"}], "questions": []}'::jsonb);
  -- Questions of positions not carried over are left out; the others follow their position.
  v_schema := jsonb_set(v_schema, '{questions}', coalesce((
    select jsonb_agg(case when q.value ->> 'scope' = 'shared' then q.value
                          else jsonb_set(q.value, '{scope}', v_map -> (q.value ->> 'scope')) end order by q.n)
      from jsonb_array_elements(v_schema -> 'questions') with ordinality as q (value, n)
     where q.value ->> 'scope' = 'shared' or v_map ? (q.value ->> 'scope')), '[]'::jsonb));
  insert into public.recruitment_form_versions (campaign_id, number, schema, created_by, updated_by)
  values (v_id, 1, v_schema, v_actor, v_actor);

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_source.organization_id, 'recruitment.campaigns.manage'),
    'recruitment_campaign_duplicated', 'recruitment', v_source.organization_id, null, 'recruitment_campaign', v_id,
    jsonb_build_object('from', p_campaign_id));
  return v_id;
end;
$$;

create or replace function public.change_recruitment_slug(p_campaign_id uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  v_campaign := private.campaign_for(v_actor, p_campaign_id, 'recruitment.campaigns.publish', true);
  if v_campaign.slug is null then
    raise exception 'campaign_not_published' using errcode = 'P0001';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 100
     or v_slug = any (private.recruitment_reserved_slugs()) then
    raise exception 'slug_invalid' using errcode = 'P0001';
  end if;
  if v_slug = v_campaign.slug then
    return v_slug;
  end if;
  if exists (select 1 from public.recruitment_campaigns where slug = v_slug)
     or exists (select 1 from public.recruitment_campaign_slug_history where slug = v_slug and campaign_id <> p_campaign_id) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  delete from public.recruitment_campaign_slug_history where slug = v_slug;
  insert into public.recruitment_campaign_slug_history (slug, campaign_id) values (v_campaign.slug, p_campaign_id)
  on conflict (slug) do update set campaign_id = excluded.campaign_id, replaced_at = now();
  update public.recruitment_campaigns set slug = v_slug, version = version + 1, updated_by = v_actor where id = p_campaign_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'recruitment.campaigns.publish'),
    'recruitment_campaign_slug_changed', 'recruitment', v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
    jsonb_build_object('from', v_campaign.slug, 'to', v_slug));
  return v_slug;
end;
$$;

-- ---- BDE moderation and platform settings --------------------------------------------------------

-- Hidden: off the site and closed to applications, not cancelled. Only the BDE
-- restores it (republishing does not bypass it). Moderators never read applications.
create or replace function public.hide_recruitment_campaign(p_campaign_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_campaign public.recruitment_campaigns%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  perform private.require_aal2();
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id for update;
  if not found or v_campaign.first_published_at is null then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  if v_campaign.hidden_at is not null then
    raise exception 'campaign_hidden' using errcode = 'P0001';
  end if;
  update public.recruitment_campaigns
     set hidden_at = now(), hidden_by = v_actor, hidden_reason = v_reason, version = version + 1
   where id = p_campaign_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'recruitment_campaign_hidden', 'moderation', v_campaign.organization_id, null, 'recruitment_campaign',
    p_campaign_id, '{}'::jsonb, v_reason);
end;
$$;

create or replace function public.restore_recruitment_campaign(p_campaign_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_campaign public.recruitment_campaigns%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  perform private.require_aal2();
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id for update;
  if not found or v_campaign.hidden_at is null then
    raise exception 'campaign_not_hidden' using errcode = 'P0001';
  end if;
  update public.recruitment_campaigns
     set hidden_at = null, hidden_by = null, hidden_reason = null, version = version + 1
   where id = p_campaign_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'recruitment_campaign_restored', 'moderation', v_campaign.organization_id, null, 'recruitment_campaign',
    p_campaign_id, '{}'::jsonb, v_reason);
end;
$$;

-- The applicant privacy information and the retention periods the institution
-- decided. Written by the BDE's leadership (platform.organizations.manage).
create or replace function public.set_recruitment_settings(
  p_privacy_notice text, p_privacy_contact text,
  p_draft_months integer, p_withdrawn_months integer, p_submitted_months integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  update public.recruitment_settings
     set privacy_notice = nullif(btrim(coalesce(p_privacy_notice, '')), ''),
         privacy_contact = nullif(btrim(coalesce(p_privacy_contact, '')), ''),
         draft_retention_months = p_draft_months, withdrawn_retention_months = p_withdrawn_months,
         submitted_retention_months = p_submitted_months, updated_by = v_actor, updated_at = now()
   where id;
  perform private.log_governance_event(
    v_actor, 'bde', 'recruitment_settings_updated', 'recruitment', null, null, 'recruitment_settings', null,
    jsonb_build_object('draft_months', p_draft_months, 'withdrawn_months', p_withdrawn_months,
                       'submitted_months', p_submitted_months, 'notice', p_privacy_notice is not null));
end;
$$;

-- ---- The application engine ----------------------------------------------------------------------

-- Starts (or finds) the caller's application to a position. Idempotent: a second
-- click returns the same draft. Candidate identity comes from the session.
create or replace function public.start_application(p_position_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_position public.recruitment_positions%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_app public.applications%rowtype;
  v_refusal text;
begin
  select * into v_position from public.recruitment_positions where id = p_position_id;
  if not found then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  select * into v_campaign from public.recruitment_campaigns where id = v_position.campaign_id;
  -- One student, one campaign at a time: limits and duplicates are decided in order.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || v_campaign.id::text, 0));

  select * into v_app from public.applications
   where candidate_id = v_actor and position_id = p_position_id and status <> 'withdrawn';
  if found then
    return jsonb_build_object('application_id', v_app.id, 'status', v_app.status, 'already', true);
  end if;

  v_refusal := private.position_refusal(v_position, v_campaign);
  if v_refusal is not null then
    raise exception '%', v_refusal using errcode = 'P0001';
  end if;
  v_refusal := private.application_eligibility(v_actor, v_position, v_campaign);
  if v_refusal is not null then
    raise exception '%', v_refusal using errcode = 'P0001';
  end if;
  if (select count(*) from public.applications
       where candidate_id = v_actor and campaign_id = v_campaign.id and status <> 'withdrawn') >= v_campaign.max_applications then
    raise exception 'application_limit' using errcode = 'P0001';
  end if;
  if (select count(*) from public.applications where candidate_id = v_actor and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'application_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.applications (candidate_id, campaign_id, position_id, form_version_id)
  values (v_actor, v_campaign.id, p_position_id, v_campaign.active_form_version_id)
  returning * into v_app;
  insert into public.application_events (application_id, action) values (v_app.id, 'started');
  return jsonb_build_object('application_id', v_app.id, 'status', 'draft', 'already', false);
end;
$$;

-- The candidate's own draft, locked, or a refusal that says nothing about others'.
create or replace function private.my_draft(p_actor uuid, p_application_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
begin
  select * into v_app from public.applications where id = p_application_id and candidate_id = p_actor for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0001';
  end if;
  if v_app.status <> 'draft' then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  return v_app;
end;
$$;

-- Autosave. The version guards against a stale tab overwriting newer work
-- (draft_conflict). Answers of the wrong type or naming unknown options are
-- refused; lengths and bounds are reported, and enforced at submission.
create or replace function public.save_application_answers(p_application_id uuid, p_version integer, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_schema jsonb;
  v_clean jsonb;
  v_errors jsonb;
begin
  v_app := private.my_draft(v_actor, p_application_id);
  if v_app.version <> p_version then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' or pg_column_size(p_answers) > 250000 then
    raise exception 'answer_invalid' using errcode = 'P0001';
  end if;
  select schema into v_schema from public.recruitment_form_versions where id = v_app.form_version_id;
  v_clean := private.clean_answers(v_schema, v_app.position_id, p_answers);
  v_errors := private.application_answer_errors(v_schema, v_app.position_id, v_clean, '{}'::jsonb, false);
  if exists (select 1 from jsonb_each_text(v_errors) e where e.value in ('wrong_type', 'invalid_option', 'invalid_date')) then
    raise exception 'answer_invalid' using errcode = 'P0001',
      detail = (select string_agg(e.key, ',') from jsonb_each_text(v_errors) e where e.value in ('wrong_type', 'invalid_option', 'invalid_date'));
  end if;
  update public.applications set answers = v_clean, version = version + 1, last_saved_at = now()
   where id = p_application_id
  returning * into v_app;
  return jsonb_build_object('version', v_app.version, 'saved_at', v_app.last_saved_at, 'errors', v_errors);
end;
$$;

-- A draft started on an earlier form version moves to the live one: answers to
-- questions that still exist (same id and type, valid options) are kept, the
-- others dropped (and named in the result, for the candidate).
create or replace function public.refresh_application_form(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_live uuid;
  v_old jsonb;
  v_new jsonb;
  v_kept jsonb := '{}'::jsonb;
  v_dropped text[] := '{}';
  v_entry record;
  v_q jsonb;
  v_old_q jsonb;
begin
  v_app := private.my_draft(v_actor, p_application_id);
  select active_form_version_id into v_live from public.recruitment_campaigns where id = v_app.campaign_id;
  if v_live is null or v_live = v_app.form_version_id then
    return jsonb_build_object('changed', false, 'version', v_app.version);
  end if;
  select schema into v_old from public.recruitment_form_versions where id = v_app.form_version_id;
  select schema into v_new from public.recruitment_form_versions where id = v_live;
  for v_entry in select key, value from jsonb_each(v_app.answers) loop
    select q into v_q from private.form_questions(v_new, v_app.position_id) q where q ->> 'id' = v_entry.key;
    select q into v_old_q from private.form_questions(v_old, v_app.position_id) q where q ->> 'id' = v_entry.key;
    if v_q is not null and v_old_q is not null and v_q ->> 'type' = v_old_q ->> 'type'
       and coalesce(private.application_answer_errors(
             jsonb_build_object('sections', v_new -> 'sections', 'questions', jsonb_build_array(v_q)),
             v_app.position_id, jsonb_build_object(v_entry.key, v_entry.value), '{}'::jsonb, false) ->> v_entry.key, 'ok')
           in ('ok', 'too_long', 'too_many', 'out_of_range', 'not_integer') then
      v_kept := v_kept || jsonb_build_object(v_entry.key, v_entry.value);
    else
      v_dropped := v_dropped || v_entry.key;
    end if;
  end loop;
  -- Documents answering questions that left the form are removed (their files cleaned up).
  update public.application_documents d set status = 'removed', removed_at = now()
   where d.application_id = p_application_id and d.status <> 'removed'
     and not exists (select 1 from private.form_questions(v_new, v_app.position_id) q
                      where q ->> 'id' = d.question_id and q ->> 'type' in ('file', 'cv'));
  update public.applications set form_version_id = v_live, answers = v_kept, version = version + 1
   where id = p_application_id
  returning * into v_app;
  insert into public.application_events (application_id, action, details)
  values (p_application_id, 'form_updated', jsonb_build_object('dropped', to_jsonb(v_dropped)));
  return jsonb_build_object('changed', true, 'dropped', to_jsonb(v_dropped), 'version', v_app.version);
end;
$$;

-- A draft the candidate no longer wants: gone, with its files (queued for cleanup).
create or replace function public.delete_application_draft(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.my_draft(v_actor, p_application_id);
  delete from public.applications where id = p_application_id;
end;
$$;

-- Documents: reserve a path for the candidate's own draft (the upload route has
-- checked the file's content), upload with the candidate's session, confirm.
create or replace function public.reserve_application_document(
  p_application_id uuid, p_question_id text, p_file_name text, p_mime_type text, p_size_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_q jsonb;
  v_kind text := case p_mime_type
    when 'application/pdf' then 'pdf'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'image/jpeg' then 'image' when 'image/png' then 'image' end;
  v_id uuid := gen_random_uuid();
  v_path text;
  v_name text := left(btrim(regexp_replace(coalesce(p_file_name, ''), '[[:cntrl:]/\\]+', ' ', 'g')), 120);
begin
  v_app := private.my_draft(v_actor, p_application_id);
  select q into v_q from private.form_questions(
    (select schema from public.recruitment_form_versions where id = v_app.form_version_id), v_app.position_id) q
   where q ->> 'id' = p_question_id and q ->> 'type' in ('file', 'cv');
  if v_q is null then
    raise exception 'question_not_found' using errcode = 'P0001';
  end if;
  if v_kind is null or not (v_q -> 'file_types') ? v_kind then
    raise exception 'document_type_refused' using errcode = 'P0001';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > coalesce((v_q ->> 'max_size_mb')::integer, 10) * 1048576 then
    raise exception 'document_too_large' using errcode = 'P0001';
  end if;
  if (select count(*) from public.application_documents d
       where d.application_id = p_application_id and d.question_id = p_question_id
         and (d.status = 'ready' or (d.status = 'pending' and d.created_at > now() - interval '15 minutes')))
     >= (case when v_q ->> 'type' = 'cv' then 1 else coalesce((v_q ->> 'max_files')::integer, 1) end) + 1 then
    -- One more than allowed may be in flight: a replacement uploads before the old file goes.
    raise exception 'too_many_documents' using errcode = 'P0001';
  end if;
  if (select count(*) from public.application_documents d join public.applications a on a.id = d.application_id
       where a.candidate_id = v_actor and d.created_at > now() - interval '1 hour') >= 40 then
    raise exception 'document_rate_limited' using errcode = 'P0001';
  end if;
  v_path := 'applications/' || p_application_id || '/' || v_id;
  insert into public.application_documents (id, application_id, question_id, object_path, file_name, mime_type, size_bytes)
  values (v_id, p_application_id, p_question_id, v_path, coalesce(nullif(v_name, ''), 'document'), p_mime_type, p_size_bytes);
  return jsonb_build_object('document_id', v_id, 'object_path', v_path);
end;
$$;

-- The file arrived: the document counts. With p_replaces, the previous one goes
-- (only now, once the new one is safe).
create or replace function public.confirm_application_document(p_document_id uuid, p_replaces uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_doc public.application_documents%rowtype;
  v_app public.applications%rowtype;
  v_q jsonb;
  v_max integer;
begin
  select * into v_doc from public.application_documents where id = p_document_id for update;
  if not found then
    raise exception 'document_not_found' using errcode = 'P0001';
  end if;
  v_app := private.my_draft(v_actor, v_doc.application_id);
  if v_doc.status <> 'pending' then
    return jsonb_build_object('document_id', v_doc.id, 'status', v_doc.status);
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'recruitment-documents' and o.name = v_doc.object_path) then
    raise exception 'document_not_uploaded' using errcode = 'P0001';
  end if;
  if p_replaces is not null then
    update public.application_documents set status = 'removed', removed_at = now()
     where id = p_replaces and application_id = v_doc.application_id and question_id = v_doc.question_id and status = 'ready';
  end if;
  select q into v_q from private.form_questions(
    (select schema from public.recruitment_form_versions where id = v_app.form_version_id), v_app.position_id) q
   where q ->> 'id' = v_doc.question_id;
  v_max := case when v_q ->> 'type' = 'cv' then 1 else coalesce((v_q ->> 'max_files')::integer, 1) end;
  if (select count(*) from public.application_documents
       where application_id = v_doc.application_id and question_id = v_doc.question_id and status = 'ready') >= v_max then
    raise exception 'too_many_documents' using errcode = 'P0001';
  end if;
  update public.application_documents set status = 'ready', confirmed_at = now() where id = p_document_id;
  insert into public.application_events (application_id, action, details)
  values (v_doc.application_id, case when p_replaces is null then 'document_added' else 'document_replaced' end,
          jsonb_build_object('question', v_doc.question_id));
  update public.applications set version = version + 1, last_saved_at = now() where id = v_doc.application_id;
  return jsonb_build_object('document_id', v_doc.id, 'status', 'ready');
end;
$$;

create or replace function public.remove_application_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_doc public.application_documents%rowtype;
begin
  select * into v_doc from public.application_documents where id = p_document_id for update;
  if not found then
    raise exception 'document_not_found' using errcode = 'P0001';
  end if;
  perform private.my_draft(v_actor, v_doc.application_id);
  if v_doc.status <> 'removed' then
    update public.application_documents set status = 'removed', removed_at = now() where id = p_document_id;
    insert into public.application_events (application_id, action, details)
    values (v_doc.application_id, 'document_removed', jsonb_build_object('question', v_doc.question_id));
    update public.applications set version = version + 1, last_saved_at = now() where id = v_doc.application_id;
  end if;
  return jsonb_build_object('object_path', v_doc.object_path);
end;
$$;

-- THE submission: one transaction, under the application's lock and the
-- candidate's campaign lock. Accepted only if the database receives it inside
-- the window (opening ≤ now < closing, not paused, not cancelled, not hidden),
-- the student is eligible and within the limit, the form version is the live
-- one, every answer is valid and every required document is there. Submitting
-- twice returns the same submission.
create or replace function public.submit_application(p_application_id uuid, p_version integer, p_privacy_acknowledged boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_position public.recruitment_positions%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_schema jsonb;
  v_errors jsonb;
  v_refusal text;
  v_profile public.profiles%rowtype;
begin
  select * into v_app from public.applications where id = p_application_id and candidate_id = v_actor;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || v_app.campaign_id::text, 0));
  select * into v_app from public.applications where id = p_application_id for update;
  if v_app.status = 'submitted' then
    return jsonb_build_object('status', 'submitted', 'submitted_at', v_app.submitted_at, 'reference', v_app.reference, 'already', true);
  end if;
  if v_app.status <> 'draft' then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  if v_app.version <> p_version then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  if p_privacy_acknowledged is not true then
    raise exception 'privacy_not_acknowledged' using errcode = 'P0001';
  end if;

  select * into v_position from public.recruitment_positions where id = v_app.position_id;
  select * into v_campaign from public.recruitment_campaigns where id = v_app.campaign_id;
  v_refusal := private.position_refusal(v_position, v_campaign);
  if v_refusal is not null then
    raise exception '%', v_refusal using errcode = 'P0001';
  end if;
  v_refusal := private.application_eligibility(v_actor, v_position, v_campaign);
  if v_refusal is not null then
    raise exception '%', v_refusal using errcode = 'P0001';
  end if;
  if v_app.form_version_id is distinct from v_campaign.active_form_version_id then
    raise exception 'form_version_changed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.applications
       where candidate_id = v_actor and campaign_id = v_campaign.id and status = 'submitted' and id <> p_application_id)
     >= v_campaign.max_applications then
    raise exception 'application_limit' using errcode = 'P0001';
  end if;

  select schema into v_schema from public.recruitment_form_versions where id = v_app.form_version_id;
  v_errors := private.application_answer_errors(
    v_schema, v_app.position_id, private.clean_answers(v_schema, v_app.position_id, v_app.answers),
    private.application_document_counts(p_application_id), true);
  if v_errors <> '{}'::jsonb then
    raise exception 'application_incomplete' using errcode = 'P0001',
      detail = left((select string_agg(e.key || '=' || e.value, ',') from jsonb_each_text(v_errors) e), 900);
  end if;

  select * into v_profile from public.profiles where id = v_actor;
  -- Pending uploads never confirmed are not part of the application.
  update public.application_documents set status = 'removed', removed_at = now()
   where application_id = p_application_id and status = 'pending';
  update public.applications
     set status = 'submitted', submitted_at = now(), privacy_acknowledged_at = now(),
         answers = private.clean_answers(v_schema, v_app.position_id, v_app.answers),
         candidate_snapshot = jsonb_build_object(
           'first_name', v_profile.first_name, 'last_name', v_profile.last_name, 'display_name', v_profile.display_name,
           'email', (select u.email from auth.users u where u.id = v_actor),
           'program', v_profile.program, 'study_year', v_profile.study_year),
         version = version + 1
   where id = p_application_id
  returning * into v_app;
  insert into public.application_events (application_id, action) values (p_application_id, 'submitted');
  perform private.enqueue_application_message(v_app, 'application_submitted', 'app:' || v_app.id || ':submitted');
  return jsonb_build_object('status', 'submitted', 'submitted_at', v_app.submitted_at, 'reference', v_app.reference, 'already', false);
end;
$$;

-- The candidate takes a submitted application back. It stays on record (the
-- retention rules decide when it goes), and no longer counts.
create or replace function public.withdraw_application(p_application_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
begin
  select * into v_app from public.applications where id = p_application_id and candidate_id = v_actor for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0001';
  end if;
  if v_app.status = 'withdrawn' then
    return jsonb_build_object('status', 'withdrawn', 'already', true);
  end if;
  if v_app.status <> 'submitted' then
    raise exception 'application_not_submitted' using errcode = 'P0001';
  end if;
  update public.applications
     set status = 'withdrawn', withdrawn_at = now(),
         withdrawal_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), ''), version = version + 1
   where id = p_application_id
  returning * into v_app;
  insert into public.application_events (application_id, action) values (p_application_id, 'withdrawn');
  perform private.enqueue_application_message(v_app, 'application_withdrawn', 'app:' || v_app.id || ':withdrawn');
  return jsonb_build_object('status', 'withdrawn', 'already', false);
end;
$$;

-- ---- Maintenance: reminders, Storage cleanup, retention ----------------------------------------

-- Every hour: one reminder per unfinished draft whose position closes within 24
-- hours (only while it can still be submitted).
create or replace function private.enqueue_recruitment_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_app public.applications%rowtype;
  v_count integer := 0;
begin
  for v_row in
    select a.id, private.position_closes(p, c) as closes
      from public.applications a
      join public.recruitment_campaigns c on c.id = a.campaign_id
      join public.recruitment_positions p on p.id = a.position_id
     where a.status = 'draft' and private.position_refusal(p, c) is null
       and private.position_closes(p, c) between now() and now() + interval '24 hours'
       and a.created_at < private.position_closes(p, c) - interval '24 hours'
  loop
    select * into v_app from public.applications where id = v_row.id;
    -- The key names the closing time: a deadline moved later reminds again.
    perform private.enqueue_application_message(v_app, 'application_deadline_reminder',
      'app:' || v_app.id || ':deadline:' || extract(epoch from v_row.closes)::bigint);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Every night: uploads never confirmed (a day old) leave; then, only if the
-- institution set retention periods (recruitment_settings), applications past
-- them are erased (their files queued for deletion, their messages and history
-- with them). Nothing is erased while a period is null.
create or replace function private.purge_recruitment_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.recruitment_settings%rowtype;
  v_stale integer;
  v_drafts integer := 0;
  v_withdrawn integer := 0;
  v_submitted integer := 0;
begin
  update public.application_documents set status = 'removed', removed_at = now()
   where status = 'pending' and created_at < now() - interval '1 day';
  get diagnostics v_stale = row_count;

  select * into v_settings from public.recruitment_settings where id;
  if v_settings.draft_retention_months is not null then
    delete from public.applications a using public.recruitment_campaigns c, public.recruitment_positions p
     where a.campaign_id = c.id and p.id = a.position_id and a.status = 'draft'
       and (c.status = 'cancelled' or c.closes_at <= now())
       and greatest(coalesce(c.cancelled_at, c.closes_at), a.updated_at)
           < now() - make_interval(months => v_settings.draft_retention_months);
    get diagnostics v_drafts = row_count;
  end if;
  if v_settings.withdrawn_retention_months is not null then
    delete from public.applications
     where status = 'withdrawn' and withdrawn_at < now() - make_interval(months => v_settings.withdrawn_retention_months);
    get diagnostics v_withdrawn = row_count;
  end if;
  if v_settings.submitted_retention_months is not null then
    delete from public.applications a using public.recruitment_campaigns c
     where a.campaign_id = c.id and a.status = 'submitted'
       and (c.status = 'cancelled' or c.status = 'closed' or c.closes_at <= now())
       and coalesce(c.cancelled_at, c.closed_at, c.closes_at) < now() - make_interval(months => v_settings.submitted_retention_months);
    get diagnostics v_submitted = row_count;
  end if;
  if v_drafts + v_withdrawn + v_submitted > 0 then
    -- Counts only: nothing about who was erased.
    perform private.log_governance_event(
      null, 'scheduler', 'recruitment_data_purged', 'recruitment', null, null, 'recruitment_settings', null,
      jsonb_build_object('drafts', v_drafts, 'withdrawn', v_withdrawn, 'submitted', v_submitted));
  end if;
  return jsonb_build_object('stale_uploads', v_stale, 'drafts', v_drafts, 'withdrawn', v_withdrawn, 'submitted', v_submitted);
end;
$$;

-- The maintenance worker (service role) empties the Storage cleanup queue.
create or replace function public.claim_storage_cleanup(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  with batch as (
    select q.id from private.storage_cleanup_queue q
     where q.done_at is null and q.attempts < 10
     order by q.id limit least(greatest(coalesce(p_limit, 50), 1), 200)
     for update skip locked
  ), claimed as (
    update private.storage_cleanup_queue q set attempts = q.attempts + 1
      from batch where q.id = batch.id
    returning q.id, q.bucket_id, q.object_path
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'bucket', c.bucket_id, 'path', c.object_path) order by c.id), '[]'::jsonb)
    into v_rows from claimed c;
  return v_rows;
end;
$$;

create or replace function public.complete_storage_cleanup(p_id bigint, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.storage_cleanup_queue
     set done_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(regexp_replace(lower(coalesce(p_error, 'unknown')), '[^a-z_]', '', 'g'), 60) end
   where id = p_id;
$$;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('enqueue-recruitment-reminders', '7 * * * *', 'select private.enqueue_recruitment_reminders()');
    perform cron.schedule('purge-recruitment-data', '23 3 * * *', 'select private.purge_recruitment_data()');
  end if;
end;
$cron$;

-- ---- Grants -------------------------------------------------------------------------------------

revoke all on function private.recruitment_reserved_slugs() from public, anon, authenticated, service_role;
revoke all on function private.slugify(text, integer) from public, anon, authenticated, service_role;
revoke all on function private.unique_campaign_slug(text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.unique_position_slug(text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.campaign_state(public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.campaign_is_public(public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.position_closes(public.recruitment_positions, public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.position_accepting(public.recruitment_positions, public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.recruitment_blocker(public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.campaign_for(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.form_question_keys(text) from public, anon, authenticated, service_role;
revoke all on function private.form_invalid(text) from public, anon, authenticated, service_role;
revoke all on function private.validate_form_schema(jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function private.form_questions(jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function private.form_for_position(jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function private.clean_answers(jsonb, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.application_answer_errors(jsonb, uuid, jsonb, jsonb, boolean) from public, anon, authenticated, service_role;
revoke all on function private.application_document_counts(uuid) from public, anon, authenticated, service_role;
revoke all on function private.application_eligibility(uuid, public.recruitment_positions, public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.position_refusal(public.recruitment_positions, public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.application_message_payload(public.applications) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_application_message(public.applications, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.publish_form_draft(uuid, public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.my_draft(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_recruitment_reminders() from public, anon, authenticated, service_role;
revoke all on function private.purge_recruitment_data() from public, anon, authenticated, service_role;

revoke all on function public.create_recruitment_campaign(uuid, text) from public, anon;
revoke all on function public.save_recruitment_campaign(uuid, integer, jsonb) from public, anon;
revoke all on function public.add_recruitment_position(uuid, text) from public, anon;
revoke all on function public.save_recruitment_position(uuid, jsonb) from public, anon;
revoke all on function public.move_recruitment_position(uuid, integer) from public, anon;
revoke all on function public.remove_recruitment_position(uuid) from public, anon;
revoke all on function public.save_recruitment_form(uuid, integer, jsonb) from public, anon;
revoke all on function public.discard_recruitment_form_draft(uuid) from public, anon;
revoke all on function public.publish_recruitment_form(uuid) from public, anon;
revoke all on function public.publish_recruitment_campaign(uuid) from public, anon;
revoke all on function public.unpublish_recruitment_campaign(uuid, text) from public, anon;
revoke all on function public.set_recruitment_status(uuid, text) from public, anon;
revoke all on function public.cancel_recruitment_campaign(uuid, text) from public, anon;
revoke all on function public.archive_recruitment_campaign(uuid, boolean) from public, anon;
revoke all on function public.delete_recruitment_draft(uuid) from public, anon;
revoke all on function public.duplicate_recruitment_campaign(uuid, text) from public, anon;
revoke all on function public.change_recruitment_slug(uuid, text) from public, anon;
revoke all on function public.hide_recruitment_campaign(uuid, text) from public, anon;
revoke all on function public.restore_recruitment_campaign(uuid, text) from public, anon;
revoke all on function public.set_recruitment_settings(text, text, integer, integer, integer) from public, anon;
revoke all on function public.start_application(uuid) from public, anon;
revoke all on function public.save_application_answers(uuid, integer, jsonb) from public, anon;
revoke all on function public.refresh_application_form(uuid) from public, anon;
revoke all on function public.delete_application_draft(uuid) from public, anon;
revoke all on function public.reserve_application_document(uuid, text, text, text, integer) from public, anon;
revoke all on function public.confirm_application_document(uuid, uuid) from public, anon;
revoke all on function public.remove_application_document(uuid) from public, anon;
revoke all on function public.submit_application(uuid, integer, boolean) from public, anon;
revoke all on function public.withdraw_application(uuid, text) from public, anon;
revoke all on function public.claim_storage_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_storage_cleanup(bigint, boolean, text) from public, anon, authenticated;

grant execute on function public.create_recruitment_campaign(uuid, text) to authenticated;
grant execute on function public.save_recruitment_campaign(uuid, integer, jsonb) to authenticated;
grant execute on function public.add_recruitment_position(uuid, text) to authenticated;
grant execute on function public.save_recruitment_position(uuid, jsonb) to authenticated;
grant execute on function public.move_recruitment_position(uuid, integer) to authenticated;
grant execute on function public.remove_recruitment_position(uuid) to authenticated;
grant execute on function public.save_recruitment_form(uuid, integer, jsonb) to authenticated;
grant execute on function public.discard_recruitment_form_draft(uuid) to authenticated;
grant execute on function public.publish_recruitment_form(uuid) to authenticated;
grant execute on function public.publish_recruitment_campaign(uuid) to authenticated;
grant execute on function public.unpublish_recruitment_campaign(uuid, text) to authenticated;
grant execute on function public.set_recruitment_status(uuid, text) to authenticated;
grant execute on function public.cancel_recruitment_campaign(uuid, text) to authenticated;
grant execute on function public.archive_recruitment_campaign(uuid, boolean) to authenticated;
grant execute on function public.delete_recruitment_draft(uuid) to authenticated;
grant execute on function public.duplicate_recruitment_campaign(uuid, text) to authenticated;
grant execute on function public.change_recruitment_slug(uuid, text) to authenticated;
grant execute on function public.hide_recruitment_campaign(uuid, text) to authenticated;
grant execute on function public.restore_recruitment_campaign(uuid, text) to authenticated;
grant execute on function public.set_recruitment_settings(text, text, integer, integer, integer) to authenticated;
grant execute on function public.start_application(uuid) to authenticated;
grant execute on function public.save_application_answers(uuid, integer, jsonb) to authenticated;
grant execute on function public.refresh_application_form(uuid) to authenticated;
grant execute on function public.delete_application_draft(uuid) to authenticated;
grant execute on function public.reserve_application_document(uuid, text, text, text, integer) to authenticated;
grant execute on function public.confirm_application_document(uuid, uuid) to authenticated;
grant execute on function public.remove_application_document(uuid) to authenticated;
grant execute on function public.submit_application(uuid, integer, boolean) to authenticated;
grant execute on function public.withdraw_application(uuid, text) to authenticated;
grant execute on function public.claim_storage_cleanup(integer) to service_role;
grant execute on function public.complete_storage_cleanup(bigint, boolean, text) to service_role;
