-- Placement OS — shared notification delivery queue (FR-2.4/2.6, FR-4.6,
-- FR-5.2/5.3, FR-8.5/8.6)
--
-- This migration is deliberately generic: every email-producing workflow
-- uses one queue, retry contract, and provider-event ledger. The existing
-- jd_notifications table remains the student/JD delivery summary required by
-- FR-2.6; it is linked here rather than replaced or altered.

create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes(id) on delete cascade,
  kind text not null check (kind in (
    'jd_published',
    'application_status',
    'round_scheduled',
    'round_reminder',
    'outreach'
  )),
  recipient_email text not null,
  recipient_name text,
  cc_emails text[] not null default '{}',
  subject text not null,
  html_body text not null,
  text_body text not null,
  status text not null default 'queued' check (status in (
    'blocked',
    'queued',
    'scheduled',
    'sent',
    'delivered',
    'delivery_delayed',
    'opened',
    'clicked',
    'failed',
    'bounced',
    'complained',
    'suppressed',
    'cancelled'
  )),
  scheduled_for timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempt_count int not null default 0 check (attempt_count >= 0),
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  provider_message_id text unique,
  idempotency_key text not null unique,
  jd_notification_id uuid references jd_notifications(id) on delete set null,
  outreach_activity_id uuid references outreach_activities(id) on delete set null,
  application_id uuid references applications(id) on delete set null,
  created_by_user_id uuid references users(id) on delete set null,
  tags jsonb not null default '{}',
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_notification_jobs_due
  on notification_jobs(status, next_attempt_at)
  where status in ('blocked', 'queued', 'failed');
create index idx_notification_jobs_jd_notification
  on notification_jobs(jd_notification_id)
  where jd_notification_id is not null;
create index idx_notification_jobs_outreach_activity
  on notification_jobs(outreach_activity_id)
  where outreach_activity_id is not null;
create index idx_notification_jobs_application
  on notification_jobs(application_id)
  where application_id is not null;

-- Resend webhooks are delivered at least once. Persist only the signed event
-- identifier and routing fields needed for idempotency; do not retain the raw
-- provider payload (which repeats recipient PII and has no approved retention
-- period yet).
create table notification_webhook_events (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null unique,
  provider_message_id text,
  event_type text not null,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index idx_notification_webhook_provider_message
  on notification_webhook_events(provider_message_id)
  where provider_message_id is not null;

alter table notification_jobs enable row level security;
alter table notification_webhook_events enable row level security;

-- Read-only staff visibility. There is intentionally no authenticated write
-- policy: queue insertion and provider-event updates happen only through the
-- server-side service client after the originating RLS-gated mutation has
-- succeeded. With no INSERT/UPDATE/DELETE policy there is no USING/WITH CHECK
-- pair to drift apart; authenticated callers cannot mutate delivery state.
create policy notification_jobs_select on notification_jobs for select using (
  institute_id = current_institute_id()
  and (
    (
      kind = 'outreach'
      and (
        has_permission('CRM/Outreach')
        or exists (
          select 1
          from outreach_activities oa
          join companies c on c.id = oa.company_id
          where oa.id = outreach_activity_id
            and (c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
        )
      )
    )
    or (
      kind <> 'outreach'
      and (has_permission('JD Management') or has_permission('Shortlist Oversight'))
    )
  )
);

revoke all on table notification_jobs from anon, authenticated;
grant select on table notification_jobs to authenticated;
revoke all on table notification_webhook_events from anon, authenticated;

grant all on table notification_jobs to service_role;
grant all on table notification_webhook_events to service_role;

-- final_eligible_student_ids_for_jd() returns identifiers only and is already
-- inaccessible to browser roles. The notification worker needs it so the
-- publish mailer uses the same override-adjusted eligibility result as the
-- Admin review screen without exposing pre-shortlist PII to the publisher.
grant execute on function final_eligible_student_ids_for_jd(uuid) to service_role;
