-- Placement OS — tenant/base-role guards for the FR-9.2 admin controls.
-- The original join-table write policies checked only the permission name.
-- A caller who knew another tenant's UUID could therefore target it directly,
-- and base-role bundles were locked only in React. Every USING/WITH CHECK pair
-- below is intentionally mirrored.

drop policy users_update on users;
create policy users_update on users for update using (
  id = current_user_id()
  or (institute_id = current_institute_id() and has_permission('User Management'))
) with check (
  id = current_user_id()
  or (institute_id = current_institute_id() and has_permission('User Management'))
);

drop policy user_roles_write on user_roles;
create policy user_roles_write on user_roles for all using (
  has_permission('User Management')
  and exists (
    select 1 from users u
    where u.id = user_id and u.institute_id = current_institute_id()
  )
) with check (
  has_permission('User Management')
  and exists (
    select 1 from users u
    where u.id = user_id and u.institute_id = current_institute_id()
  )
  and exists (
    select 1 from roles r
    where r.id = role_id and (r.institute_id is null or r.institute_id = current_institute_id())
  )
);

drop policy user_permission_sets_write on user_permission_sets;
create policy user_permission_sets_write on user_permission_sets for all using (
  has_permission('User Management')
  and exists (
    select 1 from users u
    where u.id = user_id and u.institute_id = current_institute_id()
  )
) with check (
  has_permission('User Management')
  and exists (
    select 1 from users u
    where u.id = user_id and u.institute_id = current_institute_id()
  )
);

drop policy roles_write on roles;
create policy roles_write on roles for all using (
  has_permission('Role & Permission Management')
  and institute_id = current_institute_id()
  and not is_base_role
) with check (
  has_permission('Role & Permission Management')
  and institute_id = current_institute_id()
  and not is_base_role
);

drop policy role_permission_sets_write on role_permission_sets;
create policy role_permission_sets_write on role_permission_sets for all using (
  has_permission('Role & Permission Management')
  and exists (
    select 1 from roles r
    where r.id = role_id
      and r.institute_id = current_institute_id()
      and not r.is_base_role
  )
) with check (
  has_permission('Role & Permission Management')
  and exists (
    select 1 from roles r
    where r.id = role_id
      and r.institute_id = current_institute_id()
      and not r.is_base_role
  )
);
