-- Placement OS — reference data seed
-- Base Roles + Permission Set catalog verbatim from BRD Section 7.2/7.3,
-- and the 8 Company-Type Personas from Section 4.8.2.
--
-- `actions` below is a best-effort split of Section 7.3's prose "Actions
-- Included" column into an array. Section 9 flags a real per-module CRUD
-- matrix as an open item for the next BRD pass — this is a placeholder
-- until that matrix exists, not the final action list.

insert into permission_sets (name, description, actions) values
  ('JD Management', 'View, Create, Edit, Publish, Approve (admin gate), Delete/Archive JDs',
   '["jd:view","jd:create","jd:edit","jd:publish","jd:approve","jd:delete"]'),
  ('Shortlist Oversight', 'View all shortlists (any company), override status, assign interview slots, send status-nudge reminders',
   '["shortlist:view_all","shortlist:override_status","shortlist:assign_slots","shortlist:send_reminders"]'),
  ('Shortlisting (recruiter-scoped)', 'View own applicants, move applicant status, add private notes, download candidate packets',
   '["applicants:view_own","applicants:move_status","applicants:add_notes","applicants:download_packet"]'),
  ('Student Data - Full', 'View all profile fields incl. contact info, bulk import/export roster, edit any student''s defaults record',
   '["students:view_full","students:bulk_import_export","students:edit_defaults"]'),
  ('Student Data - Restricted', 'View profile fields except phone/personal email (masked until shortlist stage)',
   '["students:view_restricted"]'),
  ('Own Profile', 'View/edit own profile, CV link, education details',
   '["profile:view_own","profile:edit_own"]'),
  ('Own Applications', 'Apply to JD, withdraw application, view own status timeline',
   '["applications:apply","applications:withdraw","applications:view_own_status"]'),
  ('Own Defaults View', 'View own default count/activity breakdown (read-only)',
   '["defaults:view_own"]'),
  ('Reports & Export', 'View placement dashboard, export Final Placement Datasheet, export custom templates',
   '["reports:view","reports:export_datasheet","reports:export_custom"]'),
  ('Reports - View Only', 'View placement dashboard (no export)',
   '["reports:view"]'),
  ('User Management', 'Approve/reject accounts, deactivate/reactivate users, assign Roles and extra Permission Sets',
   '["users:approve_reject","users:deactivate_reactivate","users:assign_roles_permissions"]'),
  ('Role & Permission Management', 'Create/clone/edit custom Roles and Permission Sets',
   '["roles:create_clone_edit"]'),
  ('CRM/Outreach', 'View company pipeline, log calls, run mail merge, manage outreach tasks/reminders',
   '["crm:view_pipeline","crm:log_calls","crm:mail_merge","crm:manage_tasks"]'),
  ('Audit Log View', 'View audit log entries (read-only for everyone, no edit/delete exists)',
   '["audit:view"]');

insert into roles (institute_id, name, is_base_role) values
  (null, 'Admin', true),
  (null, 'SPC', true),
  (null, 'BD', true),
  (null, 'Recruiter', true),
  (null, 'Student', true);

-- Section 7.2 default bundles
insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'Admin' and ps.name in (
  'JD Management', 'Shortlist Oversight', 'Student Data - Full', 'Reports & Export',
  'User Management', 'Role & Permission Management', 'CRM/Outreach', 'Audit Log View'
);

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'SPC' and ps.name in (
  'Shortlist Oversight', 'Student Data - Full', 'Reports - View Only'
);

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'BD' and ps.name in ('CRM/Outreach');

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'Recruiter' and ps.name in (
  'JD Management', 'Shortlisting (recruiter-scoped)', 'Student Data - Restricted'
);

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'Student' and ps.name in (
  'Own Profile', 'Own Applications', 'Own Defaults View'
);

-- Section 4.8.2 — eight fixed persona/template categories
insert into company_type_personas (category_name, template_content) values
  ('IT/Product', ''),
  ('BFSI', ''),
  ('Consulting', ''),
  ('Core/Manufacturing', ''),
  ('FMCG & Sales', ''),
  ('Startup', ''),
  ('PSU/Government', ''),
  ('Analytics & Data', '');
