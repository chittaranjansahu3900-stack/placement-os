-- Placement OS — FR-1.2/FR-1.3 JD lifecycle completion (Claude's track,
-- docs/HANDOVER-CODEX.md — migrations this round numbered from 0013 by
-- agreement to avoid a repeat of the earlier 0010 filename collision).
--
-- FR-1.2's remaining fields (grade, eligible_specializations, max_backlog,
-- open_positions) already existed as columns since 0001 — the JD creation
-- form just never captured them. No schema change needed for those, only
-- app code (src/app/(dashboard)/jds/new/page.tsx, src/app/actions/jds.ts).
--
-- FR-1.3's remaining piece — "Draft → (optional Admin approval) →
-- Published → Applications Closed → Shortlisting → Closed" plus
-- valid-transition enforcement — needed a real trigger: `jds_update` RLS
-- already lets any JD Management holder (recruiter-own-company or Admin)
-- change `status` to anything, since RLS is row-level and doesn't reason
-- about state machines. Two separate rules, both enforced here rather than
-- only in the UI (same reasoning as every other guard trigger this session
-- — RLS/UI can't be the only thing standing between a caller and an
-- invalid state):
--   1. If a JD has admin_approval_required = true, only an Admin may move
--      it out of Draft — a Recruiter's own "publish" attempt is blocked,
--      not silently downgraded to some other state.
--   2. Transitions must follow the BRD's stated linear sequence. Admin can
--      override (e.g. force-close a stuck JD), matching Section 3.4's
--      "Admin has full visibility... can override a shortlist status."

create function enforce_jd_status_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'published'
      and old.admin_approval_required and not has_role('Admin')
    then
      raise exception 'This JD requires Admin approval before publishing';
    end if;

    if not (
      (old.status = 'draft' and new.status = 'published')
      or (old.status = 'published' and new.status = 'applications_closed')
      or (old.status = 'applications_closed' and new.status = 'shortlisting')
      or (old.status = 'shortlisting' and new.status = 'closed')
      or (old.status = 'published' and new.status = 'closed') -- closing directly is valid when shortlisting was never opened as its own phase
      or has_role('Admin')
    ) then
      raise exception 'Invalid JD status transition: % to %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger jds_status_transition_guard
  before update of status on jds
  for each row execute function enforce_jd_status_transition();
