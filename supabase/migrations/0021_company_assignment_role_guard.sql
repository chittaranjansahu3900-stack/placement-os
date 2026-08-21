-- FR-8.2: company assignees must come from the intended role lineages.
-- This is a trigger (not merely a filtered UI) so direct API updates cannot
-- assign arbitrary institute users.

create function user_has_role_lineage(p_user_id uuid, p_role_names text[])
returns boolean
language sql stable security definer set search_path = public as $$
  with recursive lineage as (
    select r.id, r.name, r.cloned_from_role_id
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
    union
    select parent.id, parent.name, parent.cloned_from_role_id
    from roles parent
    join lineage child on child.cloned_from_role_id = parent.id
  )
  select exists (
    select 1
    from users u
    join lineage l on true
    where u.id = p_user_id
      and u.institute_id = current_institute_id()
      and u.status = 'active'
      and l.name = any(p_role_names)
  );
$$;

revoke all on function user_has_role_lineage(uuid, text[]) from public;

create function enforce_company_assignment_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.owner_user_id is distinct from old.owner_user_id then
    if new.owner_user_id is not null
       and not user_has_role_lineage(new.owner_user_id, array['BD', 'JPC']) then
      raise exception 'Company Owner must be an active JPC/BD-lineage user in this institute (FR-8.2)';
    end if;
    if tg_op = 'UPDATE' and old.owner_user_id is not null and new.owner_user_id is null then
      raise exception 'An assigned company Owner cannot be cleared; choose another active JPC (FR-8.2)';
    end if;
  end if;

  if tg_op = 'INSERT' or new.supervisor_user_id is distinct from old.supervisor_user_id then
    if new.supervisor_user_id is not null
       and not user_has_role_lineage(new.supervisor_user_id, array['SPC', 'Senior SPC']) then
      raise exception 'Company Supervisor must be an active SPC/Senior-SPC-lineage user in this institute (FR-8.2)';
    end if;
    if tg_op = 'UPDATE' and old.supervisor_user_id is not null and new.supervisor_user_id is null then
      raise exception 'An assigned company Supervisor cannot be cleared; choose another Senior SPC (FR-8.2)';
    end if;
  end if;
  return new;
end;
$$;

create trigger companies_assignment_role_guard
  before insert or update of owner_user_id, supervisor_user_id on companies
  for each row execute function enforce_company_assignment_roles();
