-- Phase 9 follow-ups found while building the review workspace.

-- What candidates are told before submitting now includes how long an
-- application that ended with an accepted offer is kept (null: still to be decided).
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
    'submitted_months', s.submitted_retention_months, 'selected_months', s.selected_retention_months,
    'updated_at', s.updated_at)
    from public.recruitment_settings s where s.id;
$$;

-- The tabs of a campaign's review pages also need the association the
-- campaign belongs to (a campaign opened under another association's
-- address is sent to its own workspace).
create or replace function public.recruitment_campaign_access(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_powers text[];
  v_editor boolean;
begin
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  v_powers := array(select k from unnest(private.recruitment_powers()) k where private.campaign_can(v_actor, v_campaign, k));
  v_editor := exists (select 1 from unnest(array['recruitment.campaigns.manage', 'recruitment.questions.manage', 'recruitment.campaigns.publish']) k
                       where private.user_has_organization_permission(v_actor, v_campaign.organization_id, k, now()));
  if cardinality(v_powers) = 0 and not v_editor then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', v_campaign.id, 'title', v_campaign.title, 'state', private.campaign_state(v_campaign),
    'published', v_campaign.first_published_at is not null, 'archived', v_campaign.archived_at is not null,
    'powers', to_jsonb(v_powers), 'editor', v_editor,
    'candidate', private.candidate_in_campaign(v_actor, p_campaign_id),
    'organization', (select jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name)
                       from public.organizations o where o.id = v_campaign.organization_id));
end;
$$;
