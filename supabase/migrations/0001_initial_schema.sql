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
