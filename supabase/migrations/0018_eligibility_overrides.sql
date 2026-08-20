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
