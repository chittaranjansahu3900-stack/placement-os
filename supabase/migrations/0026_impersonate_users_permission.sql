-- Admin impersonation: a distinct, separately grantable Permission Set
-- (not folded into 'User Management') since "take over a live session as
-- another user" is a materially bigger privilege than approve/deactivate/
-- assign-roles. Bundled into the base Admin role by default, same as the
-- rest of Section 7.2's bundle in 0003_seed_reference_data.sql.
--
-- No RLS changes: impersonation is implemented as a real Supabase Auth
-- session swap (see src/app/actions/impersonation.ts), so every existing
-- RLS policy already applies unmodified — auth.uid() genuinely becomes the
-- impersonated user for the duration, current_user_id() included.

insert into permission_sets (name, description, actions) values
  ('Impersonate Users', 'Start/end a live session as another user, seeing exactly what they see',
   '["users:impersonate"]');

insert into role_permission_sets (role_id, permission_set_id)
select r.id, ps.id from roles r, permission_sets ps
where r.institute_id is null and r.name = 'Admin' and ps.name = 'Impersonate Users';
