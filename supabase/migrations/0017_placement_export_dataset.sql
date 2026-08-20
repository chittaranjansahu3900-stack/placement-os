-- Placement OS — scoped dataset for FR-7.2/7.3 exports.
-- Reports & Export does not imply unrestricted SELECT on the raw students
-- table. This security-definer function exposes only the fields needed by the
-- official/public/accreditation templates and explicitly validates permission,
-- tenant, and batch before reading across the reporting tables.

create function get_placement_export_dataset(p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  batch_institute_id uuid;
  result jsonb;
begin
  if not has_permission('Reports & Export') then
    raise exception 'Reports & Export permission is required';
  end if;

  select institute_id into batch_institute_id from batches where id = p_batch_id;
  if batch_institute_id is null or batch_institute_id is distinct from current_institute_id() then
    raise exception 'Batch not found in current institute';
  end if;

  select jsonb_build_object(
    'batch', (select jsonb_build_object('id', b.id, 'name', b.name, 'starts_on', b.starts_on, 'ends_on', b.ends_on) from batches b where b.id = p_batch_id),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'roll_no', s.roll_no,
        'name', s.name,
        'section', s.section,
        'branch', s.graduation_details ->> 'branch',
        'specialization', s.pg_details ->> 'specialization',
        'placement_status', s.placement_status
      ) order by s.roll_no)
      from students s where s.batch_id = p_batch_id
    ), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', pr.student_id,
        'company_id', pr.company_id,
        'company_name', c.name,
        'jd_id', pr.jd_id,
        'final_ctc', pr.final_ctc,
        'role_title', pr.role_title,
        'offer_date', pr.offer_date
      ) order by c.name)
      from placement_records pr
      join students s on s.id = pr.student_id
      join companies c on c.id = pr.company_id
      where s.batch_id = p_batch_id and c.institute_id = batch_institute_id
    ), '[]'::jsonb),
    'jds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'company_id', j.company_id,
        'company_name', c.name,
        'role_title', j.role_title,
        'date_floated', coalesce((
          select min(al.created_at)
          from audit_log_entries al
          where al.target_entity = 'jd'
            and al.target_id = j.id
            and al.action = 'jd.published'
        ), j.created_at)
      ) order by c.name, j.created_at)
      from jds j
      join companies c on c.id = j.company_id
      where j.batch_id = p_batch_id and c.institute_id = batch_institute_id
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', a.student_id,
        'jd_id', a.jd_id,
        'round_history', a.round_history
      ))
      from applications a
      join jds j on j.id = a.jd_id
      where j.batch_id = p_batch_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function get_placement_export_dataset(uuid) from public;
grant execute on function get_placement_export_dataset(uuid) to authenticated;
