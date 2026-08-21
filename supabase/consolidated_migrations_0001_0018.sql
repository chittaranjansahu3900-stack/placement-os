-- Placement OS — consolidated schema, migrations 0001 through 0018, in order.
-- Generated for a one-shot paste into the Supabase Dashboard SQL Editor.
-- Wrapped in a transaction: if anything fails partway, Postgres rolls the
-- whole thing back rather than leaving a half-applied schema. If it fails,
-- note which '-- 00NN_*.sql' marker comment you're under when the error
-- hits — that tells you which file in supabase/migrations/ has full context
-- (including why each piece exists, not just what it does).

begin;



-- ============================================================================
-- 0001_initial_schema.sql
-- ============================================================================
-- Placement OS — initial schema
-- Maps directly to BRD Section 5 (Data Model), corrected against Appendix B
-- (Data Validation & Migration Mapping) field-by-field.
--
-- Multi-tenancy: single schema + institute_id column, per BRD Section 12.1.
-- Table order below is dependency order (no forward references), which is
-- why it doesn't match the Section 5 table's top-to-bottom listing.

create extension if not exists "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

create type user_status as enum ('pending', 'active', 'deactivated');
create type placement_status as enum ('unplaced', 'placed');
create type pipeline_stage as enum ('prospect', 'contacted', 'interested', 'committed', 'onboarded');
create type outreach_channel as enum ('call', 'email');
-- Sheet tokens (Appendix B.3) mapped to the BRD's prose labels (Section 3.5 / 4.8.3).
create type merge_status as enum (
  'email_sent', 'email_opened', 'email_clicked', 'responded',
  'not_interested', 'call_back_later', 'bounced'
);
create type jd_status as enum ('draft', 'published', 'applications_closed', 'shortlisting', 'closed');
create type application_status as enum (
  'applied', 'under_review', 'shortlisted', 'interview', 'selected', 'rejected', 'waitlisted'
);
create type default_activity_type as enum ('gl', 'summit', 'process', 'seminar');
create type cv_review_status as enum ('open', 'applied', 'dismissed');

-- ============================================================================
-- TENANCY, BATCHES, RBAC  (Section 4.9, Section 7)
-- ============================================================================

create table institutes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table batches (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes(id) on delete cascade,
  name text not null, -- e.g. "PGP 2024-26"
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (institute_id, name)
);

-- Role = base identity (Admin/SPC/BD/Recruiter/Student) or a clone of one
-- (e.g. "Senior SPC" cloned from SPC — Section 2, Section 7.1).
create table roles (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid references institutes(id) on delete cascade, -- null = system base role, shared across institutes
  name text not null,
  is_base_role boolean not null default false,
  cloned_from_role_id uuid references roles(id),
  created_at timestamptz not null default now(),
  unique (institute_id, name)
);

create table permission_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  actions jsonb not null default '[]', -- ["module:action", ...] — illustrative per Section 7.3, full CRUD matrix is Appendix/Section 9 open item
  created_at timestamptz not null default now()
);

create table role_permission_sets (
  role_id uuid not null references roles(id) on delete cascade,
  permission_set_id uuid not null references permission_sets(id) on delete cascade,
  primary key (role_id, permission_set_id)
);

-- users.company_id is added via ALTER after `companies` exists (Section 5 has a
-- users <-> companies cycle: a user can belong to a company, a company has an
-- owner/supervisor user).
create table users (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  status user_status not null default 'pending',
  batch_id uuid references batches(id), -- students/SPCs/BD: season they belong to
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institute_id, email)
);

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- Admin-assigned extra Permission Sets, independent of role (Section 7.1).
create table user_permission_sets (
  user_id uuid not null references users(id) on delete cascade,
  permission_set_id uuid not null references permission_sets(id) on delete cascade,
  primary key (user_id, permission_set_id)
);

-- ============================================================================
-- COMPANIES & OUTREACH CRM  (Section 4.1, Section 4.8)
-- ============================================================================

create table company_type_personas (
  id uuid primary key default gen_random_uuid(),
  category_name text not null unique, -- IT/Product, BFSI, Consulting, Core/Manufacturing, FMCG & Sales, Startup, PSU/Government, Analytics & Data
  template_content text not null default '',
  created_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes(id) on delete cascade,
  name text not null,
  sector text,
  pipeline_stage pipeline_stage not null default 'prospect',
  owner_user_id uuid references users(id), -- JPC
  supervisor_user_id uuid references users(id), -- Senior SPC
  jd_form_received boolean not null default false, -- standalone manual flag, Decision Log Appendix A
  past_hiring_history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column company_id uuid references companies(id); -- recruiter's employer

create table company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text,
  full_name text not null,
  last_name text,
  hr_designation text,
  email text,
  cc_email text,
  phone text,
  created_at timestamptz not null default now()
);

-- Row-per-touchpoint. call_remarks/spc_remarks/jpc_remark kept as three
-- distinct fields per Appendix B.3 (the live sheet has three, not two).
create table outreach_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references company_contacts(id),
  channel outreach_channel not null default 'email',
  call_remarks text,
  spc_remarks text,
  jpc_remark text,
  previous_mails_summary text,
  merge_status merge_status,
  logged_by_user_id uuid references users(id),
  logged_by_name text, -- fallback for pre-migration rows whose JPC has no user record yet (Appendix B.3)
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- STUDENTS  (Section 4.3, Section 4.6, Appendix B.1)
-- ============================================================================

create table students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id), -- null until the student's account is provisioned (roster import precedes signup)
  batch_id uuid not null references batches(id),
  roll_no text not null,
  display_seq int, -- Profile Sheet "S.No." — cosmetic ordering only, not a key (Appendix B.1)
  section text,
  name text not null,
  age int,
  gender text, -- masked pre-shortlist like phone/email, Appendix B.1 + Appendix E
  phone text,
  personal_email text,
  total_work_ex_months int not null default 0,
  prior_employers jsonb not null default '[]', -- up to 3, Section 5
  graduation_details jsonb not null default '{}',
  pg_details jsonb not null default '{}',
  tenth_twelfth_details jsonb not null default '{}',
  credentials jsonb not null default '[]',
  other_qualifications text,
  placement_status placement_status not null default 'unplaced',
  latest_cv_document_id uuid, -- FK added after cv_documents exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, roll_no)
);

create table default_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  activity_name text not null,
  activity_type default_activity_type not null,
  attended boolean not null default false,
  category_total int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- JDs & APPLICATIONS  (Section 4.1, Section 4.2, Section 4.3, Section 4.4)
-- ============================================================================

create table jds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  batch_id uuid not null references batches(id),
  created_by_user_id uuid references users(id),
  role_title text not null,
  grade text,
  ctc_fixed numeric,
  ctc_variable numeric,
  ctc_total numeric,
  locations text[] not null default '{}',
  eligible_branches text[] not null default '{}', -- empty = all
  eligible_specializations text[] not null default '{}',
  min_cgpa numeric,
  max_backlog int,
  unplaced_only boolean not null default true,
  open_positions int,
  jd_attachment_url text,
  apply_by_deadline timestamptz not null,
  status jd_status not null default 'draft',
  admin_approval_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  jd_id uuid not null references jds(id) on delete cascade,
  status application_status not null default 'applied',
  round_history jsonb not null default '[]',
  private_notes jsonb not null default '[]', -- FR-4.5, recruiter-only, never surfaced to student
  applied_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (student_id, jd_id)
);

-- FR-2.6: notification delivery + open-tracking, per student per JD.
create table jd_notifications (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid not null references jds(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  unique (jd_id, student_id)
);

create table placement_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references students(id) on delete cascade,
  company_id uuid not null references companies(id),
  jd_id uuid references jds(id),
  final_ctc numeric,
  role_title text,
  offer_date date,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- RESUME MAKER  (Section 4.10)
-- ============================================================================

create table cv_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  persona_id uuid references company_type_personas(id),
  version_no int not null default 1,
  template_id text not null default 'placement-cell-v2',
  ats_score numeric,
  jd_coverage_score numeric,
  file_url text,
  content jsonb not null default '{}', -- structured CV data (sections/bullets) that templates/exports render from
  is_latest boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table students
  add constraint students_latest_cv_fk foreign key (latest_cv_document_id) references cv_documents(id);

create table cv_review_comments (
  id uuid primary key default gen_random_uuid(),
  cv_document_id uuid not null references cv_documents(id) on delete cascade,
  spc_user_id uuid not null references users(id),
  anchor_section text not null,
  anchor_bullet_id text,
  comment_text text not null,
  status cv_review_status not null default 'open',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- FIELD-LEVEL SECURITY & AUDIT  (Section 7.4, Section 4.9)
-- ============================================================================

create table field_visibility_rules (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  field text not null,
  applies_to_permission_set_id uuid references permission_sets(id),
  unlock_condition text not null, -- e.g. 'shortlisted_on_jd'
  created_at timestamptz not null default now()
);

-- Append-only: no update/delete grants exist anywhere for this table (FR-9.3).
create table audit_log_entries (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes(id) on delete cascade,
  actor_user_id uuid references users(id),
  action text not null,
  target_entity text not null,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_batches_institute on batches(institute_id);
create index idx_users_institute on users(institute_id);
create index idx_users_batch on users(batch_id);
create index idx_users_company on users(company_id);
create index idx_companies_institute_stage on companies(institute_id, pipeline_stage);
create index idx_companies_owner on companies(owner_user_id);
create index idx_company_contacts_company on company_contacts(company_id);
create index idx_outreach_activities_company on outreach_activities(company_id);
create index idx_students_batch on students(batch_id);
create index idx_students_placement_status on students(placement_status);
create index idx_default_records_student on default_records(student_id);
create index idx_jds_company on jds(company_id);
create index idx_jds_batch_status on jds(batch_id, status);
create index idx_applications_student on applications(student_id);
create index idx_applications_jd on applications(jd_id);
create index idx_applications_jd_status on applications(jd_id, status);
create index idx_jd_notifications_jd on jd_notifications(jd_id);
create index idx_cv_documents_student on cv_documents(student_id);
create index idx_cv_review_comments_doc on cv_review_comments(cv_document_id);
create index idx_audit_log_institute_created on audit_log_entries(institute_id, created_at desc);

-- ============================================================================
-- 0002_rls_policies.sql
-- ============================================================================
-- Placement OS — RLS helper functions + policies
-- Implements the Role + Permission Set model from BRD Section 7.
--
-- NOTE (honest limitation): this enforces ROW-level access per Section 7.2/7.3.
-- It does not yet implement a full per-action CRUD matrix — Section 9's open
-- items list that explicitly as future work ("Full CRUD action matrix per
-- module... needed once build planning starts"). Field-level masking
-- (Section 7.4, phone/personal_email/gender) is NOT done here — RLS is
-- row-level, not column-level — see 0004_views.sql for that.

-- ============================================================================
-- HELPER FUNCTIONS  (security definer: read past RLS on the tables they join,
-- so they don't recurse into the policies that call them)
-- ============================================================================

create function current_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from users where auth_user_id = auth.uid();
$$;

create function current_institute_id() returns uuid
language sql stable security definer set search_path = public as $$
  select institute_id from users where auth_user_id = auth.uid();
$$;

create function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from users where auth_user_id = auth.uid();
$$;

create function current_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from students where user_id = current_user_id();
$$;

create function has_permission(perm_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join role_permission_sets rps on rps.role_id = ur.role_id
    join permission_sets ps on ps.id = rps.permission_set_id
    where ur.user_id = current_user_id() and ps.name = perm_name
  ) or exists (
    select 1 from user_permission_sets ups
    join permission_sets ps on ps.id = ups.permission_set_id
    where ups.user_id = current_user_id() and ps.name = perm_name
  );
$$;

create function has_role(role_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = current_user_id() and r.name = role_name
  );
$$;

-- Append-only audit log writer (Section 4.9 / FR-9.3): no direct insert policy
-- is granted on audit_log_entries, so every write goes through this function.
create function log_audit_event(p_action text, p_target_entity text, p_target_id uuid, p_metadata jsonb default '{}')
returns void
language sql security definer set search_path = public as $$
  insert into audit_log_entries (institute_id, actor_user_id, action, target_entity, target_id, metadata)
  values (current_institute_id(), current_user_id(), p_action, p_target_entity, p_target_id, p_metadata);
$$;

-- ============================================================================
-- TENANCY / RBAC TABLES
-- ============================================================================

alter table institutes enable row level security;
create policy institutes_select on institutes for select using (id = current_institute_id());

alter table batches enable row level security;
create policy batches_select on batches for select using (institute_id = current_institute_id());
create policy batches_write on batches for all
  using (institute_id = current_institute_id() and has_role('Admin'))
  with check (institute_id = current_institute_id() and has_role('Admin'));

alter table roles enable row level security;
create policy roles_select on roles for select using (institute_id is null or institute_id = current_institute_id());
create policy roles_write on roles for all
  using (has_permission('Role & Permission Management') and (institute_id is null or institute_id = current_institute_id()))
  with check (has_permission('Role & Permission Management') and (institute_id is null or institute_id = current_institute_id()));

alter table permission_sets enable row level security;
create policy permission_sets_select on permission_sets for select using (true);
create policy permission_sets_write on permission_sets for all
  using (has_permission('Role & Permission Management'))
  with check (has_permission('Role & Permission Management'));

alter table role_permission_sets enable row level security;
create policy role_permission_sets_select on role_permission_sets for select using (
  exists (select 1 from roles r where r.id = role_id and (r.institute_id is null or r.institute_id = current_institute_id()))
);
create policy role_permission_sets_write on role_permission_sets for all
  using (has_permission('Role & Permission Management'))
  with check (has_permission('Role & Permission Management'));

alter table users enable row level security;
create policy users_select on users for select using (institute_id = current_institute_id());
create policy users_update on users for update using (
  id = current_user_id() or has_permission('User Management')
) with check (
  id = current_user_id() or has_permission('User Management')
);
-- No client-side insert policy: account creation runs server-side (service role)
-- as part of the SSO/signup flow and the roster-import job (Section 3.4, 7.5).

alter table user_roles enable row level security;
create policy user_roles_select on user_roles for select using (
  exists (select 1 from users u where u.id = user_id and u.institute_id = current_institute_id())
);
create policy user_roles_write on user_roles for all
  using (has_permission('User Management'))
  with check (has_permission('User Management'));

alter table user_permission_sets enable row level security;
create policy user_permission_sets_select on user_permission_sets for select using (
  exists (select 1 from users u where u.id = user_id and u.institute_id = current_institute_id())
);
create policy user_permission_sets_write on user_permission_sets for all
  using (has_permission('User Management'))
  with check (has_permission('User Management'));

-- ============================================================================
-- COMPANIES & OUTREACH CRM
-- ============================================================================

alter table company_type_personas enable row level security;
create policy company_type_personas_select on company_type_personas for select using (true);
create policy company_type_personas_write on company_type_personas for all
  using (has_role('Admin')) with check (has_role('Admin'));

alter table companies enable row level security;
create policy companies_select on companies for select using (
  institute_id = current_institute_id()
  and (
    has_permission('CRM/Outreach') or has_permission('JD Management')
    or has_permission('Shortlist Oversight') or has_permission('Student Data - Full')
    or id = current_company_id()
    or owner_user_id = current_user_id() or supervisor_user_id = current_user_id()
  )
);
create policy companies_insert on companies for insert with check (
  institute_id = current_institute_id() and has_permission('CRM/Outreach')
);
create policy companies_update on companies for update using (
  institute_id = current_institute_id()
  and (has_permission('CRM/Outreach') or owner_user_id = current_user_id() or supervisor_user_id = current_user_id())
) with check (
  institute_id = current_institute_id()
  and (has_permission('CRM/Outreach') or owner_user_id = current_user_id() or supervisor_user_id = current_user_id())
);
create policy companies_delete on companies for delete using (
  institute_id = current_institute_id() and has_role('Admin')
);

alter table company_contacts enable row level security;
create policy company_contacts_select on company_contacts for select using (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or has_permission('JD Management') or has_permission('Shortlist Oversight')
         or c.id = current_company_id() or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
);
create policy company_contacts_write on company_contacts for all using (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
) with check (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
);

alter table outreach_activities enable row level security;
create policy outreach_activities_select on outreach_activities for select using (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
);
create policy outreach_activities_write on outreach_activities for all using (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
) with check (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
);

-- ============================================================================
-- STUDENTS & DEFAULTS
-- ============================================================================

alter table students enable row level security;
create policy students_select on students for select using (
  user_id = current_user_id()
  or exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id()
             and has_permission('Student Data - Full'))
  or exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.student_id = students.id and j.company_id = current_company_id()
    and has_permission('Shortlisting (recruiter-scoped)')
  )
);
create policy students_write on students for all using (
  exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id()
          and has_permission('Student Data - Full'))
) with check (
  -- BUG FIXED: this originally dropped the has_permission() check on INSERT,
  -- so any authenticated user (Student, Recruiter — anyone) could insert
  -- fabricated rows into `students` for any batch in their own institute.
  -- USING and WITH CHECK must match here, not just share the institute test.
  exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id()
          and has_permission('Student Data - Full'))
);
create policy students_self_update on students for update using (user_id = current_user_id())
  with check (user_id = current_user_id());

alter table default_records enable row level security;
create policy default_records_select on default_records for select using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or exists (
    select 1 from students s join batches b on b.id = s.batch_id
    where s.id = student_id and b.institute_id = current_institute_id() and has_permission('Student Data - Full')
  )
);
create policy default_records_write on default_records for all using (
  exists (
    select 1 from students s join batches b on b.id = s.batch_id
    where s.id = student_id and b.institute_id = current_institute_id() and has_permission('Student Data - Full')
  )
) with check (
  exists (
    select 1 from students s join batches b on b.id = s.batch_id
    where s.id = student_id and b.institute_id = current_institute_id() and has_permission('Student Data - Full')
  )
);

-- ============================================================================
-- JDs, APPLICATIONS, NOTIFICATIONS, PLACEMENT RECORDS
-- ============================================================================

alter table jds enable row level security;
create policy jds_select on jds for select using (
  exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id())
  and (
    status <> 'draft'
    or has_permission('Shortlist Oversight')
    or (has_permission('JD Management') and (current_company_id() is null or company_id = current_company_id()))
  )
);
create policy jds_insert on jds for insert with check (
  exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id())
  and has_permission('JD Management')
  and (current_company_id() is null or company_id = current_company_id())
);
create policy jds_update on jds for update using (
  has_permission('JD Management') and (current_company_id() is null or company_id = current_company_id())
) with check (
  has_permission('JD Management') and (current_company_id() is null or company_id = current_company_id())
);

alter table applications enable row level security;
create policy applications_select on applications for select using (
  student_id = current_student_id()
  or exists (select 1 from jds j where j.id = jd_id and j.company_id = current_company_id()
             and has_permission('Shortlisting (recruiter-scoped)'))
  or has_permission('Shortlist Oversight') or has_permission('Student Data - Full')
);
create policy applications_insert on applications for insert with check (
  student_id = current_student_id()
);
create policy applications_update on applications for update using (
  student_id = current_student_id()
  or exists (select 1 from jds j where j.id = jd_id and j.company_id = current_company_id()
             and has_permission('Shortlisting (recruiter-scoped)'))
  or has_permission('Shortlist Oversight')
) with check (
  -- Same boundary as USING: a student can't re-point their row at someone
  -- else's application, and a recruiter can't move it to a JD outside their
  -- own company, by changing student_id/jd_id mid-update.
  student_id = current_student_id()
  or exists (select 1 from jds j where j.id = jd_id and j.company_id = current_company_id()
             and has_permission('Shortlisting (recruiter-scoped)'))
  or has_permission('Shortlist Oversight')
);

alter table jd_notifications enable row level security;
create policy jd_notifications_select on jd_notifications for select using (
  student_id = current_student_id() or has_permission('JD Management') or has_permission('Shortlist Oversight')
);
create policy jd_notifications_write on jd_notifications for all using (
  has_permission('JD Management')
) with check (has_permission('JD Management'));

alter table placement_records enable row level security;
create policy placement_records_select on placement_records for select using (
  student_id = current_student_id()
  or has_permission('Reports & Export') or has_permission('Reports - View Only') or has_permission('Student Data - Full')
);
create policy placement_records_write on placement_records for all using (
  has_permission('Student Data - Full')
) with check (has_permission('Student Data - Full'));

-- ============================================================================
-- RESUME MAKER
-- ============================================================================

alter table cv_documents enable row level security;
create policy cv_documents_select on cv_documents for select using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or has_permission('Student Data - Full')
  or exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.student_id = cv_documents.student_id and j.company_id = current_company_id()
    and a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')
  )
);
create policy cv_documents_write on cv_documents for all using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or has_permission('Student Data - Full')
) with check (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or has_permission('Student Data - Full')
);

alter table cv_review_comments enable row level security;
create policy cv_review_comments_select on cv_review_comments for select using (
  exists (
    select 1 from cv_documents d join students s on s.id = d.student_id
    where d.id = cv_document_id and (s.user_id = current_user_id() or has_permission('Student Data - Full'))
  )
);
create policy cv_review_comments_insert on cv_review_comments for insert with check (
  has_permission('Student Data - Full') and spc_user_id = current_user_id()
);
create policy cv_review_comments_update on cv_review_comments for update using (
  spc_user_id = current_user_id()
  or exists (
    select 1 from cv_documents d join students s on s.id = d.student_id
    where d.id = cv_document_id and s.user_id = current_user_id()
  )
) with check (
  spc_user_id = current_user_id()
  or exists (
    select 1 from cv_documents d join students s on s.id = d.student_id
    where d.id = cv_document_id and s.user_id = current_user_id()
  )
);

-- RLS is row-level: the USING/CHECK above let a student update a comment row
-- they don't own the authorship of, so a trigger enforces the column-level
-- rule FR-10.5 actually needs — students may only flip `status`
-- (open/applied/dismissed, Section 5), never rewrite the SPC's comment text
-- or re-anchor it themselves.
create function enforce_cv_review_comment_student_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.spc_user_id <> current_user_id() then
    if new.comment_text is distinct from old.comment_text
      or new.anchor_section is distinct from old.anchor_section
      or new.anchor_bullet_id is distinct from old.anchor_bullet_id
      or new.spc_user_id is distinct from old.spc_user_id
      or new.cv_document_id is distinct from old.cv_document_id
    then
      raise exception 'Students may only change the status of a CV review comment';
    end if;
  end if;
  return new;
end;
$$;

create trigger cv_review_comments_student_update_guard
  before update on cv_review_comments
  for each row execute function enforce_cv_review_comment_student_update();

-- ============================================================================
-- CONFIG & AUDIT
-- ============================================================================

alter table field_visibility_rules enable row level security;
create policy field_visibility_rules_select on field_visibility_rules for select using (true);
create policy field_visibility_rules_write on field_visibility_rules for all
  using (has_role('Admin')) with check (has_role('Admin'));

alter table audit_log_entries enable row level security;
create policy audit_log_select on audit_log_entries for select using (
  institute_id = current_institute_id() and has_permission('Audit Log View')
);
-- No insert/update/delete policy: writes only via log_audit_event() (security definer).

-- ============================================================================
-- 0003_seed_reference_data.sql
-- ============================================================================
-- Placement OS — reference data seed
-- Base Roles + Permission Set catalog verbatim from BRD Section 7.2/7.3,
-- and the 8 Company-Type Personas from Section 4.8.2.
--
-- `actions` below is a best-effort split of Section 7.3's prose "Actions
-- Included" column into an array. Section 9 flags a real per-module CRUD
-- matrix as an open item for the next BRD pass — this is a placeholder
-- until that matrix exists, not the final action list.

insert into permission_sets (name, description, actions) values
  ('JD Management', 'View, Create, Edit, Publish, Approve (admin gate), Delete/Archive JDs',
   '["jd:view","jd:create","jd:edit","jd:publish","jd:approve","jd:delete"]'),
  ('Shortlist Oversight', 'View all shortlists (any company), override status, assign interview slots, send status-nudge reminders',
   '["shortlist:view_all","shortlist:override_status","shortlist:assign_slots","shortlist:send_reminders"]'),
  ('Shortlisting (recruiter-scoped)', 'View own applicants, move applicant status, add private notes, download candidate packets',
   '["applicants:view_own","applicants:move_status","applicants:add_notes","applicants:download_packet"]'),
  ('Student Data - Full', 'View all profile fields incl. contact info, bulk import/export roster, edit any student''s defaults record',
   '["students:view_full","students:bulk_import_export","students:edit_defaults"]'),
  ('Student Data - Restricted', 'View profile fields except phone/personal email (masked until shortlist stage)',
   '["students:view_restricted"]'),
  ('Own Profile', 'View/edit own profile, CV link, education details',
   '["profile:view_own","profile:edit_own"]'),
  ('Own Applications', 'Apply to JD, withdraw application, view own status timeline',
   '["applications:apply","applications:withdraw","applications:view_own_status"]'),
  ('Own Defaults View', 'View own default count/activity breakdown (read-only)',
   '["defaults:view_own"]'),
  ('Reports & Export', 'View placement dashboard, export Final Placement Datasheet, export custom templates',
   '["reports:view","reports:export_datasheet","reports:export_custom"]'),
  ('Reports - View Only', 'View placement dashboard (no export)',
   '["reports:view"]'),
  ('User Management', 'Approve/reject accounts, deactivate/reactivate users, assign Roles and extra Permission Sets',
   '["users:approve_reject","users:deactivate_reactivate","users:assign_roles_permissions"]'),
  ('Role & Permission Management', 'Create/clone/edit custom Roles and Permission Sets',
   '["roles:create_clone_edit"]'),
  ('CRM/Outreach', 'View company pipeline, log calls, run mail merge, manage outreach tasks/reminders',
   '["crm:view_pipeline","crm:log_calls","crm:mail_merge","crm:manage_tasks"]'),
  ('Audit Log View', 'View audit log entries (read-only for everyone, no edit/delete exists)',
   '["audit:view"]');

insert into roles (institute_id, name, is_base_role) values
  (null, 'Admin', true),
  (null, 'SPC', true),
  (null, 'BD', true),
  (null, 'Recruiter', true),
  (null, 'Student', true);

-- Section 7.2 default bundles
insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'Admin' and ps.name in (
  'JD Management', 'Shortlist Oversight', 'Student Data - Full', 'Reports & Export',
  'User Management', 'Role & Permission Management', 'CRM/Outreach', 'Audit Log View'
);

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'SPC' and ps.name in (
  'Shortlist Oversight', 'Student Data - Full', 'Reports - View Only'
);

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'BD' and ps.name in ('CRM/Outreach');

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'Recruiter' and ps.name in (
  'JD Management', 'Shortlisting (recruiter-scoped)', 'Student Data - Restricted'
);

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'Student' and ps.name in (
  'Own Profile', 'Own Applications', 'Own Defaults View'
);

-- Section 4.8.2 — eight fixed persona/template categories
insert into company_type_personas (category_name, template_content) values
  ('IT/Product', ''),
  ('BFSI', ''),
  ('Consulting', ''),
  ('Core/Manufacturing', ''),
  ('FMCG & Sales', ''),
  ('Startup', ''),
  ('PSU/Government', ''),
  ('Analytics & Data', '');

-- ============================================================================
-- 0004_settings_functions_views.sql
-- ============================================================================
-- Placement OS — institute settings, Eligibility Engine, masked recruiter view
--
-- ASSUMED JSONB SHAPE (Section 5 leaves these as opaque blobs; the roster
-- importer (FR-9.1) and eligibility engine (FR-2.1) both need to agree on
-- concrete keys, so this is the contract until Appendix B's real column
-- mapping is finalized against the live Profile Sheet):
--   students.graduation_details: { college, branch, cgpa, backlog_count, year }
--   students.pg_details:         { specialization, cgpa, year }
--
-- CAUTION for future migrations: never expose eligible_students_for_jd (or
-- any function reading unmasked students.phone/personal_email/gender) to the
-- `authenticated` role without an internal has_permission() guard — it's
-- security definer, so it bypasses RLS by design, and a recruiter calling it
-- unguarded would see every eligible student's contact fields regardless of
-- shortlist status (Section 7.4).

-- ============================================================================
-- INSTITUTE SETTINGS
-- Section 9 open items: "Configurable staleness threshold default (Section
-- 4.5) and who can change it" is explicitly unresolved in the BRD. The
-- defaults below are placeholders, not spec — revisit before pilot launch.
-- ============================================================================

create table institute_settings (
  institute_id uuid primary key references institutes(id) on delete cascade,
  defaults_threshold int not null default 4, -- FR-6.2: blocks/warns JD eligibility above this count
  staleness_days int not null default 3, -- FR-5.4: SPC dashboard staleness flag
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table institute_settings enable row level security;
create policy institute_settings_select on institute_settings for select using (institute_id = current_institute_id());
create policy institute_settings_write on institute_settings for all
  using (institute_id = current_institute_id() and has_role('Admin'))
  with check (institute_id = current_institute_id() and has_role('Admin'));

-- ============================================================================
-- DEFAULTS ROLL-UP  (FR-6.1 "rolling up to a Total Defaults count per student")
-- ============================================================================

create view student_defaults_summary with (security_invoker = true) as
select
  student_id,
  count(*) filter (where attended = false) as total_defaults,
  count(*) as total_activities
from default_records
group by student_id;

-- ============================================================================
-- ELIGIBILITY ENGINE  (Section 4.2, FR-2.1 through FR-2.3)
-- Internal id-only helper (no PII) — safe to build both the recruiter-facing
-- count and the Admin-facing row list on top of it.
-- ============================================================================

create function _eligible_student_ids_for_jd(p_jd_id uuid)
returns table (student_id uuid)
language sql stable security definer set search_path = public as $$
  select s.id
  from students s
  join jds j on j.id = p_jd_id
  left join institute_settings ist on ist.institute_id = (select b.institute_id from batches b where b.id = j.batch_id)
  left join student_defaults_summary sd on sd.student_id = s.id
  where s.batch_id = j.batch_id
    and (not j.unplaced_only or s.placement_status = 'unplaced')
    and (cardinality(j.eligible_branches) = 0 or (s.graduation_details ->> 'branch') = any (j.eligible_branches))
    and (cardinality(j.eligible_specializations) = 0 or (s.pg_details ->> 'specialization') = any (j.eligible_specializations))
    and (j.min_cgpa is null or coalesce((s.graduation_details ->> 'cgpa')::numeric, 0) >= j.min_cgpa)
    and (j.max_backlog is null or coalesce((s.graduation_details ->> 'backlog_count')::int, 0) <= j.max_backlog)
    and coalesce(sd.total_defaults, 0) < coalesce(ist.defaults_threshold, 2147483647);
$$;

revoke all on function _eligible_student_ids_for_jd(uuid) from public;

-- Both functions below are security definer, so they bypass RLS by
-- construction — a caller could invoke them directly (e.g. via PostgREST
-- RPC) with a *guessed* jd_id rather than one their own `jds` SELECT query
-- ever returned, so each one re-derives jds visibility inline (mirrors the
-- jds_select policy) instead of assuming the caller already passed it.
create function _jd_is_visible_to_caller(p_jd_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from jds j
    join batches b on b.id = j.batch_id
    where j.id = p_jd_id
      and b.institute_id = current_institute_id()
      and (
        j.status <> 'draft'
        or has_permission('Shortlist Oversight')
        or (has_permission('JD Management') and (current_company_id() is null or j.company_id = current_company_id()))
      )
  );
$$;

revoke all on function _jd_is_visible_to_caller(uuid) from public;
grant execute on function _jd_is_visible_to_caller(uuid) to authenticated;

-- FR-1.4: "System shows an estimated eligible-student count before publish."
-- No PII returned, safe for any authenticated caller who can see the JD.
create function eligible_student_count_for_jd(p_jd_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select case when _jd_is_visible_to_caller(p_jd_id)
    then (select count(*)::int from _eligible_student_ids_for_jd(p_jd_id))
    else 0
  end;
$$;

revoke all on function eligible_student_count_for_jd(uuid) from public;
grant execute on function eligible_student_count_for_jd(uuid) to authenticated;

-- FR-2.1: full eligible list, gated to Student Data - Full (Admin/SPC) per
-- FR-2.5 ("Admin can manually add/remove specific students from an eligible
-- list") — recruiters never see this, only the count above.
create function eligible_students_for_jd(p_jd_id uuid)
returns setof students
language sql stable security definer set search_path = public as $$
  select s.*
  from students s
  where has_permission('Student Data - Full')
    and _jd_is_visible_to_caller(p_jd_id)
    and s.id in (select student_id from _eligible_student_ids_for_jd(p_jd_id));
$$;

revoke all on function eligible_students_for_jd(uuid) from public;
grant execute on function eligible_students_for_jd(uuid) to authenticated;

-- ============================================================================
-- RECRUITER APPLICANT DIRECTORY  (Section 7.4 field-level masking)
-- security_invoker=true: relies on applications_select RLS to gate which
-- application rows a recruiter can see at all; this view only adds the
-- phone/personal_email/gender mask on top, per-application-row (not
-- per-student), so a student shortlisted at one company stays masked at
-- every other company that hasn't shortlisted them.
-- ============================================================================

create view applicant_directory with (security_invoker = true) as
select
  a.id as application_id,
  a.jd_id,
  a.student_id,
  a.status,
  a.round_history,
  a.applied_at,
  s.roll_no,
  s.name,
  s.total_work_ex_months,
  s.graduation_details ->> 'branch' as branch,
  s.pg_details ->> 'specialization' as specialization,
  coalesce((s.graduation_details ->> 'cgpa')::numeric, (s.pg_details ->> 'cgpa')::numeric) as cgpa,
  case when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted') then s.phone else null end as phone,
  case when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted') then s.personal_email else null end as personal_email,
  case when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted') then s.gender else null end as gender
from applications a
join students s on s.id = a.student_id
join jds j on j.id = a.jd_id;

-- ============================================================================
-- 0005_pilot_seed_data.sql
-- ============================================================================
-- Placement OS — pilot seed data
-- The IIM Raipur single-tenant pilot (BRD Section 12.2) needs exactly one
-- `institutes` row to exist so app code has something to resolve
-- NEXT_PUBLIC_INSTITUTE_SLUG against (see src/app/actions/auth.ts). Nothing
-- else in the schema depends on this specific row — swap the name/slug for
-- a different pilot institute freely.

insert into institutes (name, slug) values ('IIM Raipur', 'iim-raipur')
on conflict (slug) do nothing;

insert into batches (institute_id, name, is_active)
select id, 'PGP 2024-26', true from institutes where slug = 'iim-raipur'
on conflict (institute_id, name) do nothing;

insert into institute_settings (institute_id, defaults_threshold, staleness_days)
select id, 4, 3 from institutes where slug = 'iim-raipur'
on conflict (institute_id) do nothing;

-- ============================================================================
-- 0006_student_self_service.sql
-- ============================================================================
-- Placement OS — student self-service eligibility check
--
-- FR-3.4: "Students can self-check eligibility and see the specific reason
-- if blocked (e.g. open defaults)." Unlike the recruiter-facing functions in
-- 0004 (which had to be hardened against cross-tenant/cross-student
-- snooping), this one is safe to expose broadly by construction: it always
-- evaluates against current_student_id() — the CALLING student's own row —
-- so there is no argument that lets a caller ask about anyone else.

create function my_eligibility_for_jd(p_jd_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_student students%rowtype;
  v_jd jds%rowtype;
  v_defaults int;
  v_threshold int;
  v_reasons jsonb := '[]'::jsonb;
  v_eligible boolean := true;
begin
  select * into v_student from students where id = current_student_id();
  if v_student.id is null then
    return jsonb_build_object('eligible', false, 'reasons', jsonb_build_array('No student profile linked to your account yet'));
  end if;

  select * into v_jd from jds where id = p_jd_id;
  if v_jd.id is null or not _jd_is_visible_to_caller(p_jd_id) then
    return jsonb_build_object('eligible', false, 'reasons', jsonb_build_array('JD not found'));
  end if;

  if v_student.batch_id <> v_jd.batch_id then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Not part of the eligible batch for this JD');
  end if;

  if v_jd.unplaced_only and v_student.placement_status <> 'unplaced' then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('This JD is for unplaced students only, and you are already placed');
  end if;

  if cardinality(v_jd.eligible_branches) > 0
     and not (coalesce(v_student.graduation_details ->> 'branch', '') = any (v_jd.eligible_branches)) then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Your branch is not in the eligible list for this JD');
  end if;

  if cardinality(v_jd.eligible_specializations) > 0
     and not (coalesce(v_student.pg_details ->> 'specialization', '') = any (v_jd.eligible_specializations)) then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Your specialization is not in the eligible list for this JD');
  end if;

  if v_jd.min_cgpa is not null and coalesce((v_student.graduation_details ->> 'cgpa')::numeric, 0) < v_jd.min_cgpa then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Your CGPA is below the minimum required for this JD');
  end if;

  if v_jd.max_backlog is not null and coalesce((v_student.graduation_details ->> 'backlog_count')::int, 0) > v_jd.max_backlog then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Your backlog count exceeds the maximum allowed for this JD');
  end if;

  select coalesce(total_defaults, 0) into v_defaults
  from student_defaults_summary where student_id = v_student.id;

  select ist.defaults_threshold into v_threshold
  from institute_settings ist join batches b on b.institute_id = ist.institute_id
  where b.id = v_student.batch_id;

  if coalesce(v_defaults, 0) >= coalesce(v_threshold, 2147483647) then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array(
      'You have ' || coalesce(v_defaults, 0) || ' open default(s), at or above the threshold for this JD'
    );
  end if;

  return jsonb_build_object('eligible', v_eligible, 'reasons', v_reasons);
end;
$$;

revoke all on function my_eligibility_for_jd(uuid) from public;
grant execute on function my_eligibility_for_jd(uuid) to authenticated;

-- ============================================================================
-- 0007_spc_coordination.sql
-- ============================================================================
-- Placement OS — SPC Coordination (Section 4.5)
--
-- Closes a gap before it ships rather than after: applications_update RLS
-- (0002) is row-level only — a student who owns their application row can
-- currently UPDATE any column on it, including round_history and status,
-- since RLS doesn't see columns. Nothing exploited that yet because the app
-- only ever sent {withdrawn_at} for a student caller — but the
-- append_application_round() RPC below is callable directly by any
-- authenticated user (Supabase RPCs aren't gated by what the UI shows), so
-- the column-level rule needs a trigger, same pattern as
-- enforce_cv_review_comment_student_update() in 0002.

create function enforce_application_student_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.student_id = current_student_id() then
    if new.status is distinct from old.status
      or new.round_history is distinct from old.round_history
      or new.private_notes is distinct from old.private_notes
      or new.student_id is distinct from old.student_id
      or new.jd_id is distinct from old.jd_id
    then
      raise exception 'Students may only withdraw an application (set withdrawn_at), not change its status, rounds, or notes';
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_student_update_guard
  before update on applications
  for each row execute function enforce_application_student_update();

-- FR-5.2: assign interview slots/rooms/links to shortlisted students.
-- round_history is the only place Section 5 models this (no separate
-- InterviewSlot entity), so a round is one jsonb object appended to that
-- array: {round, scheduled_at, location, assigned_by_user_id, assigned_at}.
--
-- Deliberately NOT security definer: the UPDATE inside runs as the calling
-- user, so applications_update RLS (recruiter/SPC/Admin only, per the
-- trigger above) applies exactly as it would to a direct .update() call —
-- this function exists only to make the jsonb append atomic, not to change
-- who's allowed to do it.
create function append_application_round(p_application_id uuid, p_round_entry jsonb)
returns void
language sql as $$
  update applications
  set round_history = round_history || jsonb_build_array(p_round_entry),
      updated_at = now()
  where id = p_application_id;
$$;

grant execute on function append_application_round(uuid, jsonb) to authenticated;

-- FR-5.1/FR-5.4: SPC dashboard — every active JD's shortlist count and a
-- staleness flag (no round update within institute_settings.staleness_days).
-- security_invoker=true: relies on jds_select/applications_select RLS, so
-- the shortlisted_count/total_applications subqueries only count what the
-- CALLER can see — correct and non-leaking for Admin/SPC (who see
-- everything relevant via Shortlist Oversight), but meaningless
-- (undercounted) if a Student or unrelated Recruiter ever queries it
-- directly. Gate the page that reads this to SPC/Admin, same as the
-- roster-import page is gated to Admin.
create view spc_pipeline_overview with (security_invoker = true) as
select
  j.id as jd_id,
  j.role_title,
  j.status as jd_status,
  j.updated_at as jd_updated_at,
  c.id as company_id,
  c.name as company_name,
  (select count(*) from applications a
     where a.jd_id = j.id and a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')) as shortlisted_count,
  (select count(*) from applications a where a.jd_id = j.id) as total_applications,
  -- coalesce staleness_days itself (not just the final boolean): don't rely
  -- on make_interval's NULL-argument behavior when an explicit default costs nothing.
  (now() - j.updated_at) > make_interval(days => coalesce(ist.staleness_days, 2147483647)) as is_stale
from jds j
join companies c on c.id = j.company_id
join batches b on b.id = j.batch_id
left join institute_settings ist on ist.institute_id = b.institute_id
where j.status <> 'draft';

-- ============================================================================
-- 0008_defaults_unique_constraint.sql
-- ============================================================================
-- Placement OS — default_records needs a natural key before it can support
-- a re-importable CSV upload (FR-6.3), same reasoning as the students
-- (batch_id, roll_no) unique constraint in 0001: without one, re-importing
-- the same defaults sheet just duplicates rows and silently inflates every
-- student's Total Defaults count.
alter table default_records add constraint default_records_student_activity_unique
  unique (student_id, activity_name);

-- ============================================================================
-- 0009_resume_maker.sql
-- ============================================================================
-- Placement OS — Resume Maker working baseline (BRD Section 4.10)
--
-- Adds the application -> CV snapshot link required by FR-10.6, enforces a
-- single current CV per student, and narrows recruiter access to the exact CV
-- attached to their shortlisted application (not every CV that student owns).

-- CV version numbers are unique within a persona. PostgreSQL treats nulls as
-- distinct in a normal unique index, so the unassigned/default persona needs
-- its own partial index.
create unique index cv_documents_persona_version_unique
  on cv_documents (student_id, persona_id, version_no)
  where persona_id is not null;

create unique index cv_documents_default_version_unique
  on cv_documents (student_id, version_no)
  where persona_id is null;

create unique index cv_documents_one_latest_per_student
  on cv_documents (student_id)
  where is_latest;

-- Switch the current CV atomically whenever a document is inserted or marked
-- latest. The function is security definer because students intentionally do
-- not have direct UPDATE access to their roster row.
create function prepare_latest_cv_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_latest then
    update cv_documents
      set is_latest = false
      where student_id = new.student_id
        and id <> new.id
        and is_latest;
  end if;
  return new;
end;
$$;

create trigger cv_documents_prepare_latest
  before insert or update of is_latest on cv_documents
  for each row execute function prepare_latest_cv_document();

create function sync_student_latest_cv_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_latest then
      update students set latest_cv_document_id = null where id = old.student_id;
    end if;
    return old;
  end if;

  if new.is_latest then
    update students set latest_cv_document_id = new.id where id = new.student_id;
  elsif old.is_latest and not new.is_latest then
    update students
      set latest_cv_document_id = null
      where id = old.student_id and latest_cv_document_id = old.id;
  end if;
  return new;
end;
$$;

create trigger cv_documents_sync_student_latest
  after insert or update of is_latest or delete on cv_documents
  for each row execute function sync_student_latest_cv_document();

alter table applications
  add column cv_document_id uuid references cv_documents(id) on delete restrict;

-- Existing applications receive the student's current CV where one exists.
update applications a
  set cv_document_id = s.latest_cv_document_id
  from students s
  where s.id = a.student_id and s.latest_cv_document_id is not null;

-- New applications capture a CV snapshot. Later CV edits/versions do not
-- silently alter the packet already submitted for that application.
create function attach_latest_cv_to_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  document_student_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.student_id is distinct from old.student_id
    or new.cv_document_id is distinct from old.cv_document_id
  ) then
    raise exception 'An application CV snapshot cannot be replaced after submission';
  end if;

  if new.cv_document_id is null then
    select latest_cv_document_id into new.cv_document_id
      from students where id = new.student_id;
  end if;

  if new.cv_document_id is not null then
    select student_id into document_student_id
      from cv_documents where id = new.cv_document_id;
    if document_student_id is distinct from new.student_id then
      raise exception 'The attached CV does not belong to this student';
    end if;
  end if;

  return new;
end;
$$;

create trigger applications_attach_latest_cv
  before insert or update of student_id, cv_document_id on applications
  for each row execute function attach_latest_cv_to_application();

-- Recruiters may read only the document attached to an application belonging
-- to their company, and only after that application is shortlisted. Students
-- own their documents; SPC/Admin review through Student Data - Full.
drop policy cv_documents_select on cv_documents;
create policy cv_documents_select on cv_documents for select using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or has_permission('Student Data - Full')
  or exists (
    select 1
      from applications a
      join jds j on j.id = a.jd_id
      where a.cv_document_id = cv_documents.id
        and j.company_id = current_company_id()
        and a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')
  )
);

-- SPC reviewers comment instead of mutating a student's CV directly.
drop policy cv_documents_write on cv_documents;
create policy cv_documents_write on cv_documents for all using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
) with check (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
);

create index idx_applications_cv_document on applications(cv_document_id);

-- ============================================================================
-- 0010_bulk_shortlisting.sql
-- ============================================================================
-- Placement OS — atomic bulk shortlisting (BRD FR-4.3)
--
-- This function is intentionally SECURITY INVOKER. The UPDATE runs through
-- applications_update RLS, including the recruiter-own-company boundary and
-- the student column guard from 0007. The function groups the status and
-- optional round-label update into one statement so it cannot partially apply.

-- Preserve the BRD's composable-role rule: a Student who is also an SPC or
-- Recruiter must be allowed to exercise their elevated shortlisting permission
-- on their own application. Without this permission check, 0007's student
-- column guard would treat the caller only as a Student and block the update.
create or replace function enforce_application_student_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.student_id = current_student_id()
    and not has_permission('Shortlist Oversight')
    and not has_permission('Shortlisting (recruiter-scoped)')
  then
    if new.status is distinct from old.status
      or new.round_history is distinct from old.round_history
      or new.private_notes is distinct from old.private_notes
      or new.student_id is distinct from old.student_id
      or new.jd_id is distinct from old.jd_id
    then
      raise exception 'Students may only withdraw an application (set withdrawn_at), not change its status, rounds, or notes';
    end if;
  end if;
  return new;
end;
$$;

create function bulk_update_application_status(
  p_jd_id uuid,
  p_application_ids uuid[],
  p_status application_status,
  p_round_label text default null
) returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  if coalesce(array_length(p_application_ids, 1), 0) = 0 then
    raise exception 'Select at least one application';
  end if;
  if array_length(p_application_ids, 1) > 500 then
    raise exception 'A bulk action is limited to 500 applications';
  end if;
  if length(coalesce(p_round_label, '')) > 100 then
    raise exception 'Round label must be 100 characters or fewer';
  end if;

  update applications
  set status = p_status,
      round_history = case
        when nullif(trim(p_round_label), '') is null then round_history
        else round_history || jsonb_build_array(jsonb_build_object(
          'round', trim(p_round_label),
          'scheduled_at', null,
          'location', null,
          'assigned_by_user_id', current_user_id(),
          'assigned_at', now()
        ))
      end,
      updated_at = now()
  where jd_id = p_jd_id
    and id = any(p_application_ids);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function bulk_update_application_status(uuid, uuid[], application_status, text)
  to authenticated;

-- ============================================================================
-- 0011_students_self_update_guard.sql
-- ============================================================================
-- Placement OS — close a real gap in students_self_update (0002_rls_policies.sql)
--
-- `students_self_update` allows a student to UPDATE their own `students` row
-- with NO column restriction at all — RLS is row-level, and that policy's
-- USING/WITH CHECK is just `user_id = current_user_id()`. Nothing in the app
-- currently exercises this (the CV-sync triggers in 0009 write
-- `latest_cv_document_id` via SECURITY DEFINER, bypassing RLS entirely, so
-- they never needed this policy to be permissive), which is exactly why it
-- went unnoticed through the earlier security passes on 0002 — there was no
-- feature surface pointing at it to prompt a second look.
--
-- The actual exposure: a student can currently call
-- `supabase.from('students').update({ graduation_details: {...} })` directly
-- from their own authenticated session and rewrite their own CGPA, branch,
-- or backlog_count — the exact fields the Eligibility Engine
-- (_eligible_student_ids_for_jd, 0004) trusts unconditionally. That's a
-- direct bypass of every CGPA/branch/backlog eligibility gate in the system,
-- and it also lets a student flip their own `placement_status` or reassign
-- `batch_id`. None of this requires a bug in application code — it works
-- against the raw Supabase client with no server action involved at all.
--
-- Fixed the same way as the applications/cv_review_comments column-level
-- gaps: a trigger restricts a genuine self-update to phone/personal_email
-- only. pg_trigger_depth() = 0 is what distinguishes an actual top-level
-- client update from the nested `UPDATE students` that
-- sync_student_latest_cv_document() (0009) issues from inside a
-- cv_documents trigger — that nested write also matches
-- `old.user_id = current_user_id()` (a student's own CV activity updates
-- their own row) but must not be blocked, or CV auto-attach breaks silently.

create function enforce_student_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 0 and old.user_id = current_user_id() then
    if new.roll_no is distinct from old.roll_no
      or new.batch_id is distinct from old.batch_id
      or new.user_id is distinct from old.user_id
      or new.display_seq is distinct from old.display_seq
      or new.section is distinct from old.section
      or new.name is distinct from old.name
      or new.age is distinct from old.age
      or new.gender is distinct from old.gender
      or new.total_work_ex_months is distinct from old.total_work_ex_months
      or new.prior_employers is distinct from old.prior_employers
      or new.graduation_details is distinct from old.graduation_details
      or new.pg_details is distinct from old.pg_details
      or new.tenth_twelfth_details is distinct from old.tenth_twelfth_details
      or new.credentials is distinct from old.credentials
      or new.other_qualifications is distinct from old.other_qualifications
      or new.placement_status is distinct from old.placement_status
      or new.latest_cv_document_id is distinct from old.latest_cv_document_id
    then
      raise exception 'Students may self-update only phone and personal_email — other fields are institute-managed records (roster import, CV activity, placement confirmation)';
    end if;
  end if;
  return new;
end;
$$;

create trigger students_self_update_guard
  before update on students
  for each row execute function enforce_student_self_update();

-- ============================================================================
-- 0012_codex_audit_fixes.sql
-- ============================================================================
-- Placement OS — fixes for Codex's independent BRD/security audit
-- (docs/BRD-IMPLEMENTATION-STATUS.md, "Release-blocking findings" #1,2,4-8).
-- Each finding was re-verified against the actual current policies/functions
-- before being fixed here — see the README security note for the write-up.
-- (#3, students_self_update, was already fixed in 0011 before this audit
-- landed; #4's fix is in the app code, not here — see reports/export/route.ts.)

-- ============================================================================
-- #2 (highest leverage — fixes #1 as a side effect too): current_user_id()
-- and current_company_id() must require status = 'active'.
--
-- Before this, a Pending or Deactivated user's `current_user_id()` still
-- resolved to their real id, and has_permission()/has_role() both key off
-- current_user_id() internally — so a self-registered Recruiter (created
-- Pending, but already holding the Recruiter role's default Permission Sets
-- per FR-1.1's own signup flow) could call JD Management/etc RPCs and RLS
-- would grant it, before any Admin approval. The dashboard's "waiting for
-- approval" message was cosmetic; nothing in the database actually enforced
-- Pending/Deactivated as a real access boundary.
--
-- current_institute_id() is deliberately left ungated: a Pending user still
-- needs to see their own `users` row (institute_id = current_institute_id())
-- so their own dashboard can render the waiting-for-approval state at all.
-- The dangerous surface is has_permission()/has_role() and anything scoped
-- to "my own company/student record" for touching OTHER tables — all of
-- which route through current_user_id(), so gating that one function is the
-- single highest-leverage fix (has_role, has_permission, and
-- current_student_id all call current_user_id() internally already).

create or replace function current_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from users where auth_user_id = auth.uid() and status = 'active';
$$;

create or replace function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from users where auth_user_id = auth.uid() and status = 'active';
$$;

-- ============================================================================
-- #1: users_update has no column guard. Once a user IS active,
-- `id = current_user_id()` still lets them rewrite `status`, `company_id`,
-- `batch_id`, `institute_id`, `auth_user_id`, or `email` on their own row —
-- e.g. an active Recruiter could reassign their own company_id to a
-- different company and inherit that company's JD/applicant access via
-- current_company_id(). The status-gating fix above blocks a Pending user
-- from touching their own row at all, but does nothing for an already-Active
-- user editing privileged columns on themselves. Same pattern as every
-- other column-guard trigger in this codebase: self-service update allowed,
-- narrowed to a safe column allowlist (name only).
-- ============================================================================

create function enforce_user_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.id = current_user_id() and not has_permission('User Management') then
    if new.status is distinct from old.status
      or new.institute_id is distinct from old.institute_id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.batch_id is distinct from old.batch_id
      or new.company_id is distinct from old.company_id
      or new.email is distinct from old.email
    then
      raise exception 'Users may self-update only their name — status, institute, batch, company, and email are Admin-managed';
    end if;
  end if;
  return new;
end;
$$;

create trigger users_self_update_guard
  before update on users
  for each row execute function enforce_user_self_update();

-- ============================================================================
-- #7: students_select's recruiter clause has no status filter at all —
-- a recruiter could SELECT a student's full unmasked row (phone,
-- personal_email, gender) for ANY student who applied to their company,
-- the moment they apply, regardless of shortlist status. The
-- `applicant_directory` view (0004) correctly masks these fields, but a
-- view only helps if the client chooses to query it — RLS on the raw
-- `students` table grants the same columns independently, and a client can
-- always query the raw table directly. This is the actual Section 7.4
-- enforcement boundary; the view was necessary but not sufficient.
-- ============================================================================

drop policy students_select on students;
create policy students_select on students for select using (
  user_id = current_user_id()
  or exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id()
             and has_permission('Student Data - Full'))
  or exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.student_id = students.id and j.company_id = current_company_id()
    and has_permission('Shortlisting (recruiter-scoped)')
    and a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')
  )
);

-- ============================================================================
-- #8: applications.private_notes (FR-4.5, "not visible to the student") was
-- reachable by the student who owns that application row — applications_select
-- grants `student_id = current_student_id()` full-row access, private_notes
-- included, and hiding a column in the React page is not a security
-- boundary. RLS is row-level, not column-level, so the only real fix is
-- moving the column to its own table whose SELECT policy never has a
-- student-visible branch at all. Currently dormant (no feature writes to it
-- yet, per grep across src/), fixed now so it's never live at all rather
-- than fixed retroactively once a recruiter-notes UI ships.
-- ============================================================================

alter table applications drop column private_notes;

create table application_private_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  author_user_id uuid not null references users(id),
  note_text text not null,
  created_at timestamptz not null default now()
);

alter table application_private_notes enable row level security;

-- No student-visible branch anywhere in this policy — that omission is the
-- entire point of splitting this out of `applications`.
create policy application_private_notes_select on application_private_notes for select using (
  exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.id = application_id
      and (
        (j.company_id = current_company_id() and has_permission('Shortlisting (recruiter-scoped)'))
        or has_permission('Shortlist Oversight')
        or has_permission('Student Data - Full')
      )
  )
);

create policy application_private_notes_write on application_private_notes for all using (
  exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.id = application_id
      and j.company_id = current_company_id()
      and has_permission('Shortlisting (recruiter-scoped)')
  )
) with check (
  exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.id = application_id
      and j.company_id = current_company_id()
      and has_permission('Shortlisting (recruiter-scoped)')
  )
);

create index idx_application_private_notes_application on application_private_notes(application_id);

-- ============================================================================
-- #5: FR-8.10 "Senior SPC/Admin can reassign a company's Owner" — but
-- companies_update lets ANY CRM/Outreach holder (a plain JPC/BD, not just
-- their supervising Senior SPC) or the current owner/supervisor themselves
-- change owner_user_id/supervisor_user_id. There's no dedicated "Senior SPC"
-- permission set to check directly (it's realized as being the row's own
-- supervisor_user_id, per the Owner/Supervisor model in Section 4.8.1) — so
-- the closest correct enforcement is: only Admin, or whoever is ALREADY the
-- assigned supervisor of this specific company, may change either field.
-- ============================================================================

create function enforce_company_reassignment_scope() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.owner_user_id is distinct from old.owner_user_id
      or new.supervisor_user_id is distinct from old.supervisor_user_id)
    and not has_role('Admin')
    and old.supervisor_user_id is distinct from current_user_id()
  then
    raise exception 'Only Admin or this company''s assigned Supervisor (Senior SPC) may reassign Owner/Supervisor (FR-8.10)';
  end if;
  return new;
end;
$$;

create trigger companies_reassignment_guard
  before update on companies
  for each row execute function enforce_company_reassignment_scope();

-- ============================================================================
-- #6: spc_pipeline_overview's staleness compared now() to jds.updated_at,
-- but round scheduling (append_application_round, 0007) and status changes
-- (updateApplicationStatus / bulk_update_application_status, 0010) all write
-- applications.updated_at, never jds.updated_at. Nothing besides editing the
-- JD row itself ever bumped the column staleness was measured against, so a
-- JD with constant round activity but no direct edits would eventually show
-- stale regardless, and a JD edited once but never touched again would look
-- perpetually fresh. Staleness now tracks whichever is more recent: the JD
-- row itself, or the latest application activity on it.
-- ============================================================================

drop view spc_pipeline_overview;
create view spc_pipeline_overview with (security_invoker = true) as
select
  j.id as jd_id,
  j.role_title,
  j.status as jd_status,
  greatest(j.updated_at, coalesce(activity.last_activity_at, j.updated_at)) as jd_updated_at,
  c.id as company_id,
  c.name as company_name,
  coalesce(activity.shortlisted_count, 0) as shortlisted_count,
  coalesce(activity.total_applications, 0) as total_applications,
  (now() - greatest(j.updated_at, coalesce(activity.last_activity_at, j.updated_at)))
    > make_interval(days => coalesce(ist.staleness_days, 2147483647)) as is_stale
from jds j
join companies c on c.id = j.company_id
join batches b on b.id = j.batch_id
left join institute_settings ist on ist.institute_id = b.institute_id
left join lateral (
  select
    count(*) filter (where a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')) as shortlisted_count,
    count(*) as total_applications,
    max(a.updated_at) as last_activity_at
  from applications a
  where a.jd_id = j.id
) activity on true
where j.status <> 'draft';

-- ============================================================================
-- 0013_jd_lifecycle.sql
-- ============================================================================
-- Placement OS — FR-1.2/FR-1.3 JD lifecycle completion (Claude's track,
-- docs/HANDOVER-CODEX.md — migrations this round numbered from 0013 by
-- agreement to avoid a repeat of the earlier 0010 filename collision).
--
-- FR-1.2's remaining fields (grade, eligible_specializations, max_backlog,
-- open_positions) already existed as columns since 0001 — the JD creation
-- form just never captured them. No schema change needed for those, only
-- app code (src/app/(dashboard)/jds/new/page.tsx, src/app/actions/jds.ts).
--
-- FR-1.3's remaining piece — "Draft → (optional Admin approval) →
-- Published → Applications Closed → Shortlisting → Closed" plus
-- valid-transition enforcement — needed a real trigger: `jds_update` RLS
-- already lets any JD Management holder (recruiter-own-company or Admin)
-- change `status` to anything, since RLS is row-level and doesn't reason
-- about state machines. Two separate rules, both enforced here rather than
-- only in the UI (same reasoning as every other guard trigger this session
-- — RLS/UI can't be the only thing standing between a caller and an
-- invalid state):
--   1. If a JD has admin_approval_required = true, only an Admin may move
--      it out of Draft — a Recruiter's own "publish" attempt is blocked,
--      not silently downgraded to some other state.
--   2. Transitions must follow the BRD's stated linear sequence. Admin can
--      override (e.g. force-close a stuck JD), matching Section 3.4's
--      "Admin has full visibility... can override a shortlist status."

create function enforce_jd_status_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'published'
      and old.admin_approval_required and not has_role('Admin')
    then
      raise exception 'This JD requires Admin approval before publishing';
    end if;

    if not (
      (old.status = 'draft' and new.status = 'published')
      or (old.status = 'published' and new.status = 'applications_closed')
      or (old.status = 'applications_closed' and new.status = 'shortlisting')
      or (old.status = 'shortlisting' and new.status = 'closed')
      or (old.status = 'published' and new.status = 'closed') -- closing directly is valid when shortlisting was never opened as its own phase
      or has_role('Admin')
    ) then
      raise exception 'Invalid JD status transition: % to %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger jds_status_transition_guard
  before update of status on jds
  for each row execute function enforce_jd_status_transition();

-- ============================================================================
-- 0014_masked_candidate_packets.sql
-- ============================================================================
-- Placement OS — masked candidate packets (BRD FR-4.4)
--
-- Recruiters need the Profile Sheet + attached CV to make a shortlist decision,
-- but direct SELECT on students/cv_documents is intentionally unavailable until
-- shortlist because those rows contain contact data. This RPC is the safe bridge:
-- it explicitly re-checks company/institute scope and returns redacted JSON before
-- shortlist, then the complete packet after shortlist. Raw-table RLS is unchanged.

create function get_candidate_packets(p_application_ids uuid[])
returns table (
  application_id uuid,
  student jsonb,
  cv_document jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(cardinality(p_application_ids), 0) > 500 then
    raise exception 'Candidate packet requests are limited to 500 applications';
  end if;

  return query
  select
    a.id,
    case
      when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted') then to_jsonb(s)
      else to_jsonb(s) || jsonb_build_object(
        'phone', null,
        'personal_email', null,
        'gender', null
      )
    end as student,
    case
      when cv.id is null then null
      when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted') then to_jsonb(cv)
      else jsonb_set(
        jsonb_set(
          to_jsonb(cv),
          '{content,personalInfo,email}',
          '""'::jsonb,
          true
        ),
        '{content,personalInfo,phone}',
        '""'::jsonb,
        true
      )
    end as cv_document
  from applications a
  join jds j on j.id = a.jd_id
  join batches b on b.id = j.batch_id
  join students s on s.id = a.student_id
  left join cv_documents cv on cv.id = a.cv_document_id
  where a.id = any(coalesce(p_application_ids, array[]::uuid[]))
    and (
      (
        j.company_id = current_company_id()
        and has_permission('Shortlisting (recruiter-scoped)')
      )
      or (
        b.institute_id = current_institute_id()
        and (
          has_permission('Shortlist Oversight')
          or has_permission('Student Data - Full')
        )
      )
    );
end;
$$;

revoke all on function get_candidate_packets(uuid[]) from public;
grant execute on function get_candidate_packets(uuid[]) to authenticated;

-- ============================================================================
-- 0015_outreach_persona_templates.sql
-- ============================================================================
-- Placement OS — real starter content for all eight FR-8.4 company personas.
-- Tokens are resolved by src/lib/outreach-templates.ts before the editable
-- preview is logged. Sender identity always comes from the active user.

update company_type_personas set template_content = $template$Subject: Campus hiring partnership with {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

I am reaching out from our placement team to explore campus hiring opportunities with {{company_name}}. Our cohort includes candidates with product thinking, software, analytics, and cross-functional problem-solving experience who can contribute across engineering, product, customer success, and business roles.

We would be glad to share the batch profile and discuss a role-specific campus process at your convenience.

Regards,
{{sender_name}}
{{sender_email}}$template$ where category_name = 'IT/Product';

update company_type_personas set template_content = $template$Subject: Campus talent for BFSI roles at {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

We would like to invite {{company_name}} to engage with our current cohort for banking, financial services, insurance, risk, operations, and relationship-management opportunities. The batch brings a mix of quantitative ability, commercial judgment, and prior industry exposure.

May we schedule a brief conversation to understand your hiring plan and share relevant candidate profiles?

Regards,
{{sender_name}}
{{sender_email}}$template$ where category_name = 'BFSI';

update company_type_personas set template_content = $template$Subject: Consulting campus engagement — {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

I am writing to explore a campus engagement with {{company_name}}. Our students are trained in structured problem solving, research, analytics, stakeholder communication, and team-based case work, with experience across several industries.

We can tailor the process to your preferred case, interview, and assessment format and share a focused candidate pool.

Regards,
{{sender_name}}
{{sender_email}}$template$ where category_name = 'Consulting';

update company_type_personas set template_content = $template$Subject: Campus hiring for operations and core-industry roles

Dear {{contact_title}} {{contact_last_name}},

Our placement team would value the opportunity to partner with {{company_name}} for operations, supply chain, manufacturing, procurement, project, and general-management roles. The cohort combines management training with diverse technical and on-ground work experience.

Please let us know a suitable time to discuss your talent requirements and the upcoming campus calendar.

Regards,
{{sender_name}}
{{sender_email}}$template$ where category_name = 'Core/Manufacturing';

update company_type_personas set template_content = $template$Subject: Sales and marketing talent from our current cohort

Dear {{contact_title}} {{contact_last_name}},

We are keen to explore campus opportunities with {{company_name}} across sales, marketing, category, distribution, and customer-facing roles. Our students bring strong communication, market analysis, execution discipline, and readiness for field-intensive assignments.

We would be happy to share the batch profile and coordinate a hiring process aligned to your requirements.

Regards,
{{sender_name}}
{{sender_email}}$template$ where category_name = 'FMCG & Sales';

update company_type_personas set template_content = $template$Subject: Versatile campus talent for {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

I am reaching out to explore how our students could support {{company_name}} in high-ownership roles across growth, product, operations, founder's office, analytics, and business development. The cohort is comfortable with ambiguity, rapid learning, and cross-functional execution.

We can coordinate a focused, fast campus process and share profiles matched to your immediate priorities.

Regards,
{{sender_name}}
{{sender_email}}$template$ where category_name = 'Startup';

update company_type_personas set template_content = $template$Subject: Institutional campus recruitment engagement

Dear {{contact_title}} {{contact_last_name}},

On behalf of our placement team, I would like to invite {{company_name}} to consider our current cohort for suitable management and specialist opportunities. We can support the documentation, eligibility screening, scheduling, and formal campus process required by your recruitment norms.

Kindly share the appropriate procedure or contact for taking this engagement forward.

Regards,
{{sender_name}}
{{sender_email}}$template$ where category_name = 'PSU/Government';

update company_type_personas set template_content = $template$Subject: Analytics and data talent for {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

We would like to explore campus roles with {{company_name}} across business analytics, data-led strategy, reporting, risk, operations analytics, and decision support. Our students combine quantitative coursework with business context and stakeholder communication.

We can share profiles aligned to your tools, domain, and experience criteria and arrange an efficient assessment process.

Regards,
{{sender_name}}
{{sender_email}}$template$ where category_name = 'Analytics & Data';

-- ============================================================================
-- 0016_admin_assignment_scope_guards.sql
-- ============================================================================
-- Placement OS — tenant/base-role guards for the FR-9.2 admin controls.
-- The original join-table write policies checked only the permission name.
-- A caller who knew another tenant's UUID could therefore target it directly,
-- and base-role bundles were locked only in React. Every USING/WITH CHECK pair
-- below is intentionally mirrored.

drop policy users_update on users;
create policy users_update on users for update using (
  id = current_user_id()
  or (institute_id = current_institute_id() and has_permission('User Management'))
) with check (
  id = current_user_id()
  or (institute_id = current_institute_id() and has_permission('User Management'))
);

drop policy user_roles_write on user_roles;
create policy user_roles_write on user_roles for all using (
  has_permission('User Management')
  and exists (
    select 1 from users u
    where u.id = user_id and u.institute_id = current_institute_id()
  )
) with check (
  has_permission('User Management')
  and exists (
    select 1 from users u
    where u.id = user_id and u.institute_id = current_institute_id()
  )
  and exists (
    select 1 from roles r
    where r.id = role_id and (r.institute_id is null or r.institute_id = current_institute_id())
  )
);

drop policy user_permission_sets_write on user_permission_sets;
create policy user_permission_sets_write on user_permission_sets for all using (
  has_permission('User Management')
  and exists (
    select 1 from users u
    where u.id = user_id and u.institute_id = current_institute_id()
  )
) with check (
  has_permission('User Management')
  and exists (
    select 1 from users u
    where u.id = user_id and u.institute_id = current_institute_id()
  )
);

drop policy roles_write on roles;
create policy roles_write on roles for all using (
  has_permission('Role & Permission Management')
  and institute_id = current_institute_id()
  and not is_base_role
) with check (
  has_permission('Role & Permission Management')
  and institute_id = current_institute_id()
  and not is_base_role
);

drop policy role_permission_sets_write on role_permission_sets;
create policy role_permission_sets_write on role_permission_sets for all using (
  has_permission('Role & Permission Management')
  and exists (
    select 1 from roles r
    where r.id = role_id
      and r.institute_id = current_institute_id()
      and not r.is_base_role
  )
) with check (
  has_permission('Role & Permission Management')
  and exists (
    select 1 from roles r
    where r.id = role_id
      and r.institute_id = current_institute_id()
      and not r.is_base_role
  )
);

-- ============================================================================
-- 0017_placement_export_dataset.sql
-- ============================================================================
-- Placement OS — scoped dataset for FR-7.2/7.3 exports.
-- Reports & Export does not imply unrestricted SELECT on the raw students
-- table. This security-definer function exposes only the fields needed by the
-- official/public/accreditation templates and explicitly validates permission,
-- tenant, and batch before reading across the reporting tables.

create function get_placement_export_dataset(p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  batch_institute_id uuid;
  result jsonb;
begin
  if not has_permission('Reports & Export') then
    raise exception 'Reports & Export permission is required';
  end if;

  select institute_id into batch_institute_id from batches where id = p_batch_id;
  if batch_institute_id is null or batch_institute_id is distinct from current_institute_id() then
    raise exception 'Batch not found in current institute';
  end if;

  select jsonb_build_object(
    'batch', (select jsonb_build_object('id', b.id, 'name', b.name, 'starts_on', b.starts_on, 'ends_on', b.ends_on) from batches b where b.id = p_batch_id),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'roll_no', s.roll_no,
        'name', s.name,
        'section', s.section,
        'branch', s.graduation_details ->> 'branch',
        'specialization', s.pg_details ->> 'specialization',
        'placement_status', s.placement_status
      ) order by s.roll_no)
      from students s where s.batch_id = p_batch_id
    ), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', pr.student_id,
        'company_id', pr.company_id,
        'company_name', c.name,
        'jd_id', pr.jd_id,
        'final_ctc', pr.final_ctc,
        'role_title', pr.role_title,
        'offer_date', pr.offer_date
      ) order by c.name)
      from placement_records pr
      join students s on s.id = pr.student_id
      join companies c on c.id = pr.company_id
      where s.batch_id = p_batch_id and c.institute_id = batch_institute_id
    ), '[]'::jsonb),
    'jds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'company_id', j.company_id,
        'company_name', c.name,
        'role_title', j.role_title,
        'date_floated', coalesce((
          select min(al.created_at)
          from audit_log_entries al
          where al.target_entity = 'jd'
            and al.target_id = j.id
            and al.action = 'jd.published'
        ), j.created_at)
      ) order by c.name, j.created_at)
      from jds j
      join companies c on c.id = j.company_id
      where j.batch_id = p_batch_id and c.institute_id = batch_institute_id
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', a.student_id,
        'jd_id', a.jd_id,
        'round_history', a.round_history
      ))
      from applications a
      join jds j on j.id = a.jd_id
      where j.batch_id = p_batch_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function get_placement_export_dataset(uuid) from public;
grant execute on function get_placement_export_dataset(uuid) to authenticated;

-- ============================================================================
-- 0018_eligibility_overrides.sql
-- ============================================================================
-- Placement OS — FR-2.5 Admin eligibility overrides (Claude's track).
-- "Admin can manually add/remove specific students from an eligible list
-- before the notification sends." No override model existed — only the
-- auto-computed list from _eligible_student_ids_for_jd() (0004).

create type eligibility_override_type as enum ('include', 'exclude');

create table jd_eligibility_overrides (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid not null references jds(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  override_type eligibility_override_type not null,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  unique (jd_id, student_id) -- a student is either force-included or force-excluded, never both
);

-- A student's batch must match the JD's batch — an override is a correction
-- to who's notified within the intended audience, not a way to pull in
-- someone from an unrelated batch/institute.
create function enforce_jd_eligibility_override_scope() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from jds j join students s on s.batch_id = j.batch_id
    where j.id = new.jd_id and s.id = new.student_id
  ) then
    raise exception 'Student must be in the same batch as the JD to be included or excluded';
  end if;
  return new;
end;
$$;

create trigger jd_eligibility_overrides_scope_guard
  before insert or update on jd_eligibility_overrides
  for each row execute function enforce_jd_eligibility_override_scope();

alter table jd_eligibility_overrides enable row level security;

-- Same Student Data - Full gate as eligible_students_for_jd() itself
-- (0004) — this table exists specifically to adjust that function's output,
-- so it should never be visible/writable to anyone who couldn't already see
-- the row-level eligible list.
create policy jd_eligibility_overrides_select on jd_eligibility_overrides for select using (
  has_permission('Student Data - Full')
  and exists (
    select 1 from jds j join batches b on b.id = j.batch_id
    where j.id = jd_id and b.institute_id = current_institute_id()
  )
);

create policy jd_eligibility_overrides_write on jd_eligibility_overrides for all using (
  has_permission('Student Data - Full')
  and exists (
    select 1 from jds j join batches b on b.id = j.batch_id
    where j.id = jd_id and b.institute_id = current_institute_id()
  )
) with check (
  has_permission('Student Data - Full')
  and exists (
    select 1 from jds j join batches b on b.id = j.batch_id
    where j.id = jd_id and b.institute_id = current_institute_id()
  )
);

-- Final, override-adjusted eligible list. Deliberately separate from
-- eligible_student_count_for_jd()/eligible_students_for_jd() (0004), which
-- stay as the raw auto-eligibility signal FR-1.4 shows before publish —
-- overrides are reviewed and applied afterward, per Section 3.1 Step 5's
-- own sequencing ("before the notification sends," which is after publish).
create function final_eligible_student_ids_for_jd(p_jd_id uuid)
returns table (student_id uuid)
language sql stable security definer set search_path = public as $$
  select e.student_id
  from _eligible_student_ids_for_jd(p_jd_id) e
  where not exists (
    select 1 from jd_eligibility_overrides o
    where o.jd_id = p_jd_id and o.student_id = e.student_id and o.override_type = 'exclude'
  )
  union
  select o.student_id
  from jd_eligibility_overrides o
  where o.jd_id = p_jd_id and o.override_type = 'include';
$$;

revoke all on function final_eligible_student_ids_for_jd(uuid) from public;

-- Row-returning, so same PII-gating requirement as eligible_students_for_jd().
create function final_eligible_students_for_jd(p_jd_id uuid)
returns setof students
language sql stable security definer set search_path = public as $$
  select s.*
  from students s
  where has_permission('Student Data - Full')
    and _jd_is_visible_to_caller(p_jd_id)
    and s.id in (select student_id from final_eligible_student_ids_for_jd(p_jd_id));
$$;

revoke all on function final_eligible_students_for_jd(uuid) from public;
grant execute on function final_eligible_students_for_jd(uuid) to authenticated;

create function final_eligible_student_count_for_jd(p_jd_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select case when _jd_is_visible_to_caller(p_jd_id)
    then (select count(*)::int from final_eligible_student_ids_for_jd(p_jd_id))
    else 0
  end;
$$;

revoke all on function final_eligible_student_count_for_jd(uuid) from public;
grant execute on function final_eligible_student_count_for_jd(uuid) to authenticated;

commit;
