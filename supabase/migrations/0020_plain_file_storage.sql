-- PlacementOS plain file storage (FR-1.2, FR-8.12, Resume Maker CV files).
-- Files are stored unredacted by explicit product decision. Policies preserve
-- tenant/module boundaries but contain no shortlist-status masking or gating.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'placement-files', 'placement-files', false, 15728640,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'text/plain', 'image/jpeg', 'image/png'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table committee_vault_files (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  file_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  uploaded_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_committee_vault_files_company_created
  on committee_vault_files(company_id, created_at desc);

alter table committee_vault_files enable row level security;

create policy committee_vault_files_select on committee_vault_files
for select to authenticated using (
  institute_id = current_institute_id()
  and (has_permission('CRM/Outreach') or has_permission('Shortlist Oversight'))
);

create policy committee_vault_files_insert on committee_vault_files
for insert to authenticated with check (
  institute_id = current_institute_id()
  and (has_permission('CRM/Outreach') or has_permission('Shortlist Oversight'))
  and (company_id is null or exists (
    select 1 from companies c
    where c.id = company_id and c.institute_id = current_institute_id()
  ))
);

create policy committee_vault_files_delete on committee_vault_files
for delete to authenticated using (
  institute_id = current_institute_id()
  and (has_permission('CRM/Outreach') or has_permission('Shortlist Oversight'))
);

-- Path layout: {institute_uuid}/{jd|cv|vault}/{entity_uuid}/{file}.
-- There is deliberately no application-status or shortlist-status condition,
-- and files are never rewritten or redacted.
create policy placement_files_select on storage.objects
for select to authenticated using (
  bucket_id = 'placement-files'
  and (storage.foldername(name))[1] = current_institute_id()::text
  and current_user_id() is not null
  and (
    (storage.foldername(name))[2] = 'jd'
    or (
      (storage.foldername(name))[2] = 'cv'
      and (
        (storage.foldername(name))[3] = current_student_id()::text
        or has_permission('Student Data - Restricted')
        or has_permission('Student Data - Full')
        or has_permission('Shortlist Oversight')
        or has_permission('JD Management')
      )
    )
    or (
      (storage.foldername(name))[2] = 'vault'
      and (has_permission('CRM/Outreach') or has_permission('Shortlist Oversight'))
    )
  )
);

create policy placement_files_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'placement-files'
  and (storage.foldername(name))[1] = current_institute_id()::text
  and (
    ((storage.foldername(name))[2] = 'jd' and has_permission('JD Management'))
    or (
      (storage.foldername(name))[2] = 'cv'
      and ((storage.foldername(name))[3] = current_student_id()::text or has_permission('Student Data - Full'))
    )
    or (
      (storage.foldername(name))[2] = 'vault'
      and (has_permission('CRM/Outreach') or has_permission('Shortlist Oversight'))
    )
  )
);

create policy placement_files_update on storage.objects
for update to authenticated using (
  bucket_id = 'placement-files'
  and (storage.foldername(name))[1] = current_institute_id()::text
  and (
    ((storage.foldername(name))[2] = 'jd' and has_permission('JD Management'))
    or ((storage.foldername(name))[2] = 'cv' and ((storage.foldername(name))[3] = current_student_id()::text or has_permission('Student Data - Full')))
    or ((storage.foldername(name))[2] = 'vault' and (has_permission('CRM/Outreach') or has_permission('Shortlist Oversight')))
  )
) with check (
  bucket_id = 'placement-files'
  and (storage.foldername(name))[1] = current_institute_id()::text
  and (
    ((storage.foldername(name))[2] = 'jd' and has_permission('JD Management'))
    or ((storage.foldername(name))[2] = 'cv' and ((storage.foldername(name))[3] = current_student_id()::text or has_permission('Student Data - Full')))
    or ((storage.foldername(name))[2] = 'vault' and (has_permission('CRM/Outreach') or has_permission('Shortlist Oversight')))
  )
);

create policy placement_files_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'placement-files'
  and (storage.foldername(name))[1] = current_institute_id()::text
  and (
    ((storage.foldername(name))[2] = 'jd' and has_permission('JD Management'))
    or ((storage.foldername(name))[2] = 'cv' and ((storage.foldername(name))[3] = current_student_id()::text or has_permission('Student Data - Full')))
    or ((storage.foldername(name))[2] = 'vault' and (has_permission('CRM/Outreach') or has_permission('Shortlist Oversight')))
  )
);

grant select, insert, delete on committee_vault_files to authenticated;
grant all on committee_vault_files to service_role;
