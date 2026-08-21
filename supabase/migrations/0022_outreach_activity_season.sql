-- FR-8.13: snapshot the JPC's season on each outreach activity so historical
-- funnel reports do not change when that user's current batch is reassigned.

alter table outreach_activities
  add column batch_id uuid references batches(id);

update outreach_activities oa
set batch_id = u.batch_id
from users u
where u.id = oa.logged_by_user_id
  and u.batch_id is not null
  and oa.batch_id is null;

create index idx_outreach_activities_batch_logger_occurred
  on outreach_activities(batch_id, logged_by_user_id, occurred_at);

create function set_outreach_activity_batch() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_batch_id uuid;
  company_institute_id uuid;
begin
  select c.institute_id into company_institute_id
  from companies c
  where c.id = new.company_id;

  select u.batch_id into actor_batch_id
  from users u
  where u.id = new.logged_by_user_id
    and u.institute_id = company_institute_id;

  if actor_batch_id is not null then
    new.batch_id := actor_batch_id;
  elsif new.batch_id is not null and not exists (
    select 1 from batches b
    where b.id = new.batch_id and b.institute_id = company_institute_id
  ) then
    raise exception 'Outreach activity season must belong to the caller institute (FR-8.13)';
  end if;
  return new;
end;
$$;

create trigger outreach_activity_batch_snapshot
  before insert on outreach_activities
  for each row execute function set_outreach_activity_batch();
