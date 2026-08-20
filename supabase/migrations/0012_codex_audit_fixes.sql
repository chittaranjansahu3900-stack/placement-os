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
