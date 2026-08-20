-- Placement OS — Resume Maker working baseline (BRD Section 4.10)
--
-- Adds the application -> CV snapshot link required by FR-10.6, enforces a
-- single current CV per student, and narrows recruiter access to the exact CV
-- attached to their shortlisted application (not every CV that student owns).

-- CV version numbers are unique within a persona. PostgreSQL treats nulls as
-- distinct in a normal unique index, so the unassigned/default persona needs
-- its own partial index.
create unique index cv_documents_persona_version_unique
  on cv_documents (student_id, persona_id, version_no)
  where persona_id is not null;

create unique index cv_documents_default_version_unique
  on cv_documents (student_id, version_no)
  where persona_id is null;

create unique index cv_documents_one_latest_per_student
  on cv_documents (student_id)
  where is_latest;

-- Switch the current CV atomically whenever a document is inserted or marked
-- latest. The function is security definer because students intentionally do
-- not have direct UPDATE access to their roster row.
create function prepare_latest_cv_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_latest then
    update cv_documents
      set is_latest = false
      where student_id = new.student_id
        and id <> new.id
        and is_latest;
  end if;
  return new;
end;
$$;

create trigger cv_documents_prepare_latest
  before insert or update of is_latest on cv_documents
  for each row execute function prepare_latest_cv_document();

create function sync_student_latest_cv_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_latest then
      update students set latest_cv_document_id = null where id = old.student_id;
    end if;
    return old;
  end if;

  if new.is_latest then
    update students set latest_cv_document_id = new.id where id = new.student_id;
  elsif old.is_latest and not new.is_latest then
    update students
      set latest_cv_document_id = null
      where id = old.student_id and latest_cv_document_id = old.id;
  end if;
  return new;
end;
$$;

create trigger cv_documents_sync_student_latest
  after insert or update of is_latest or delete on cv_documents
  for each row execute function sync_student_latest_cv_document();

alter table applications
  add column cv_document_id uuid references cv_documents(id) on delete restrict;

-- Existing applications receive the student's current CV where one exists.
update applications a
  set cv_document_id = s.latest_cv_document_id
  from students s
  where s.id = a.student_id and s.latest_cv_document_id is not null;

-- New applications capture a CV snapshot. Later CV edits/versions do not
-- silently alter the packet already submitted for that application.
create function attach_latest_cv_to_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  document_student_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.student_id is distinct from old.student_id
    or new.cv_document_id is distinct from old.cv_document_id
  ) then
    raise exception 'An application CV snapshot cannot be replaced after submission';
  end if;

  if new.cv_document_id is null then
    select latest_cv_document_id into new.cv_document_id
      from students where id = new.student_id;
  end if;

  if new.cv_document_id is not null then
    select student_id into document_student_id
      from cv_documents where id = new.cv_document_id;
    if document_student_id is distinct from new.student_id then
      raise exception 'The attached CV does not belong to this student';
    end if;
  end if;

  return new;
end;
$$;

create trigger applications_attach_latest_cv
  before insert or update of student_id, cv_document_id on applications
  for each row execute function attach_latest_cv_to_application();

-- Recruiters may read only the document attached to an application belonging
-- to their company, and only after that application is shortlisted. Students
-- own their documents; SPC/Admin review through Student Data - Full.
drop policy cv_documents_select on cv_documents;
create policy cv_documents_select on cv_documents for select using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or has_permission('Student Data - Full')
  or exists (
    select 1
      from applications a
      join jds j on j.id = a.jd_id
      where a.cv_document_id = cv_documents.id
        and j.company_id = current_company_id()
        and a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')
  )
);

-- SPC reviewers comment instead of mutating a student's CV directly.
drop policy cv_documents_write on cv_documents;
create policy cv_documents_write on cv_documents for all using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
) with check (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
);

create index idx_applications_cv_document on applications(cv_document_id);
