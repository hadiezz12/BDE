-- Phase 10 · One notification system for the platform: the catalog (topics and
-- types), the in-app notifications (the Phase 7 notification_outbox, renamed,
-- every row kept), one delivery per channel (e-mail now), preferences, follows,
-- suppressions, provider events, broadcasts and the worker's configuration.
-- The business records stay in their modules: a notification never records a
-- decision, and holding one never opens anything (every destination checks
-- access again).

-- ---- Catalog ---------------------------------------------------------------------------------------

-- A topic is what a person chooses about: essential (always, both channels:
-- tied to their own action or responsibility), operational (on by default, the
-- e-mail can be turned off) or optional (in-app on, e-mail off until they opt in).
create table public.notification_topics (
  key text primary key
    constraint notification_topics_key_check check (key ~ '^[a-z_]{3,40}$'),
  class text not null
    constraint notification_topics_class_check check (class in ('essential', 'operational', 'optional')),
  category text not null
    constraint notification_topics_category_check
    check (category in ('account', 'governance', 'content', 'events', 'recruitment', 'campus')),
  label text not null
    constraint notification_topics_label_check check (char_length(label) between 3 and 60),
  description text not null
    constraint notification_topics_description_check check (char_length(description) between 3 and 300),
  default_in_app boolean not null,
  default_email boolean not null,
  sort_order smallint not null,
  constraint notification_topics_essential_check check (class <> 'essential' or (default_in_app and default_email))
);

comment on table public.notification_topics is
  'What a person chooses about. Essential topics cannot be turned off; the others follow notification_preferences.';

-- A type is one kind of message (the existing outbox kinds keep their names).
-- Importance and topic are fixed here, never by whoever sends.
create table public.notification_types (
  key text primary key
    constraint notification_types_key_check check (key ~ '^[a-z_]{3,60}$'),
  topic text not null
    constraint notification_types_topic_fkey references public.notification_topics (key),
  importance text not null
    constraint notification_types_importance_check check (importance in ('normal', 'important', 'critical')),
  -- The e-mail channel exists for this type.
  email boolean not null,
  -- Confidential (recruitment): the e-mail subject stays neutral, the body points to the site.
  confidential boolean not null default false,
  description text not null
    constraint notification_types_description_check check (char_length(description) between 3 and 200)
);

create index notification_types_topic_idx on public.notification_types (topic);

insert into public.notification_topics (key, class, category, label, description, default_in_app, default_email, sort_order) values
  ('account_security', 'essential', 'account', 'Sécurité du compte',
   'La double authentification activée ou retirée, un droit sensible donné ou retiré.', true, true, 1),
  ('governance_actions', 'essential', 'governance', 'Ce qu''on attend de toi',
   'Une invitation dans une équipe, une présidence proposée, une approbation demandée.', true, true, 2),
  ('governance_updates', 'operational', 'governance', 'Vie de l''équipe',
   'La réponse à une invitation que tu as envoyée, une passation terminée ou arrêtée, un mandat qui finit bientôt.', true, true, 3),
  ('content_workflow', 'operational', 'content', 'Articles à relire',
   'Un article attend ta relecture, ta relecture est faite, une publication programmée a échoué, un article masqué par le BDE.', true, true, 4),
  ('event_registration', 'essential', 'events', 'Tes inscriptions',
   'La confirmation, la liste d''attente, une place libérée, un changement, une annulation.', true, true, 5),
  ('event_reminders', 'operational', 'events', 'Rappels d''événements',
   'La veille d''un événement où tu es inscrit·e.', true, true, 6),
  ('recruitment_candidate', 'essential', 'recruitment', 'Tes candidatures',
   'L''envoi, une question de l''association, un entretien, une décision, une proposition.', true, true, 7),
  ('recruitment_reminders', 'operational', 'recruitment', 'Rappels de candidature',
   'Un brouillon à finir avant la date limite, une question ou une proposition qui attend ta réponse, un entretien le lendemain.', true, true, 8),
  ('recruitment_team', 'operational', 'recruitment', 'Travail de recrutement',
   'Les candidatures qu''on te confie, les mentions, les réponses reçues, les entretiens, les décisions à valider.', true, true, 9),
  ('association_messages', 'operational', 'campus', 'Messages de tes équipes',
   'Ce que les responsables de tes assos envoient à leurs membres.', true, true, 10),
  ('bde_announcements', 'optional', 'campus', 'Annonces du BDE',
   'Les annonces du BDE pour tous les étudiant·es.', true, false, 11),
  ('followed_updates', 'optional', 'campus', 'Assos que tu suis',
   'Les nouveaux articles, événements et recrutements des assos que tu suis.', true, false, 12);

insert into public.notification_types (key, topic, importance, email, confidential, description) values
  -- Account security
  ('account_mfa_enabled', 'account_security', 'important', true, false, 'La double authentification a été activée.'),
  ('account_mfa_disabled', 'account_security', 'critical', true, false, 'La double authentification a été retirée.'),
  ('account_privilege_changed', 'account_security', 'important', true, false, 'Un poste avec des droits sensibles donné ou retiré.'),
  ('account_platform_role_changed', 'account_security', 'critical', true, false, 'Un rôle de plateforme donné ou retiré.'),
  -- Governance
  ('governance_invitation_received', 'governance_actions', 'important', true, false, 'Une invitation à rejoindre une équipe.'),
  ('governance_candidacy_received', 'governance_actions', 'important', true, false, 'Une présidence proposée, à accepter ou refuser.'),
  ('governance_approval_required', 'governance_actions', 'important', true, false, 'Une passation qui attend ton approbation.'),
  ('governance_bde_vacancy', 'governance_actions', 'critical', true, false, 'Le BDE n''a plus de présidence (garant·e de continuité).'),
  ('governance_invitation_answered', 'governance_updates', 'normal', true, false, 'Une réponse à une invitation envoyée.'),
  ('governance_transition_completed', 'governance_updates', 'important', true, false, 'Une passation terminée.'),
  ('governance_transition_closed', 'governance_updates', 'normal', true, false, 'Une passation annulée ou expirée.'),
  ('governance_mandate_expiring', 'governance_updates', 'normal', true, false, 'Un mandat qui finit bientôt.'),
  -- Content
  ('content_approval_requested', 'content_workflow', 'normal', true, false, 'Un article soumis à relecture.'),
  ('content_approval_pending', 'content_workflow', 'normal', true, false, 'Un article attend une relecture depuis deux jours.'),
  ('content_review_done', 'content_workflow', 'normal', true, false, 'Une relecture faite (approuvé ou modifications demandées).'),
  ('content_schedule_failed', 'content_workflow', 'important', true, false, 'Une publication programmée n''a pas pu partir.'),
  ('content_moderated', 'content_workflow', 'important', true, false, 'Un article masqué ou rétabli par le BDE.'),
  -- Events (registrations)
  ('event_registration_confirmed', 'event_registration', 'normal', true, false, 'Inscription confirmée.'),
  ('event_waitlisted', 'event_registration', 'normal', true, false, 'Inscription sur liste d''attente.'),
  ('event_promoted', 'event_registration', 'important', true, false, 'Une place libérée : inscription confirmée.'),
  ('event_registration_cancelled', 'event_registration', 'normal', true, false, 'Désinscription.'),
  ('event_registration_removed', 'event_registration', 'important', true, false, 'Inscription retirée par l''organisation.'),
  ('event_changed', 'event_registration', 'important', true, false, 'Date, horaire ou lieu changé.'),
  ('event_cancelled', 'event_registration', 'important', true, false, 'Événement annulé.'),
  ('event_reminder', 'event_reminders', 'normal', true, false, 'Rappel la veille.'),
  -- Recruitment, the candidate
  ('application_submitted', 'recruitment_candidate', 'normal', true, true, 'Candidature envoyée.'),
  ('application_withdrawn', 'recruitment_candidate', 'normal', true, true, 'Candidature retirée.'),
  ('application_form_updated', 'recruitment_candidate', 'normal', true, true, 'Formulaire changé pendant un brouillon.'),
  ('recruitment_cancelled', 'recruitment_candidate', 'important', true, true, 'Recrutement annulé.'),
  ('recruitment_interview_invited', 'recruitment_candidate', 'important', true, true, 'Invitation à un entretien.'),
  ('recruitment_interview_scheduled', 'recruitment_candidate', 'important', true, true, 'Entretien réservé.'),
  ('recruitment_interview_rescheduled', 'recruitment_candidate', 'important', true, true, 'Entretien déplacé.'),
  ('recruitment_interview_cancelled', 'recruitment_candidate', 'important', true, true, 'Entretien annulé.'),
  ('recruitment_clarification_requested', 'recruitment_candidate', 'important', true, true, 'Une question de l''association.'),
  ('recruitment_clarification_extended', 'recruitment_candidate', 'normal', true, true, 'Délai de réponse prolongé.'),
  ('recruitment_offer', 'recruitment_candidate', 'important', true, true, 'Une proposition.'),
  ('recruitment_offer_expired', 'recruitment_candidate', 'normal', true, true, 'Proposition expirée.'),
  ('recruitment_offer_withdrawn', 'recruitment_candidate', 'important', true, true, 'Proposition retirée.'),
  ('recruitment_rejected', 'recruitment_candidate', 'normal', true, true, 'Réponse de l''association.'),
  ('recruitment_waitlisted', 'recruitment_candidate', 'normal', true, true, 'Liste d''attente.'),
  ('application_deadline_reminder', 'recruitment_reminders', 'normal', true, true, 'Brouillon à envoyer avant la date limite.'),
  ('recruitment_clarification_reminder', 'recruitment_reminders', 'normal', true, true, 'Question en attente de réponse.'),
  ('recruitment_offer_reminder', 'recruitment_reminders', 'normal', true, true, 'Proposition en attente de réponse.'),
  ('recruitment_interview_reminder', 'recruitment_reminders', 'normal', true, true, 'Entretien le lendemain (candidat·e).'),
  -- Recruitment, the team
  ('recruitment_review_assigned', 'recruitment_team', 'normal', true, true, 'Candidatures confiées.'),
  ('recruitment_mention', 'recruitment_team', 'normal', true, true, 'Mention dans une discussion.'),
  ('recruitment_clarification_answered', 'recruitment_team', 'normal', true, true, 'Réponse reçue à une question.'),
  ('recruitment_interview_booked', 'recruitment_team', 'normal', true, true, 'Créneau réservé.'),
  ('recruitment_decision_to_approve', 'recruitment_team', 'normal', true, true, 'Décision à valider.'),
  ('recruitment_offer_accepted', 'recruitment_team', 'normal', true, true, 'Proposition acceptée.'),
  ('recruitment_offer_declined', 'recruitment_team', 'normal', true, true, 'Proposition déclinée ou expirée.'),
  ('recruitment_candidate_withdrew', 'recruitment_team', 'normal', true, true, 'Candidature retirée.'),
  ('recruitment_team_interview_reminder', 'recruitment_team', 'normal', true, true, 'Entretien à faire passer le lendemain.'),
  -- Campus
  ('campus_announcement', 'bde_announcements', 'normal', true, false, 'Annonce du BDE.'),
  ('association_message', 'association_messages', 'normal', true, false, 'Message d''une équipe à ses membres.'),
  ('followed_announcement', 'followed_updates', 'normal', true, false, 'Message d''une asso à ses abonné·es.'),
  ('followed_post_published', 'followed_updates', 'normal', true, false, 'Nouvel article d''une asso suivie.'),
  ('followed_event_published', 'followed_updates', 'normal', true, false, 'Nouvel événement d''une asso suivie.'),
  ('followed_recruitment_opened', 'followed_updates', 'normal', true, false, 'Nouveau recrutement d''une asso suivie.');

-- ---- Broadcasts (before notifications, which reference them) ------------------------------------------

-- A message to an audience: by a person (BDE announcement, association
-- message) or by the system (a followed association published something).
-- The audience is a definition resolved by the database, never a list sent
-- by a browser.
create table public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint notification_broadcasts_organization_id_fkey references public.organizations (id) on delete restrict,
  origin text not null
    constraint notification_broadcasts_origin_check check (origin in ('person', 'system')),
  kind text not null
    constraint notification_broadcasts_kind_fkey references public.notification_types (key),
  audience text not null
    constraint notification_broadcasts_audience_check
    check (audience in ('all_students', 'members', 'followers')),
  email boolean not null default false,
  importance text not null default 'normal'
    constraint notification_broadcasts_importance_check check (importance in ('normal', 'important')),
  title text not null
    constraint notification_broadcasts_title_check check (char_length(btrim(title)) between 3 and 120),
  body text
    constraint notification_broadcasts_body_check check (char_length(body) between 1 and 2000),
  -- A page of the site the message points to (public pages only, checked).
  link_path text
    constraint notification_broadcasts_link_path_check
    check (link_path ~ '^/(events|campus|associations|recruitment)/[a-z0-9]+(-[a-z0-9]+)*$'),
  -- System broadcasts: what they are about (a post, an event, a campaign).
  source_type text
    constraint notification_broadcasts_source_type_check check (source_type in ('post', 'event', 'recruitment_campaign')),
  source_id uuid,
  payload jsonb not null default '{}'::jsonb
    constraint notification_broadcasts_payload_check check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 2000),
  -- draft → (pending_approval) → queued → dispatching → dispatched, or cancelled.
  status text not null default 'draft'
    constraint notification_broadcasts_status_check
    check (status in ('draft', 'pending_approval', 'queued', 'dispatching', 'dispatched', 'cancelled')),
  needs_approval boolean not null default false,
  created_by uuid
    constraint notification_broadcasts_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_by uuid
    constraint notification_broadcasts_approved_by_fkey references auth.users (id) on delete set null,
  approved_at timestamptz,
  scheduled_at timestamptz,
  dispatch_started_at timestamptz,
  dispatched_at timestamptz,
  cancelled_by uuid
    constraint notification_broadcasts_cancelled_by_fkey references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text
    constraint notification_broadcasts_cancel_reason_check check (char_length(cancel_reason) between 3 and 500),
  recipient_count integer
    constraint notification_broadcasts_recipient_count_check check (recipient_count >= 0),
  -- The same text sent twice in a week by the same organization is refused.
  fingerprint text not null
    constraint notification_broadcasts_fingerprint_check check (fingerprint ~ '^[0-9a-f]{32}$'),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint notification_broadcasts_system_check check (origin = 'person' or (source_type is not null and source_id is not null)),
  constraint notification_broadcasts_approval_check check (status not in ('queued', 'dispatching', 'dispatched') or not needs_approval or approved_at is not null),
  constraint notification_broadcasts_approver_check check (approved_by is null or approved_by is distinct from created_by),
  constraint notification_broadcasts_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint notification_broadcasts_dispatched_check check ((status = 'dispatched') = (dispatched_at is not null))
);

comment on table public.notification_broadcasts is
  'Messages to an audience (BDE announcements, association messages, followed updates). Recipients are resolved by the database.';

create index notification_broadcasts_organization_idx on public.notification_broadcasts (organization_id, created_at desc);
create index notification_broadcasts_queue_idx on public.notification_broadcasts (scheduled_at) where status in ('queued', 'dispatching');
create index notification_broadcasts_created_by_idx on public.notification_broadcasts (created_by);
create index notification_broadcasts_approved_by_idx on public.notification_broadcasts (approved_by);
create index notification_broadcasts_cancelled_by_idx on public.notification_broadcasts (cancelled_by);
create index notification_broadcasts_kind_idx on public.notification_broadcasts (kind);
create unique index notification_broadcasts_system_source_idx on public.notification_broadcasts (kind, source_id) where origin = 'system';

create trigger set_updated_at
  before update on public.notification_broadcasts
  for each row execute function private.set_updated_at();

-- The audience frozen when a broadcast is queued (user ids only), worked
-- through by the dispatcher; eligibility and preferences are checked again
-- for each person when their notification is created and their e-mail sent.
create table public.notification_broadcast_recipients (
  broadcast_id uuid not null
    constraint notification_broadcast_recipients_broadcast_id_fkey references public.notification_broadcasts (id) on delete cascade,
  user_id uuid not null
    constraint notification_broadcast_recipients_user_id_fkey references auth.users (id) on delete cascade,
  dispatched_at timestamptz,
  constraint notification_broadcast_recipients_pkey primary key (broadcast_id, user_id)
);

create index notification_broadcast_recipients_pending_idx on public.notification_broadcast_recipients (broadcast_id) where dispatched_at is null;
create index notification_broadcast_recipients_user_id_idx on public.notification_broadcast_recipients (user_id);

-- ---- In-app notifications: the Phase 7 outbox, renamed ---------------------------------------------

alter table public.notification_outbox rename to notifications;
alter index public.notification_outbox_pkey rename to notifications_pkey;
alter index public.notification_outbox_recipient_idx rename to notifications_recipient_idx;
alter index public.notification_outbox_event_idx rename to notifications_event_idx;
alter index public.notification_outbox_application_idx rename to notifications_application_idx;
alter table public.notifications rename constraint notification_outbox_recipient_id_fkey to notifications_recipient_id_fkey;
alter table public.notifications rename constraint notification_outbox_event_id_fkey to notifications_event_id_fkey;
alter table public.notifications rename constraint notification_outbox_application_id_fkey to notifications_application_id_fkey;
alter table public.notifications rename constraint notification_outbox_payload_check to notifications_payload_check;
alter table public.notifications rename constraint notification_outbox_dedupe_key_check to notifications_dedupe_key_check;
alter table public.notifications rename constraint notification_outbox_dedupe_key_key to notifications_dedupe_key_key;
alter policy notification_outbox_read_own on public.notifications rename to notifications_read_own;
alter policy notification_outbox_require_mfa_when_enrolled on public.notifications rename to notifications_require_mfa_when_enrolled;

-- The kind is now a catalog type.
alter table public.notifications drop constraint notification_outbox_kind_check;
alter table public.notifications add constraint notifications_kind_fkey foreign key (kind) references public.notification_types (key);
create index notifications_kind_idx on public.notifications (kind);

alter table public.notifications
  add column organization_id uuid
    constraint notifications_organization_id_fkey references public.organizations (id) on delete set null,
  add column resource_type text
    constraint notifications_resource_type_check
    check (resource_type in ('event', 'application', 'recruitment_campaign', 'post', 'organization', 'transition',
                             'invitation', 'assignment', 'platform_assignment', 'broadcast', 'account')),
  add column resource_id uuid,
  -- Set only by a broadcast (BDE announcements may be "important"); otherwise the type's.
  add column importance text
    constraint notifications_importance_check check (importance in ('normal', 'important')),
  add column broadcast_id uuid
    constraint notifications_broadcast_id_fkey references public.notification_broadcasts (id) on delete set null,
  add column archived_at timestamptz;

create index notifications_organization_idx on public.notifications (organization_id);
create index notifications_broadcast_idx on public.notifications (broadcast_id);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null and archived_at is null;
create index notifications_list_idx on public.notifications (recipient_id, created_at desc, id desc) where archived_at is null;

-- Where each existing row came from.
update public.notifications n
   set organization_id = e.organization_id, resource_type = 'event', resource_id = e.id
  from public.events e
 where e.id = n.event_id;
update public.notifications n
   set organization_id = c.organization_id, resource_type = 'application', resource_id = a.id
  from public.applications a
  join public.recruitment_campaigns c on c.id = a.campaign_id
 where a.id = n.application_id;

comment on table public.notifications is
  'In-app notifications, one per recipient (Phase 7 outbox renamed in Phase 10). Read by their recipient only; written by private.notify.';

-- ---- Deliveries: one per channel ------------------------------------------------------------------------

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id bigint not null
    constraint notification_deliveries_notification_id_fkey references public.notifications (id) on delete cascade,
  recipient_id uuid not null
    constraint notification_deliveries_recipient_id_fkey references auth.users (id) on delete cascade,
  channel text not null default 'email'
    constraint notification_deliveries_channel_check check (channel in ('email')),
  -- queued → processing → provider_accepted → delivered, or failed_retryable
  -- (back to processing later), failed_permanent, suppressed, cancelled.
  status text not null default 'queued'
    constraint notification_deliveries_status_check
    check (status in ('queued', 'processing', 'provider_accepted', 'delivered', 'failed_retryable',
                      'failed_permanent', 'suppressed', 'cancelled')),
  -- Snapshot of the topic's class when queued: essential messages ignore opt-outs.
  essential boolean not null,
  topic text not null
    constraint notification_deliveries_topic_fkey references public.notification_topics (key),
  -- Sent to the provider as a custom header: the provider's events carry it
  -- back, which reconciles an attempt whose outcome was unknown.
  idempotency_key uuid not null default gen_random_uuid(),
  attempts smallint not null default 0
    constraint notification_deliveries_attempts_check check (attempts between 0 and 50),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text
    constraint notification_deliveries_last_error_check check (last_error ~ '^[a-z_]{3,60}$'),
  provider text
    constraint notification_deliveries_provider_check check (provider in ('capture', 'brevo', 'log')),
  provider_message_id text
    constraint notification_deliveries_provider_message_id_check check (char_length(provider_message_id) <= 300),
  accepted_at timestamptz,
  delivered_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_notification_channel_key unique (notification_id, channel),
  constraint notification_deliveries_idempotency_key_key unique (idempotency_key),
  constraint notification_deliveries_lease_check check ((status = 'processing') = (lease_until is not null))
);

comment on table public.notification_deliveries is
  'Delivery of a notification on a channel (e-mail). Never read by the API roles; the worker and the health views use it.';

create index notification_deliveries_queue_idx on public.notification_deliveries (next_attempt_at, id)
  where status in ('queued', 'failed_retryable', 'processing');
create index notification_deliveries_recipient_idx on public.notification_deliveries (recipient_id);
create index notification_deliveries_status_idx on public.notification_deliveries (status, updated_at desc);
create index notification_deliveries_topic_idx on public.notification_deliveries (topic);
create index notification_deliveries_provider_message_idx on public.notification_deliveries (provider_message_id)
  where provider_message_id is not null;

create trigger set_updated_at
  before update on public.notification_deliveries
  for each row execute function private.set_updated_at();

-- Every e-mail state the outbox held becomes a delivery (nothing was ever
-- sent: no scheduler ran the Phase 7 worker; "sent" rows are kept as accepted).
insert into public.notification_deliveries
  (notification_id, recipient_id, status, essential, topic, attempts, next_attempt_at, last_error, accepted_at, finished_at, created_at)
select n.id, n.recipient_id,
       case n.email_status when 'sent' then 'provider_accepted'
                           when 'failed' then 'failed_permanent'
                           when 'skipped' then 'failed_permanent'
                           else 'queued' end,
       tp.class = 'essential', t.topic, least(n.email_attempts, 50), n.email_next_attempt_at,
       case when n.email_status = 'skipped' then 'no_address' else n.email_last_error end,
       n.email_sent_at,
       case when n.email_status in ('sent', 'failed', 'skipped') then coalesce(n.email_sent_at, now()) end,
       n.created_at
  from public.notifications n
  join public.notification_types t on t.key = n.kind
  join public.notification_topics tp on tp.key = t.topic;

drop index public.notification_outbox_email_queue_idx;
alter table public.notifications
  drop column email_status,
  drop column email_attempts,
  drop column email_next_attempt_at,
  drop column email_last_error,
  drop column email_sent_at;

-- One line per attempt (diagnosis; never the message or the address).
create table public.notification_delivery_attempts (
  id bigint generated always as identity primary key,
  delivery_id bigint not null
    constraint notification_delivery_attempts_delivery_id_fkey references public.notification_deliveries (id) on delete cascade,
  attempt smallint not null
    constraint notification_delivery_attempts_attempt_check check (attempt between 1 and 50),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text
    constraint notification_delivery_attempts_outcome_check
    check (outcome in ('provider_accepted', 'failed_retryable', 'failed_permanent', 'outcome_unknown', 'reconciled')),
  error text
    constraint notification_delivery_attempts_error_check check (error ~ '^[a-z_]{3,60}$'),
  provider text
    constraint notification_delivery_attempts_provider_check check (provider in ('capture', 'brevo', 'log'))
);

create index notification_delivery_attempts_delivery_idx on public.notification_delivery_attempts (delivery_id, attempt);
create index notification_delivery_attempts_started_idx on public.notification_delivery_attempts (started_at);

-- What the provider said about a message (webhooks), recorded once each.
create table public.notification_provider_events (
  id bigint generated always as identity primary key,
  provider text not null
    constraint notification_provider_events_provider_check check (provider in ('brevo')),
  dedupe_key text not null
    constraint notification_provider_events_dedupe_key_check check (dedupe_key ~ '^[0-9a-f]{32}$'),
  event text not null
    constraint notification_provider_events_event_check check (event ~ '^[a-z_]{2,40}$'),
  provider_message_id text
    constraint notification_provider_events_provider_message_id_check check (char_length(provider_message_id) <= 300),
  delivery_key uuid,
  delivery_id bigint
    constraint notification_provider_events_delivery_id_fkey references public.notification_deliveries (id) on delete set null,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  constraint notification_provider_events_dedupe_key_key unique (dedupe_key)
);

create index notification_provider_events_delivery_key_idx on public.notification_provider_events (delivery_key);
create index notification_provider_events_delivery_idx on public.notification_provider_events (delivery_id);
create index notification_provider_events_received_idx on public.notification_provider_events (received_at);

-- Addresses that must not get e-mails any more (bounces, complaints,
-- invalid addresses, a person's own request). Kept as a hash of the address
-- plus the account: changing one's address lifts a bounce on the old one.
create table public.notification_suppressions (
  id bigint generated always as identity primary key,
  user_id uuid
    constraint notification_suppressions_user_id_fkey references auth.users (id) on delete cascade,
  email_hash text not null
    constraint notification_suppressions_email_hash_check check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null
    constraint notification_suppressions_reason_check
    check (reason in ('hard_bounce', 'complaint', 'invalid_address', 'blocked', 'user_request')),
  source text not null
    constraint notification_suppressions_source_check check (source in ('provider', 'user', 'operator')),
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid
    constraint notification_suppressions_cleared_by_fkey references auth.users (id) on delete set null
);

create unique index notification_suppressions_active_idx on public.notification_suppressions (email_hash) where cleared_at is null;
create index notification_suppressions_user_id_idx on public.notification_suppressions (user_id);
create index notification_suppressions_cleared_by_idx on public.notification_suppressions (cleared_by);

-- ---- Preferences, settings, follows --------------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid not null
    constraint notification_preferences_user_id_fkey references auth.users (id) on delete cascade,
  topic text not null
    constraint notification_preferences_topic_fkey references public.notification_topics (key),
  in_app boolean not null,
  email boolean not null,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_pkey primary key (user_id, topic)
);

create index notification_preferences_topic_idx on public.notification_preferences (topic);

-- Quiet hours (optional and operational e-mails only) and the person's time zone.
create table public.notification_settings (
  user_id uuid primary key
    constraint notification_settings_user_id_fkey references auth.users (id) on delete cascade,
  quiet_hours boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  timezone text not null default 'Europe/Paris'
    constraint notification_settings_timezone_check check (char_length(timezone) between 3 and 60),
  updated_at timestamptz not null default now(),
  constraint notification_settings_window_check check (quiet_start <> quiet_end)
);

-- The record of each choice (proof of consent for optional e-mails): the
-- person reads their own; nobody else.
create table public.notification_preference_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null
    constraint notification_preference_changes_user_id_fkey references auth.users (id) on delete cascade,
  topic text
    constraint notification_preference_changes_topic_fkey references public.notification_topics (key),
  organization_id uuid
    constraint notification_preference_changes_organization_id_fkey references public.organizations (id) on delete cascade,
  change text not null
    constraint notification_preference_changes_change_check
    check (change in ('in_app_on', 'in_app_off', 'email_on', 'email_off', 'follow', 'unfollow',
                      'quiet_hours_on', 'quiet_hours_off', 'suppression_cleared')),
  source text not null
    constraint notification_preference_changes_source_check check (source in ('settings', 'unsubscribe_link', 'association_page')),
  created_at timestamptz not null default now()
);

create index notification_preference_changes_user_idx on public.notification_preference_changes (user_id, created_at desc);
create index notification_preference_changes_topic_idx on public.notification_preference_changes (topic);
create index notification_preference_changes_organization_idx on public.notification_preference_changes (organization_id);

-- Following an association: optional updates from it, chosen by the person
-- (never created by an application, a registration or a membership).
create table public.notification_follows (
  user_id uuid not null
    constraint notification_follows_user_id_fkey references auth.users (id) on delete cascade,
  organization_id uuid not null
    constraint notification_follows_organization_id_fkey references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint notification_follows_pkey primary key (user_id, organization_id)
);

create index notification_follows_organization_idx on public.notification_follows (organization_id);

-- One-click unsubscribe links of optional e-mails: a random token, only its
-- hash stored, bound to one person and one topic, valid 90 days.
create table public.notification_unsubscribe_tokens (
  token_hash text primary key
    constraint notification_unsubscribe_tokens_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null
    constraint notification_unsubscribe_tokens_user_id_fkey references auth.users (id) on delete cascade,
  topic text not null
    constraint notification_unsubscribe_tokens_topic_fkey references public.notification_topics (key),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index notification_unsubscribe_tokens_user_idx on public.notification_unsubscribe_tokens (user_id);
create index notification_unsubscribe_tokens_topic_idx on public.notification_unsubscribe_tokens (topic);
create index notification_unsubscribe_tokens_expires_idx on public.notification_unsubscribe_tokens (expires_at);

-- ---- The worker: configuration, runs, test captures -----------------------------------------------------

-- How e-mails leave: off (default: nothing is claimed), capture (test mode:
-- rendered and recorded here, never sent) or live (the provider configured in
-- the worker's secrets). Changed only by the operator (SQL), audited.
create table public.notification_config (
  id boolean primary key default true
    constraint notification_config_singleton_check check (id),
  delivery_mode text not null default 'off'
    constraint notification_config_delivery_mode_check check (delivery_mode in ('off', 'capture', 'live')),
  email_from text
    constraint notification_config_email_from_check check (char_length(email_from) between 6 and 200),
  reply_to text
    constraint notification_config_reply_to_check check (reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  site_url text
    constraint notification_config_site_url_check check (site_url ~ '^https?://[a-z0-9.-]+(:[0-9]+)?$'),
  updated_at timestamptz not null default now()
);

insert into public.notification_config (id) values (true);

create table public.notification_worker_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null
    constraint notification_worker_runs_mode_check check (mode in ('off', 'capture', 'live')),
  claimed integer not null default 0,
  accepted integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  error text
    constraint notification_worker_runs_error_check check (error ~ '^[a-z_]{3,60}$')
);

create index notification_worker_runs_started_idx on public.notification_worker_runs (started_at desc);

-- Test mode only: what would have been sent. Readable by no API role; kept 7 days.
create table public.notification_email_captures (
  delivery_id bigint primary key
    constraint notification_email_captures_delivery_id_fkey references public.notification_deliveries (id) on delete cascade,
  subject text not null
    constraint notification_email_captures_subject_check check (char_length(subject) <= 300),
  text_body text not null
    constraint notification_email_captures_text_body_check check (char_length(text_body) <= 20000),
  html_body text not null
    constraint notification_email_captures_html_body_check check (char_length(html_body) <= 60000),
  headers jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index notification_email_captures_captured_idx on public.notification_email_captures (captured_at);

-- ---- Row level security ----------------------------------------------------------------------------------

alter table public.notification_topics enable row level security;
alter table public.notification_types enable row level security;
alter table public.notification_broadcasts enable row level security;
alter table public.notification_broadcast_recipients enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.notification_provider_events enable row level security;
alter table public.notification_suppressions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_preference_changes enable row level security;
alter table public.notification_follows enable row level security;
alter table public.notification_unsubscribe_tokens enable row level security;
alter table public.notification_config enable row level security;
alter table public.notification_worker_runs enable row level security;
alter table public.notification_email_captures enable row level security;

revoke all on public.notification_topics, public.notification_types, public.notification_broadcasts,
  public.notification_broadcast_recipients, public.notification_deliveries, public.notification_delivery_attempts,
  public.notification_provider_events, public.notification_suppressions, public.notification_preferences,
  public.notification_settings, public.notification_preference_changes, public.notification_follows,
  public.notification_unsubscribe_tokens, public.notification_config, public.notification_worker_runs,
  public.notification_email_captures
  from anon, authenticated;

-- The catalog is public words.
create policy notification_topics_read on public.notification_topics for select to anon, authenticated using (true);
create policy notification_types_read on public.notification_types for select to anon, authenticated using (true);
grant select on public.notification_topics, public.notification_types to anon, authenticated;

-- A person reads their own choices; writes go through functions.
create policy notification_preferences_read_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_settings_read_own on public.notification_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preference_changes_read_own on public.notification_preference_changes
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_follows_read_own on public.notification_follows
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_require_mfa_when_enrolled on public.notification_preferences
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy notification_settings_require_mfa_when_enrolled on public.notification_settings
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy notification_preference_changes_require_mfa_when_enrolled on public.notification_preference_changes
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy notification_follows_require_mfa_when_enrolled on public.notification_follows
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
grant select on public.notification_preferences, public.notification_settings, public.notification_preference_changes,
  public.notification_follows to authenticated;
-- notifications: notifications_read_own and its second-factor policy, kept from Phase 7.

-- Realtime: a person's own rows only (the publication honours row level security).
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$realtime$;

-- ---- Permissions -----------------------------------------------------------------------------------------

insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order)
values
  ('communications.send', 'organization', 'team', 'Écrire aux membres et aux abonné·es',
   'Envoyer un message aux membres de l''asso, ou aux personnes qui la suivent, dans les limites du site.',
   true, false, false, true, 8),
  ('platform.communications.broadcast', 'platform', 'platform', 'Annonces du BDE',
   'Préparer une annonce à tous les étudiant·es ; un envoi par mail à tout le campus demande l''accord d''un·e autre membre du bureau du BDE.',
   false, false, false, true, 109),
  ('platform.communications.monitor', 'platform', 'platform', 'Suivre les envois',
   'Voir l''état des envois de mails (chiffres, échecs sans contenu), relancer un envoi en échec, prévisualiser les modèles.',
   false, false, false, true, 110);

-- The offices and the vice-presidency write to their members.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, 'communications.send' from public.position_templates t where t.office is not null or t.key = 'vice_president'
on conflict do nothing;
insert into public.position_permissions (position_id, permission_key)
select p.id, 'communications.send' from public.positions p
 where (p.office is not null or p.template_key = 'vice_president') and p.archived_at is null
on conflict do nothing;

-- The BDE offices carry the two new platform keys.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, k.key
  from public.position_templates t
 cross join (values ('platform.communications.broadcast'), ('platform.communications.monitor')) as k (key)
 where t.office in ('bde_president', 'bde_vice_president')
on conflict do nothing;
insert into public.position_permissions (position_id, permission_key)
select p.id, k.key
  from public.positions p
 cross join (values ('platform.communications.broadcast'), ('platform.communications.monitor')) as k (key)
 where p.office in ('bde_president', 'bde_vice_president')
on conflict do nothing;

-- ---- Audit vocabulary ------------------------------------------------------------------------------------

alter table public.governance_audit_events drop constraint governance_audit_events_category_check;
alter table public.governance_audit_events add constraint governance_audit_events_category_check
  check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap',
                      'profile', 'media', 'catalog', 'content', 'moderation', 'events', 'recruitment', 'communications'));
alter table public.governance_audit_events drop constraint governance_audit_events_resource_type_check;
alter table public.governance_audit_events add constraint governance_audit_events_resource_type_check
  check (resource_type in ('organization', 'membership', 'position', 'assignment', 'invitation', 'delegation', 'transition',
                           'platform_assignment', 'association_page', 'association_profile', 'association_media',
                           'association_category', 'post', 'post_revision', 'content_report', 'post_category',
                           'event', 'event_registration', 'event_category',
                           'recruitment_campaign', 'recruitment_position', 'recruitment_form', 'recruitment_settings',
                           'application', 'recruitment_committee_member', 'recruitment_rubric', 'recruitment_interview_slot',
                           'recruitment_decision', 'recruitment_offer',
                           'notification_broadcast', 'notification_delivery', 'notification_config'));
