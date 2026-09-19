-- Placement OS — Fit briefs (evidence-anchored applicant reading against recruiter-written criteria)
--
-- Design record: docs/FIT-BRIEF-SPEC.md.
--
-- Three tables and one RPC:
--   jd_fit_criteria         — versioned plain-language must-haves / nice-to-haves per JD
--   application_fit_briefs  — one generated brief per application × criteria version
--   fit_brief_feedback      — recruiter agree/disagree per brief (calibration signal)
--   get_fit_input()         — the ONLY path by which packet data reaches the model
--
-- Privacy boundary (Appendix E / DPDP): get_fit_input() strips, in SQL, every field the brief must
-- never see — name, gender, age, phone, personal email, section, display order, defaults, placement
-- status, and the identity block of the CV snapshot — regardless of application status. That is
-- stricter than get_candidate_packets(): a shortlisted candidate's contacts are visible to the
-- recruiter in the packet, but they are still never visible to the model. The model reads work,
-- academics and the CV body, nothing else.
--
-- Authorization: the same company/permission predicate as get_candidate_packets(), re-checked inside
-- the SECURITY DEFINER body. Briefs have NO student-visible SELECT branch (same rule as
-- application_private_notes, Finding #8). Verdicts never write to applications.status — nothing in
-- this migration touches that table.
--
-- Per the documented 0025 limitation, every SECURITY DEFINER function below revokes PUBLIC and anon
-- explicitly and re-grants authenticated.

-- ── Criteria ───────────────────────────────────────────────────────────────────────────────

create table jd_fit_criteria (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid not null references jds(id) on delete cascade,
  version_no int not null,
  -- [{ "id": "c1", "kind": "must" | "nice", "text": "...", "interpretation": "..." }]
  criteria jsonb not null default '[]',
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  unique (jd_id, version_no),
  constraint jd_fit_criteria_shape check (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) <= 12)
);

create index jd_fit_criteria_jd_idx on jd_fit_criteria (jd_id, version_no desc);

-- ── Briefs ─────────────────────────────────────────────────────────────────────────────────

create type fit_verdict as enum ('strong', 'likely', 'partial', 'weak', 'insufficient_evidence');

create table application_fit_briefs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  criteria_id uuid not null references jd_fit_criteria(id) on delete cascade,
  verdict fit_verdict not null,
  summary text not null,
  -- [{ "criterionId", "status": "met" | "partial" | "not_found", "claim", "source", "quote" }]
  must_haves jsonb not null default '[]',
  nice_to_haves jsonb not null default '[]',
  probes jsonb not null default '[]',      -- ["question", ...]
  excluded text[] not null default '{}',   -- what the model was told it could not see
  model text not null,
  -- true when one or more quotes failed substring validation and were dropped (see src/lib/fit/schema.ts)
  degraded boolean not null default false,
  generated_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  unique (application_id, criteria_id)
);

create index application_fit_briefs_app_idx on application_fit_briefs (application_id);

-- ── Feedback ───────────────────────────────────────────────────────────────────────────────

create table fit_brief_feedback (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references application_fit_briefs(id) on delete cascade,
  user_id uuid not null references users(id),
  accurate boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (brief_id, user_id)
);

-- ── RLS ────────────────────────────────────────────────────────────────────────────────────

alter table jd_fit_criteria enable row level security;
alter table application_fit_briefs enable row level security;
alter table fit_brief_feedback enable row level security;

-- Criteria: own-company recruiter with shortlisting rights, or institute oversight. Students never.
create policy jd_fit_criteria_select on jd_fit_criteria for select using (
  exists (
    select 1 from jds j join batches b on b.id = j.batch_id
    where j.id = jd_fit_criteria.jd_id
      and (
        (j.company_id = current_company_id() and has_permission('Shortlisting (recruiter-scoped)'))
        or (b.institute_id = current_institute_id()
            and (has_permission('Shortlist Oversight') or has_permission('Student Data - Full')))
      )
  )
);

create policy jd_fit_criteria_insert on jd_fit_criteria for insert with check (
  created_by_user_id = current_user_id()
  and exists (
    select 1 from jds j where j.id = jd_fit_criteria.jd_id
      and j.company_id = current_company_id()
      and has_permission('Shortlisting (recruiter-scoped)')
  )
);
-- Versions are immutable: no update/delete policy. A change is a new version.

-- Briefs: readable by own-company recruiter or institute oversight. NO student branch.
create policy application_fit_briefs_select on application_fit_briefs for select using (
  exists (
    select 1 from applications a join jds j on j.id = a.jd_id join batches b on b.id = j.batch_id
    where a.id = application_fit_briefs.application_id
      and (
        (j.company_id = current_company_id() and has_permission('Shortlisting (recruiter-scoped)'))
        or (b.institute_id = current_institute_id() and has_permission('Shortlist Oversight'))
      )
  )
);

create policy application_fit_briefs_insert on application_fit_briefs for insert with check (
  generated_by_user_id = current_user_id()
  and exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.id = application_fit_briefs.application_id
      and j.company_id = current_company_id()
      and has_permission('Shortlisting (recruiter-scoped)')
  )
);
-- Briefs are immutable too: regenerate under a new criteria version instead.

create policy fit_brief_feedback_select on fit_brief_feedback for select using (
  user_id = current_user_id()
  or exists (
    select 1 from application_fit_briefs fb join applications a on a.id = fb.application_id
      join jds j on j.id = a.jd_id join batches b on b.id = j.batch_id
    where fb.id = fit_brief_feedback.brief_id
      and (
        (j.company_id = current_company_id() and has_permission('Shortlisting (recruiter-scoped)'))
        or (b.institute_id = current_institute_id() and has_permission('Shortlist Oversight'))
      )
  )
);

create policy fit_brief_feedback_insert on fit_brief_feedback for insert with check (
  user_id = current_user_id()
  and exists (
    select 1 from application_fit_briefs fb join applications a on a.id = fb.application_id
      join jds j on j.id = a.jd_id
    where fb.id = fit_brief_feedback.brief_id
      and j.company_id = current_company_id()
      and has_permission('Shortlisting (recruiter-scoped)')
  )
);

-- ── get_fit_input(): the only model-facing read ────────────────────────────────────────────

create function get_fit_input(p_application_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'application_id', a.id,
    'jd', jsonb_build_object(
      'role_title', j.role_title,
      'grade', j.grade,
      'locations', j.locations,
      'eligible_branches', j.eligible_branches,
      'eligible_specializations', j.eligible_specializations,
      'min_cgpa', j.min_cgpa
    ),
    'profile', jsonb_build_object(
      'total_work_ex_months', s.total_work_ex_months,
      'prior_employers', s.prior_employers,
      'graduation_details', s.graduation_details,
      'pg_details', s.pg_details,
      'tenth_twelfth_details', s.tenth_twelfth_details,
      'credentials', s.credentials,
      'other_qualifications', s.other_qualifications
    ),
    'cv', case
      when cv.id is null then null
      else jsonb_build_object(
        'template_id', cv.template_id,
        -- CV body minus the identity block. personalInfo is rebuilt from an allow-list, never
        -- by deleting keys, so a new identity field added to the CV schema later is excluded
        -- by default rather than leaked by default.
        'content', (cv.content - 'personalInfo' - 'hobbies' - 'languages')
          || jsonb_build_object(
            'personalInfo', jsonb_build_object(
              'summary', coalesce(cv.content #>> '{personalInfo,summary}', ''),
              'headline', coalesce(cv.content #>> '{personalInfo,headline}', ''),
              'totalExperience', coalesce(cv.content #>> '{personalInfo,totalExperience}', '')
            )
          )
      )
    end
  )
  into v_result
  from applications a
  join jds j on j.id = a.jd_id
  join batches b on b.id = j.batch_id
  join students s on s.id = a.student_id
  left join cv_documents cv on cv.id = a.cv_document_id
  where a.id = p_application_id
    and a.withdrawn_at is null
    and (
      (j.company_id = current_company_id() and has_permission('Shortlisting (recruiter-scoped)'))
      or (b.institute_id = current_institute_id()
          and (has_permission('Shortlist Oversight') or has_permission('Student Data - Full')))
    );

  -- Absent row and unauthorized caller are indistinguishable on purpose.
  return v_result;
end;
$$;

revoke all on function get_fit_input(uuid) from public;
revoke all on function get_fit_input(uuid) from anon;
grant execute on function get_fit_input(uuid) to authenticated;

-- ── SPC oversight: distribution only, never individual briefs ──────────────────────────────

create function fit_verdict_distribution(p_jd_id uuid)
returns table (criteria_version int, verdict fit_verdict, brief_count bigint)
language sql stable security definer set search_path = public as $$
  select c.version_no, fb.verdict, count(*)
  from application_fit_briefs fb
  join jd_fit_criteria c on c.id = fb.criteria_id
  join jds j on j.id = c.jd_id
  join batches b on b.id = j.batch_id
  where j.id = p_jd_id
    and (
      (j.company_id = current_company_id() and has_permission('Shortlisting (recruiter-scoped)'))
      or (b.institute_id = current_institute_id() and has_permission('Shortlist Oversight'))
    )
  group by c.version_no, fb.verdict
  order by c.version_no desc, fb.verdict;
$$;

revoke all on function fit_verdict_distribution(uuid) from public;
revoke all on function fit_verdict_distribution(uuid) from anon;
grant execute on function fit_verdict_distribution(uuid) to authenticated;
