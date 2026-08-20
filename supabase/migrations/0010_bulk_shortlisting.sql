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
