-- PlacementOS — mandatory SPC release gate for JDs.
--
-- Product decision, 22 August 2026:
--   Recruiter sets the application deadline and submits the draft to SPC.
--   SPC may keep that deadline or move it earlier, then releases the JD to
--   the assigned batch. Only the release changes status to `published`, which
--   is the existing student-visibility and notification boundary.
--
-- The JD remains `draft` while awaiting review, so the existing jds_select
-- policy continues to hide it from students. The security-definer release RPC
-- is deliberately narrow: it checks the caller's active tenant context and
-- Shortlist Oversight permission, and can only perform this one transition.

alter table jds
  add column spc_review_submitted_at timestamptz,
  add column spc_review_submitted_by_user_id uuid references users(id),
  add column spc_released_at timestamptz,
  add column spc_released_by_user_id uuid references users(id);

create index idx_jds_pending_spc_review
  on jds (spc_review_submitted_at)
  where status = 'draft' and spc_review_submitted_at is not null;

create or replace function enforce_jd_status_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'published' then
      if old.spc_review_submitted_at is null then
        raise exception 'Submit this JD for SPC review before release';
      end if;
      if not has_permission('Shortlist Oversight') then
        raise exception 'Only SPC can release a JD to students';
      end if;
    end if;

    if not (
      (old.status = 'draft' and new.status = 'published')
      or (old.status = 'published' and new.status = 'applications_closed')
      or (old.status = 'applications_closed' and new.status = 'shortlisting')
      or (old.status = 'shortlisting' and new.status = 'closed')
      or (old.status = 'published' and new.status = 'closed')
      or has_role('Admin')
    ) then
      raise exception 'Invalid JD status transition: % to %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create function enforce_jd_spc_review_gate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A JD Management holder may submit an own-company draft exactly once.
  if old.spc_review_submitted_at is null and new.spc_review_submitted_at is not null then
    if old.status <> 'draft' or new.status <> 'draft' then
      raise exception 'Only a draft JD can be submitted for SPC review';
    end if;
    if not has_permission('JD Management') then
      raise exception 'JD Management permission is required to submit for review';
    end if;
    if new.spc_review_submitted_by_user_id is distinct from current_user_id() then
      raise exception 'The review submitter must be the current user';
    end if;
    if new.spc_released_at is not null or new.spc_released_by_user_id is not null then
      raise exception 'A submitted JD cannot already be marked as released';
    end if;
  end if;

  -- Once submitted, recruiters cannot silently alter the reviewed payload.
  -- The only allowed mutation is the SPC release performed by the RPC below.
  if old.status = 'draft' and old.spc_review_submitted_at is not null then
    if new.status = 'published' then
      if not has_permission('Shortlist Oversight') then
        raise exception 'Only SPC can release a submitted JD';
      end if;
      if new.apply_by_deadline > old.apply_by_deadline then
        raise exception 'SPC may keep or prepone the deadline, but cannot postpone it';
      end if;
      if new.apply_by_deadline <= now() then
        raise exception 'The released application deadline must be in the future';
      end if;
      if new.spc_released_at is null
        or new.spc_released_by_user_id is distinct from current_user_id()
      then
        raise exception 'SPC release metadata is required';
      end if;
      if new.spc_review_submitted_at is distinct from old.spc_review_submitted_at
        or new.spc_review_submitted_by_user_id is distinct from old.spc_review_submitted_by_user_id
      then
        raise exception 'SPC review submission metadata cannot be changed';
      end if;
      if (to_jsonb(new) - array[
            'status', 'apply_by_deadline', 'spc_released_at',
            'spc_released_by_user_id', 'updated_at'
          ]) is distinct from
         (to_jsonb(old) - array[
            'status', 'apply_by_deadline', 'spc_released_at',
            'spc_released_by_user_id', 'updated_at'
          ])
      then
        raise exception 'SPC release may only prepone the deadline and publish the JD';
      end if;
    elsif (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'This JD is locked while awaiting SPC release';
    end if;
  end if;

  return new;
end;
$$;

create trigger jds_spc_review_gate
  before update on jds
  for each row execute function enforce_jd_spc_review_gate();

create function release_jd_to_batch(
  p_jd_id uuid,
  p_apply_by_deadline timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_jd jds%rowtype;
  v_deadline timestamptz;
begin
  if current_user_id() is null or not has_permission('Shortlist Oversight') then
    raise exception 'Shortlist Oversight permission is required to release a JD';
  end if;

  select j.*
    into v_jd
    from jds j
    join batches b on b.id = j.batch_id
   where j.id = p_jd_id
     and b.institute_id = current_institute_id()
   for update of j;

  if not found then
    raise exception 'JD not found in the current institute';
  end if;
  if v_jd.status <> 'draft' or v_jd.spc_review_submitted_at is null then
    raise exception 'JD is not awaiting SPC review';
  end if;

  v_deadline := coalesce(p_apply_by_deadline, v_jd.apply_by_deadline);
  if v_deadline > v_jd.apply_by_deadline then
    raise exception 'SPC may keep or prepone the deadline, but cannot postpone it';
  end if;
  if v_deadline <= now() then
    raise exception 'The released application deadline must be in the future';
  end if;

  update jds
     set apply_by_deadline = v_deadline,
         status = 'published',
         spc_released_at = now(),
         spc_released_by_user_id = current_user_id(),
         updated_at = now()
   where id = p_jd_id;
end;
$$;

revoke all on function release_jd_to_batch(uuid, timestamptz) from public;
grant execute on function release_jd_to_batch(uuid, timestamptz) to authenticated;
