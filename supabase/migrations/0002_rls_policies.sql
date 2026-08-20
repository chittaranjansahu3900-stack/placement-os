-- Placement OS — RLS helper functions + policies
-- Implements the Role + Permission Set model from BRD Section 7.
--
-- NOTE (honest limitation): this enforces ROW-level access per Section 7.2/7.3.
-- It does not yet implement a full per-action CRUD matrix — Section 9's open
-- items list that explicitly as future work ("Full CRUD action matrix per
-- module... needed once build planning starts"). Field-level masking
-- (Section 7.4, phone/personal_email/gender) is NOT done here — RLS is
-- row-level, not column-level — see 0004_views.sql for that.

-- ============================================================================
-- HELPER FUNCTIONS  (security definer: read past RLS on the tables they join,
-- so they don't recurse into the policies that call them)
-- ============================================================================

create function current_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from users where auth_user_id = auth.uid();
$$;

create function current_institute_id() returns uuid
language sql stable security definer set search_path = public as $$
  select institute_id from users where auth_user_id = auth.uid();
$$;

create function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from users where auth_user_id = auth.uid();
$$;

create function current_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from students where user_id = current_user_id();
$$;

create function has_permission(perm_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join role_permission_sets rps on rps.role_id = ur.role_id
    join permission_sets ps on ps.id = rps.permission_set_id
    where ur.user_id = current_user_id() and ps.name = perm_name
  ) or exists (
    select 1 from user_permission_sets ups
    join permission_sets ps on ps.id = ups.permission_set_id
    where ups.user_id = current_user_id() and ps.name = perm_name
  );
$$;

create function has_role(role_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = current_user_id() and r.name = role_name
  );
$$;

-- Append-only audit log writer (Section 4.9 / FR-9.3): no direct insert policy
-- is granted on audit_log_entries, so every write goes through this function.
create function log_audit_event(p_action text, p_target_entity text, p_target_id uuid, p_metadata jsonb default '{}')
returns void
language sql security definer set search_path = public as $$
  insert into audit_log_entries (institute_id, actor_user_id, action, target_entity, target_id, metadata)
  values (current_institute_id(), current_user_id(), p_action, p_target_entity, p_target_id, p_metadata);
$$;

-- ============================================================================
-- TENANCY / RBAC TABLES
-- ============================================================================

alter table institutes enable row level security;
create policy institutes_select on institutes for select using (id = current_institute_id());

alter table batches enable row level security;
create policy batches_select on batches for select using (institute_id = current_institute_id());
create policy batches_write on batches for all
  using (institute_id = current_institute_id() and has_role('Admin'))
  with check (institute_id = current_institute_id() and has_role('Admin'));

alter table roles enable row level security;
create policy roles_select on roles for select using (institute_id is null or institute_id = current_institute_id());
create policy roles_write on roles for all
  using (has_permission('Role & Permission Management') and (institute_id is null or institute_id = current_institute_id()))
  with check (has_permission('Role & Permission Management') and (institute_id is null or institute_id = current_institute_id()));

alter table permission_sets enable row level security;
create policy permission_sets_select on permission_sets for select using (true);
create policy permission_sets_write on permission_sets for all
  using (has_permission('Role & Permission Management'))
  with check (has_permission('Role & Permission Management'));

alter table role_permission_sets enable row level security;
create policy role_permission_sets_select on role_permission_sets for select using (
  exists (select 1 from roles r where r.id = role_id and (r.institute_id is null or r.institute_id = current_institute_id()))
);
create policy role_permission_sets_write on role_permission_sets for all
  using (has_permission('Role & Permission Management'))
  with check (has_permission('Role & Permission Management'));

alter table users enable row level security;
create policy users_select on users for select using (institute_id = current_institute_id());
create policy users_update on users for update using (
  id = current_user_id() or has_permission('User Management')
) with check (
  id = current_user_id() or has_permission('User Management')
);
-- No client-side insert policy: account creation runs server-side (service role)
-- as part of the SSO/signup flow and the roster-import job (Section 3.4, 7.5).

alter table user_roles enable row level security;
create policy user_roles_select on user_roles for select using (
  exists (select 1 from users u where u.id = user_id and u.institute_id = current_institute_id())
);
create policy user_roles_write on user_roles for all
  using (has_permission('User Management'))
  with check (has_permission('User Management'));

alter table user_permission_sets enable row level security;
create policy user_permission_sets_select on user_permission_sets for select using (
  exists (select 1 from users u where u.id = user_id and u.institute_id = current_institute_id())
);
create policy user_permission_sets_write on user_permission_sets for all
  using (has_permission('User Management'))
  with check (has_permission('User Management'));

-- ============================================================================
-- COMPANIES & OUTREACH CRM
-- ============================================================================

alter table company_type_personas enable row level security;
create policy company_type_personas_select on company_type_personas for select using (true);
create policy company_type_personas_write on company_type_personas for all
  using (has_role('Admin')) with check (has_role('Admin'));

alter table companies enable row level security;
create policy companies_select on companies for select using (
  institute_id = current_institute_id()
  and (
    has_permission('CRM/Outreach') or has_permission('JD Management')
    or has_permission('Shortlist Oversight') or has_permission('Student Data - Full')
    or id = current_company_id()
    or owner_user_id = current_user_id() or supervisor_user_id = current_user_id()
  )
);
create policy companies_insert on companies for insert with check (
  institute_id = current_institute_id() and has_permission('CRM/Outreach')
);
create policy companies_update on companies for update using (
  institute_id = current_institute_id()
  and (has_permission('CRM/Outreach') or owner_user_id = current_user_id() or supervisor_user_id = current_user_id())
) with check (
  institute_id = current_institute_id()
  and (has_permission('CRM/Outreach') or owner_user_id = current_user_id() or supervisor_user_id = current_user_id())
);
create policy companies_delete on companies for delete using (
  institute_id = current_institute_id() and has_role('Admin')
);

alter table company_contacts enable row level security;
create policy company_contacts_select on company_contacts for select using (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or has_permission('JD Management') or has_permission('Shortlist Oversight')
         or c.id = current_company_id() or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
);
create policy company_contacts_write on company_contacts for all using (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
) with check (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
);

alter table outreach_activities enable row level security;
create policy outreach_activities_select on outreach_activities for select using (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
);
create policy outreach_activities_write on outreach_activities for all using (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
) with check (
  exists (
    select 1 from companies c where c.id = company_id and c.institute_id = current_institute_id()
    and (has_permission('CRM/Outreach') or c.owner_user_id = current_user_id() or c.supervisor_user_id = current_user_id())
  )
);

-- ============================================================================
-- STUDENTS & DEFAULTS
-- ============================================================================

alter table students enable row level security;
create policy students_select on students for select using (
  user_id = current_user_id()
  or exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id()
             and has_permission('Student Data - Full'))
  or exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.student_id = students.id and j.company_id = current_company_id()
    and has_permission('Shortlisting (recruiter-scoped)')
  )
);
create policy students_write on students for all using (
  exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id()
          and has_permission('Student Data - Full'))
) with check (
  -- BUG FIXED: this originally dropped the has_permission() check on INSERT,
  -- so any authenticated user (Student, Recruiter — anyone) could insert
  -- fabricated rows into `students` for any batch in their own institute.
  -- USING and WITH CHECK must match here, not just share the institute test.
  exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id()
          and has_permission('Student Data - Full'))
);
create policy students_self_update on students for update using (user_id = current_user_id())
  with check (user_id = current_user_id());

alter table default_records enable row level security;
create policy default_records_select on default_records for select using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or exists (
    select 1 from students s join batches b on b.id = s.batch_id
    where s.id = student_id and b.institute_id = current_institute_id() and has_permission('Student Data - Full')
  )
);
create policy default_records_write on default_records for all using (
  exists (
    select 1 from students s join batches b on b.id = s.batch_id
    where s.id = student_id and b.institute_id = current_institute_id() and has_permission('Student Data - Full')
  )
) with check (
  exists (
    select 1 from students s join batches b on b.id = s.batch_id
    where s.id = student_id and b.institute_id = current_institute_id() and has_permission('Student Data - Full')
  )
);

-- ============================================================================
-- JDs, APPLICATIONS, NOTIFICATIONS, PLACEMENT RECORDS
-- ============================================================================

alter table jds enable row level security;
create policy jds_select on jds for select using (
  exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id())
  and (
    status <> 'draft'
    or has_permission('Shortlist Oversight')
    or (has_permission('JD Management') and (current_company_id() is null or company_id = current_company_id()))
  )
);
create policy jds_insert on jds for insert with check (
  exists (select 1 from batches b where b.id = batch_id and b.institute_id = current_institute_id())
  and has_permission('JD Management')
  and (current_company_id() is null or company_id = current_company_id())
);
create policy jds_update on jds for update using (
  has_permission('JD Management') and (current_company_id() is null or company_id = current_company_id())
) with check (
  has_permission('JD Management') and (current_company_id() is null or company_id = current_company_id())
);

alter table applications enable row level security;
create policy applications_select on applications for select using (
  student_id = current_student_id()
  or exists (select 1 from jds j where j.id = jd_id and j.company_id = current_company_id()
             and has_permission('Shortlisting (recruiter-scoped)'))
  or has_permission('Shortlist Oversight') or has_permission('Student Data - Full')
);
create policy applications_insert on applications for insert with check (
  student_id = current_student_id()
);
create policy applications_update on applications for update using (
  student_id = current_student_id()
  or exists (select 1 from jds j where j.id = jd_id and j.company_id = current_company_id()
             and has_permission('Shortlisting (recruiter-scoped)'))
  or has_permission('Shortlist Oversight')
) with check (
  -- Same boundary as USING: a student can't re-point their row at someone
  -- else's application, and a recruiter can't move it to a JD outside their
  -- own company, by changing student_id/jd_id mid-update.
  student_id = current_student_id()
  or exists (select 1 from jds j where j.id = jd_id and j.company_id = current_company_id()
             and has_permission('Shortlisting (recruiter-scoped)'))
  or has_permission('Shortlist Oversight')
);

alter table jd_notifications enable row level security;
create policy jd_notifications_select on jd_notifications for select using (
  student_id = current_student_id() or has_permission('JD Management') or has_permission('Shortlist Oversight')
);
create policy jd_notifications_write on jd_notifications for all using (
  has_permission('JD Management')
) with check (has_permission('JD Management'));

alter table placement_records enable row level security;
create policy placement_records_select on placement_records for select using (
  student_id = current_student_id()
  or has_permission('Reports & Export') or has_permission('Reports - View Only') or has_permission('Student Data - Full')
);
create policy placement_records_write on placement_records for all using (
  has_permission('Student Data - Full')
) with check (has_permission('Student Data - Full'));

-- ============================================================================
-- RESUME MAKER
-- ============================================================================

alter table cv_documents enable row level security;
create policy cv_documents_select on cv_documents for select using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or has_permission('Student Data - Full')
  or exists (
    select 1 from applications a join jds j on j.id = a.jd_id
    where a.student_id = cv_documents.student_id and j.company_id = current_company_id()
    and a.status in ('shortlisted', 'interview', 'selected', 'waitlisted')
  )
);
create policy cv_documents_write on cv_documents for all using (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or has_permission('Student Data - Full')
) with check (
  exists (select 1 from students s where s.id = student_id and s.user_id = current_user_id())
  or has_permission('Student Data - Full')
);

alter table cv_review_comments enable row level security;
create policy cv_review_comments_select on cv_review_comments for select using (
  exists (
    select 1 from cv_documents d join students s on s.id = d.student_id
    where d.id = cv_document_id and (s.user_id = current_user_id() or has_permission('Student Data - Full'))
  )
);
create policy cv_review_comments_insert on cv_review_comments for insert with check (
  has_permission('Student Data - Full') and spc_user_id = current_user_id()
);
create policy cv_review_comments_update on cv_review_comments for update using (
  spc_user_id = current_user_id()
  or exists (
    select 1 from cv_documents d join students s on s.id = d.student_id
    where d.id = cv_document_id and s.user_id = current_user_id()
  )
) with check (
  spc_user_id = current_user_id()
  or exists (
    select 1 from cv_documents d join students s on s.id = d.student_id
    where d.id = cv_document_id and s.user_id = current_user_id()
  )
);

-- RLS is row-level: the USING/CHECK above let a student update a comment row
-- they don't own the authorship of, so a trigger enforces the column-level
-- rule FR-10.5 actually needs — students may only flip `status`
-- (open/applied/dismissed, Section 5), never rewrite the SPC's comment text
-- or re-anchor it themselves.
create function enforce_cv_review_comment_student_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.spc_user_id <> current_user_id() then
    if new.comment_text is distinct from old.comment_text
      or new.anchor_section is distinct from old.anchor_section
      or new.anchor_bullet_id is distinct from old.anchor_bullet_id
      or new.spc_user_id is distinct from old.spc_user_id
      or new.cv_document_id is distinct from old.cv_document_id
    then
      raise exception 'Students may only change the status of a CV review comment';
    end if;
  end if;
  return new;
end;
$$;

create trigger cv_review_comments_student_update_guard
  before update on cv_review_comments
  for each row execute function enforce_cv_review_comment_student_update();

-- ============================================================================
-- CONFIG & AUDIT
-- ============================================================================

alter table field_visibility_rules enable row level security;
create policy field_visibility_rules_select on field_visibility_rules for select using (true);
create policy field_visibility_rules_write on field_visibility_rules for all
  using (has_role('Admin')) with check (has_role('Admin'));

alter table audit_log_entries enable row level security;
create policy audit_log_select on audit_log_entries for select using (
  institute_id = current_institute_id() and has_permission('Audit Log View')
);
-- No insert/update/delete policy: writes only via log_audit_event() (security definer).
