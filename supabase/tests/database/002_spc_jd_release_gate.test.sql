-- pgTAP regression coverage for migration 0023's mandatory SPC JD release gate.
-- The test proves the database boundary, not merely the UI: a recruiter cannot
-- publish directly, the submitted draft remains student-hidden, SPC cannot
-- postpone the deadline, and an SPC release makes the JD student-visible.

begin;
create extension if not exists pgtap;

select plan(9);

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

select * from finish();
rollback;
