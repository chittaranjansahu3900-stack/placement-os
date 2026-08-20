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
