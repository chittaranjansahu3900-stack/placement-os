-- PlacementOS — masked applicant-directory RPC.
--
-- Fixes the defect documented in docs/BRD-IMPLEMENTATION-STATUS.md Section 3, Finding #10, and
-- designed in docs/APPLICANT-MASKING-FIX-PROPOSAL.md: applicant_directory (0004) is
-- `security_invoker = true` and INNER JOINs students. students_select's only Recruiter-reachable
-- branch requires the application to already be shortlisted+, so pre-shortlist the join silently
-- drops the entire application row, not just its sensitive columns. That's a functional defect
-- (FR-4.2/FR-4.4), not a data leak, but it breaks the actual shortlisting workflow: a recruiter
-- can't see who to shortlist in the first place.
--
-- This function is SECURITY DEFINER — it bypasses students_select's row-level filtering entirely
-- and enforces its own explicit authorization + masking instead, mirroring the already-proven
-- pattern in get_candidate_packets() (0014_masked_candidate_packets.sql) rather than depending on
-- RLS to also gate this join. applicant_directory (the view) is left unchanged; new Recruiter-scoped
-- listing code should call this function instead, not the view.
--
-- Correction versus the original proposal doc: its SQL sketch and its own test-case list
-- disagreed on who gets unmasked (the sketch checked status only; the tests expected Admin/SPC
-- unmasked regardless of status). Resolved here: unmask on
-- status in (shortlisted/interview/selected/waitlisted) OR the caller holding
-- `Student Data - Full`. Holding `Shortlist Oversight` alone grants row *visibility* (the
-- institute-scoped WHERE branch below) but does NOT unmask — a custom role holding only Shortlist
-- Oversight sees every application in the institute, with phone/personal_email/gender masked
-- pre-shortlist exactly like a Recruiter would see.

create function get_applicant_directory(p_jd_id uuid)
returns table (
  application_id uuid,
  jd_id uuid,
  student_id uuid,
  status application_status,
  round_history jsonb,
  applied_at timestamptz,
  roll_no text,
  name text,
  total_work_ex_months int,
  branch text,
  specialization text,
  cgpa numeric,
  phone text,
  personal_email text,
  gender text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_jd_id is null then
    raise exception 'p_jd_id is required';
  end if;

  -- Reasonable request boundary: a single JD's applicant pool is bounded by one batch's size
  -- (realistically low hundreds to low thousands, never unbounded) — cap defensively rather than
  -- assume the caller always passes a legitimately-scoped JD. Matches the spirit of
  -- get_candidate_packets()'s 500-item cap without arbitrarily truncating a real large cohort.
  return query
  select
    a.id,
    a.jd_id,
    a.student_id,
    a.status,
    a.round_history,
    a.applied_at,
    s.roll_no,
    s.name,
    s.total_work_ex_months,
    s.graduation_details ->> 'branch',
    s.pg_details ->> 'specialization',
    coalesce((s.graduation_details ->> 'cgpa')::numeric, (s.pg_details ->> 'cgpa')::numeric),
    case
      when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')
        or has_permission('Student Data - Full')
      then s.phone else null
    end,
    case
      when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')
        or has_permission('Student Data - Full')
      then s.personal_email else null
    end,
    case
      when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')
        or has_permission('Student Data - Full')
      then s.gender else null
    end
  from applications a
  join jds j on j.id = a.jd_id
  join batches b on b.id = j.batch_id
  join students s on s.id = a.student_id
  where a.jd_id = p_jd_id
    and (
      -- Own-company Recruiter: every application for this JD, masked per-row by status above.
      (j.company_id = current_company_id() and has_permission('Shortlisting (recruiter-scoped)'))
      -- Institute-scoped: Shortlist Oversight (row visible, still masked unless also Student
      -- Data - Full) or Student Data - Full (row visible AND unmasked via the CASE above).
      or (b.institute_id = current_institute_id()
          and (has_permission('Shortlist Oversight') or has_permission('Student Data - Full')))
    )
  order by a.applied_at asc
  limit 2000;
end;
$$;

-- Explicit revoke from anon, not just public: Supabase's default project ACLs grant EXECUTE on
-- every new SECURITY DEFINER function to `anon` directly (a schema-wide default privilege,
-- confirmed during the 0023 review — `revoke ... from public` alone never touches it). Not
-- independently exploitable here either way, since the function's own has_permission()/
-- current_company_id()/current_institute_id() checks all resolve to nothing for an unauthenticated
-- caller — but this function closes the grant-level gap explicitly rather than relying solely on
-- that internal check, unlike the schema-wide gap that's still open for the other 33 functions.
revoke all on function get_applicant_directory(uuid) from public;
revoke all on function get_applicant_directory(uuid) from anon;
grant execute on function get_applicant_directory(uuid) to authenticated;
