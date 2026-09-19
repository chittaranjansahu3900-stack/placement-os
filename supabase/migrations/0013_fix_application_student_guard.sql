-- Fix for enforce_application_student_update() after private_notes column was dropped in 0012

create or replace function enforce_application_student_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.student_id = current_student_id() then
    if new.status is distinct from old.status
      or new.round_history is distinct from old.round_history
      or new.student_id is distinct from old.student_id
      or new.jd_id is distinct from old.jd_id
    then
      raise exception 'Students may only withdraw an application (set withdrawn_at), not change its status or rounds';
    end if;
  end if;
  return new;
end;
$$;
