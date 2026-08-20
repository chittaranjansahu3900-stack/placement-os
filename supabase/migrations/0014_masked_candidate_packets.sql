-- Placement OS — masked candidate packets (BRD FR-4.4)
--
-- Recruiters need the Profile Sheet + attached CV to make a shortlist decision,
-- but direct SELECT on students/cv_documents is intentionally unavailable until
-- shortlist because those rows contain contact data. This RPC is the safe bridge:
-- it explicitly re-checks company/institute scope and returns redacted JSON before
-- shortlist, then the complete packet after shortlist. Raw-table RLS is unchanged.

create function get_candidate_packets(p_application_ids uuid[])
returns table (
  application_id uuid,
  student jsonb,
  cv_document jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(cardinality(p_application_ids), 0) > 500 then
    raise exception 'Candidate packet requests are limited to 500 applications';
  end if;

  return query
  select
    a.id,
    case
      when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted') then to_jsonb(s)
      else to_jsonb(s) || jsonb_build_object(
        'phone', null,
        'personal_email', null,
        'gender', null
      )
    end as student,
    case
      when cv.id is null then null
      when a.status in ('shortlisted', 'interview', 'selected', 'waitlisted') then to_jsonb(cv)
      else jsonb_set(
        jsonb_set(
          to_jsonb(cv),
          '{content,personalInfo,email}',
          '""'::jsonb,
          true
        ),
        '{content,personalInfo,phone}',
        '""'::jsonb,
        true
      )
    end as cv_document
  from applications a
  join jds j on j.id = a.jd_id
  join batches b on b.id = j.batch_id
  join students s on s.id = a.student_id
  left join cv_documents cv on cv.id = a.cv_document_id
  where a.id = any(coalesce(p_application_ids, array[]::uuid[]))
    and (
      (
        j.company_id = current_company_id()
        and has_permission('Shortlisting (recruiter-scoped)')
      )
      or (
        b.institute_id = current_institute_id()
        and (
          has_permission('Shortlist Oversight')
          or has_permission('Student Data - Full')
        )
      )
    );
end;
$$;

revoke all on function get_candidate_packets(uuid[]) from public;
grant execute on function get_candidate_packets(uuid[]) to authenticated;
