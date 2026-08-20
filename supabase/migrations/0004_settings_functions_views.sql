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
