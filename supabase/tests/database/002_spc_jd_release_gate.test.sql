-- pgTAP regression coverage for migration 0023's mandatory SPC JD release gate.
-- The test proves the database boundary, not merely the UI: a recruiter cannot
-- publish directly, the submitted draft remains student-hidden, SPC cannot
-- postpone the deadline, and an SPC release makes the JD student-visible.

begin;
create extension if not exists pgtap;

select plan(19);

insert into institutes (id, name, slug) values
  ('10111111-1111-1111-1111-111111111111', 'SPC Gate Test Institute', 'pgtap-spc-gate-002');

insert into batches (id, institute_id, name, is_active) values
  ('20222222-2222-2222-2222-222222222222', '10111111-1111-1111-1111-111111111111', 'SPC Gate Batch', true);

insert into companies (id, institute_id, name) values
  ('30333333-3333-3333-3333-333333333333', '10111111-1111-1111-1111-111111111111', 'SPC Gate Company');

insert into auth.users (id) values
  ('40444444-4444-4444-4444-444444444444'),
  ('50555555-5555-5555-5555-555555555555'),
  ('60666666-6666-6666-6666-666666666666');

insert into users (id, auth_user_id, institute_id, company_id, name, email, status) values
  ('70777777-7777-7777-7777-777777777777', '40444444-4444-4444-4444-444444444444',
   '10111111-1111-1111-1111-111111111111', '30333333-3333-3333-3333-333333333333',
   'SPC Gate Recruiter', 'recruiter-gate@pgtap.test', 'active');

insert into users (id, auth_user_id, institute_id, name, email, status) values
  ('80888888-8888-8888-8888-888888888888', '50555555-5555-5555-5555-555555555555',
   '10111111-1111-1111-1111-111111111111', 'SPC Gate SPC', 'spc-gate@pgtap.test', 'active'),
  ('90999999-9999-9999-9999-999999999999', '60666666-6666-6666-6666-666666666666',
   '10111111-1111-1111-1111-111111111111', 'SPC Gate Student', 'student-gate@pgtap.test', 'active');

insert into user_roles (user_id, role_id)
  select '70777777-7777-7777-7777-777777777777', id from roles where name = 'Recruiter';
insert into user_roles (user_id, role_id)
  select '80888888-8888-8888-8888-888888888888', id from roles where name = 'SPC';
insert into user_roles (user_id, role_id)
  select '90999999-9999-9999-9999-999999999999', id from roles where name = 'Student';

insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status
) values (
  'aaaaaaaa-1111-1111-1111-111111111111', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'SPC-gated role', now() + interval '30 days', 'draft'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$update jds set status = 'published' where id = 'aaaaaaaa-1111-1111-1111-111111111111'$$,
  'P0001',
  'Submit this JD for SPC review before release',
  'recruiter cannot publish an unsubmitted draft directly'
);

update jds
   set spc_review_submitted_at = now(),
       spc_review_submitted_by_user_id = '70777777-7777-7777-7777-777777777777'
 where id = 'aaaaaaaa-1111-1111-1111-111111111111';

select is(
  (select status::text from jds where id = 'aaaaaaaa-1111-1111-1111-111111111111'),
  'draft',
  'submission keeps the JD in draft status'
);
select ok(
  (select spc_review_submitted_at is not null from jds where id = 'aaaaaaaa-1111-1111-1111-111111111111'),
  'submission metadata is recorded'
);

select throws_ok(
  $$update jds set role_title = 'Changed after review' where id = 'aaaaaaaa-1111-1111-1111-111111111111'$$,
  'P0001',
  'This JD is locked while awaiting SPC release',
  'recruiter cannot alter a submitted JD'
);

select set_config('request.jwt.claim.sub', '60666666-6666-6666-6666-666666666666', true);
select is(
  (select count(*)::int from jds where id = 'aaaaaaaa-1111-1111-1111-111111111111'),
  0,
  'submitted draft remains hidden from students'
);

select set_config('request.jwt.claim.sub', '50555555-5555-5555-5555-555555555555', true);
select throws_ok(
  $$select release_jd_to_batch('aaaaaaaa-1111-1111-1111-111111111111', now() + interval '40 days')$$,
  'P0001',
  'SPC may keep or prepone the deadline, but cannot postpone it',
  'SPC cannot postpone the recruiter deadline'
);

select lives_ok(
  $$select release_jd_to_batch('aaaaaaaa-1111-1111-1111-111111111111', now() + interval '20 days')$$,
  'SPC can prepone and release the JD'
);

select is(
  (select status::text from jds where id = 'aaaaaaaa-1111-1111-1111-111111111111'),
  'published',
  'SPC release publishes the JD'
);

select set_config('request.jwt.claim.sub', '60666666-6666-6666-6666-666666666666', true);
select is(
  (select count(*)::int from jds where id = 'aaaaaaaa-1111-1111-1111-111111111111'),
  1,
  'released JD is visible to students in the institute'
);

-- ── Additional coverage beyond the original 9 assertions ──────────────────────────────────

-- 10. Second release attempt on the JD released above: release_jd_to_batch's own
--     `v_jd.status <> 'draft'` check must reject it, not just the trigger.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select release_jd_to_batch('aaaaaaaa-1111-1111-1111-111111111111', now() + interval '15 days')$$,
  'P0001',
  'JD is not awaiting SPC review',
  'second release attempt on an already-published JD is rejected'
);

-- 11. Pending Recruiter submission: a not-yet-Admin-approved Recruiter has no
--     resolvable current_user_id() (Finding #2). jds_update's USING clause
--     (has_permission('JD Management')) fails for them, so the row is
--     filtered out by RLS *silently* -- this is 0 rows affected, not a
--     raised exception (WITH CHECK failures raise; USING failures don't).
--     JD is deliberately left unsubmitted afterward -- not reused later.
reset role;
insert into auth.users (id) values ('40444444-1111-1111-1111-111111111111');
insert into users (id, auth_user_id, institute_id, company_id, name, email, status) values
  ('70777777-1111-1111-1111-111111111111', '40444444-1111-1111-1111-111111111111',
   '10111111-1111-1111-1111-111111111111', '30333333-3333-3333-3333-333333333333',
   'Pending Recruiter', 'pending-recruiter@pgtap.test', 'pending');
insert into user_roles (user_id, role_id)
  select '70777777-1111-1111-1111-111111111111', id from roles where name = 'Recruiter';
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status
) values (
  'aaaaaaaa-2222-2222-2222-222222222222', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Pending-submitter test role', now() + interval '30 days', 'draft'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40444444-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
with attempt as (
  update jds set spc_review_submitted_at = now(), spc_review_submitted_by_user_id = '70777777-1111-1111-1111-111111111111'
  where id = 'aaaaaaaa-2222-2222-2222-222222222222'
  returning id
)
select is(
  (select count(*)::int from attempt),
  0,
  'a Pending (not Active) Recruiter cannot submit a JD for SPC review (RLS silently filters the row)'
);

-- 12. Deactivated SPC release attempt: same Finding #2 mechanism, checked via
--     release_jd_to_batch's own explicit current_user_id() IS NULL guard.
--     Fixture inserted pre-submitted directly (the gate trigger is BEFORE
--     UPDATE only, so INSERT never touches it, and needs no actor identity).
reset role;
insert into auth.users (id) values ('50555555-1111-1111-1111-111111111111');
insert into users (id, auth_user_id, institute_id, name, email, status) values
  ('80888888-1111-1111-1111-111111111111', '50555555-1111-1111-1111-111111111111',
   '10111111-1111-1111-1111-111111111111', 'Deactivated SPC', 'deactivated-spc@pgtap.test', 'deactivated');
insert into user_roles (user_id, role_id)
  select '80888888-1111-1111-1111-111111111111', id from roles where name = 'SPC';
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status,
  spc_review_submitted_at, spc_review_submitted_by_user_id
) values (
  'aaaaaaaa-2233-2233-2233-223322332233', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Deactivated-SPC-target test role', now() + interval '25 days', 'draft',
  now(), '70777777-7777-7777-7777-777777777777'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '50555555-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select release_jd_to_batch('aaaaaaaa-2233-2233-2233-223322332233', now() + interval '20 days')$$,
  'P0001',
  'Shortlist Oversight permission is required to release a JD',
  'a deactivated SPC cannot release a JD'
);

-- 13. Recruiter attempts to forge spc_released_at/spc_released_by_user_id
--     directly (bypassing the RPC entirely): must still be blocked by the
--     Shortlist Oversight check inside the trigger, not just by the RPC.
--     Own pre-submitted fixture, authenticated as the original ACTIVE
--     recruiter (not the Pending one from test 11).
reset role;
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status,
  spc_review_submitted_at, spc_review_submitted_by_user_id
) values (
  'aaaaaaaa-2244-2244-2244-224422442244', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Forge-attempt test role', now() + interval '25 days', 'draft',
  now(), '70777777-7777-7777-7777-777777777777'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$update jds set status = 'published', spc_released_at = now(),
    spc_released_by_user_id = current_user_id(), updated_at = now()
    where id = 'aaaaaaaa-2244-2244-2244-224422442244'$$,
  'P0001',
  'Only SPC can release a submitted JD',
  'recruiter forging release metadata directly is still blocked by the trigger'
);

-- 14. An actor who legitimately reaches the trigger's release branch (needs
--     BOTH JD Management, to pass jds_update RLS at all, AND Shortlist
--     Oversight, to pass the trigger's release check -- an SPC has only the
--     second, confirmed blocked at the RLS layer by test 18, so testing the
--     to_jsonb diff guard itself needs an Admin, who holds both by default)
--     attempts to change an unrelated field (role_title) while releasing.
reset role;
insert into auth.users (id) values ('90000000-1111-1111-1111-111111111111');
insert into users (id, auth_user_id, institute_id, name, email, status) values
  ('90000000-2222-2222-2222-222222222222', '90000000-1111-1111-1111-111111111111',
   '10111111-1111-1111-1111-111111111111', 'Gate Test Admin', 'gate-admin@pgtap.test', 'active');
insert into user_roles (user_id, role_id)
  select '90000000-2222-2222-2222-222222222222', id from roles where name = 'Admin';
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status,
  spc_review_submitted_at, spc_review_submitted_by_user_id
) values (
  'aaaaaaaa-2255-2255-2255-225522552255', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Unrelated-field-change test role', now() + interval '25 days', 'draft',
  now(), '70777777-7777-7777-7777-777777777777'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$update jds set status = 'published', role_title = 'Retitled during release',
    spc_released_at = now(), spc_released_by_user_id = current_user_id(), updated_at = now()
    where id = 'aaaaaaaa-2255-2255-2255-225522552255'$$,
  'P0001',
  'SPC release may only prepone the deadline and publish the JD',
  'even an actor who can reach the release branch (Admin) cannot change an unrelated field (role_title) while releasing'
);

-- 15. SPC attempts to release a JD that was never submitted for review: the
--     RPC's own `spc_review_submitted_at is null` check must reject it.
reset role;
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status
) values (
  'aaaaaaaa-3333-3333-3333-333333333333', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Never-submitted test role', now() + interval '30 days', 'draft'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '50555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select release_jd_to_batch('aaaaaaaa-3333-3333-3333-333333333333', now() + interval '20 days')$$,
  'P0001',
  'JD is not awaiting SPC review',
  'SPC cannot release a JD that was never submitted for review'
);

-- 16. Deadline exactly equal to the Recruiter's original deadline ("keep"
--     case, not prepone) must succeed — the postpone guard uses a strict `>`.
reset role;
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status,
  spc_review_submitted_at, spc_review_submitted_by_user_id
) values (
  'aaaaaaaa-4444-4444-4444-444444444444', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Keep-deadline test role', now() + interval '25 days', 'draft',
  now(), '70777777-7777-7777-7777-777777777777'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '50555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select release_jd_to_batch('aaaaaaaa-4444-4444-4444-444444444444', null)$$,
  'SPC releasing with no deadline override keeps the recruiter deadline and succeeds'
);

-- 17. Deadline in the past (still <= the recruiter's original deadline, so it
--     passes the postpone check, but must fail the future-deadline check).
reset role;
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status,
  spc_review_submitted_at, spc_review_submitted_by_user_id
) values (
  'aaaaaaaa-5555-5555-5555-555555555555', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Past-deadline test role', now() + interval '25 days', 'draft',
  now(), '70777777-7777-7777-7777-777777777777'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '50555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select release_jd_to_batch('aaaaaaaa-5555-5555-5555-555555555555', now() - interval '1 day')$$,
  'P0001',
  'The released application deadline must be in the future',
  'SPC cannot release with a deadline already in the past'
);

-- 18. Direct status update by SPC (not via the RPC): SPC lacks JD Management,
--     so jds_update's RLS should filter the row out before the trigger ever
--     runs — confirmed as 0 rows affected, not a raised exception.
reset role;
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status,
  spc_review_submitted_at, spc_review_submitted_by_user_id
) values (
  'aaaaaaaa-6666-6666-6666-666666666666', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Direct-update test role', now() + interval '25 days', 'draft',
  now(), '70777777-7777-7777-7777-777777777777'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '50555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
with attempt as (
  update jds set status = 'published', spc_released_at = now(),
    spc_released_by_user_id = current_user_id(), updated_at = now()
  where id = 'aaaaaaaa-6666-6666-6666-666666666666'
  returning id
)
select is(
  (select count(*)::int from attempt),
  0,
  'SPC cannot directly UPDATE jds at all (RLS requires JD Management, SPC only has Shortlist Oversight) -- the RPC is the only path'
);

-- 19. Cross-tenant SPC release via the RPC: an SPC in a different institute
--     must not even find the row (release_jd_to_batch joins batches on
--     current_institute_id()), regardless of holding Shortlist Oversight.
reset role;
insert into institutes (id, name, slug) values
  ('10111111-2222-2222-2222-222222222222', 'SPC Gate Test Institute B', 'pgtap-spc-gate-002-b');
insert into auth.users (id) values ('50555555-2222-2222-2222-222222222222');
insert into users (id, auth_user_id, institute_id, name, email, status) values
  ('80888888-2222-2222-2222-222222222222', '50555555-2222-2222-2222-222222222222',
   '10111111-2222-2222-2222-222222222222', 'Other-Institute SPC', 'other-institute-spc@pgtap.test', 'active');
insert into user_roles (user_id, role_id)
  select '80888888-2222-2222-2222-222222222222', id from roles where name = 'SPC';
insert into jds (
  id, company_id, batch_id, created_by_user_id, role_title, apply_by_deadline, status,
  spc_review_submitted_at, spc_review_submitted_by_user_id
) values (
  'aaaaaaaa-7777-7777-7777-777777777777', '30333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222', '70777777-7777-7777-7777-777777777777',
  'Cross-tenant target role', now() + interval '25 days', 'draft',
  now(), '70777777-7777-7777-7777-777777777777'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '50555555-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select release_jd_to_batch('aaaaaaaa-7777-7777-7777-777777777777', now() + interval '20 days')$$,
  'P0001',
  'JD not found in the current institute',
  'an SPC in a different institute cannot release another institute''s JD'
);

select * from finish();
rollback;
