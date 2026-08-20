-- Placement OS — student self-service eligibility check
--
-- FR-3.4: "Students can self-check eligibility and see the specific reason
-- if blocked (e.g. open defaults)." Unlike the recruiter-facing functions in
-- 0004 (which had to be hardened against cross-tenant/cross-student
-- snooping), this one is safe to expose broadly by construction: it always
-- evaluates against current_student_id() — the CALLING student's own row —
-- so there is no argument that lets a caller ask about anyone else.

create function my_eligibility_for_jd(p_jd_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_student students%rowtype;
  v_jd jds%rowtype;
  v_defaults int;
  v_threshold int;
  v_reasons jsonb := '[]'::jsonb;
  v_eligible boolean := true;
begin
  select * into v_student from students where id = current_student_id();
  if v_student.id is null then
    return jsonb_build_object('eligible', false, 'reasons', jsonb_build_array('No student profile linked to your account yet'));
  end if;

  select * into v_jd from jds where id = p_jd_id;
  if v_jd.id is null or not _jd_is_visible_to_caller(p_jd_id) then
    return jsonb_build_object('eligible', false, 'reasons', jsonb_build_array('JD not found'));
  end if;

  if v_student.batch_id <> v_jd.batch_id then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Not part of the eligible batch for this JD');
  end if;

  if v_jd.unplaced_only and v_student.placement_status <> 'unplaced' then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('This JD is for unplaced students only, and you are already placed');
  end if;

  if cardinality(v_jd.eligible_branches) > 0
     and not (coalesce(v_student.graduation_details ->> 'branch', '') = any (v_jd.eligible_branches)) then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Your branch is not in the eligible list for this JD');
  end if;

  if cardinality(v_jd.eligible_specializations) > 0
     and not (coalesce(v_student.pg_details ->> 'specialization', '') = any (v_jd.eligible_specializations)) then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Your specialization is not in the eligible list for this JD');
  end if;

  if v_jd.min_cgpa is not null and coalesce((v_student.graduation_details ->> 'cgpa')::numeric, 0) < v_jd.min_cgpa then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Your CGPA is below the minimum required for this JD');
  end if;

  if v_jd.max_backlog is not null and coalesce((v_student.graduation_details ->> 'backlog_count')::int, 0) > v_jd.max_backlog then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('Your backlog count exceeds the maximum allowed for this JD');
  end if;

  select coalesce(total_defaults, 0) into v_defaults
  from student_defaults_summary where student_id = v_student.id;

  select ist.defaults_threshold into v_threshold
  from institute_settings ist join batches b on b.institute_id = ist.institute_id
  where b.id = v_student.batch_id;

  if coalesce(v_defaults, 0) >= coalesce(v_threshold, 2147483647) then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array(
      'You have ' || coalesce(v_defaults, 0) || ' open default(s), at or above the threshold for this JD'
    );
  end if;

  return jsonb_build_object('eligible', v_eligible, 'reasons', v_reasons);
end;
$$;

revoke all on function my_eligibility_for_jd(uuid) from public;
grant execute on function my_eligibility_for_jd(uuid) to authenticated;
