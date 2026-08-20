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
