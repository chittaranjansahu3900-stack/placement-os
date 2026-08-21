-- pgTAP test for Finding #7 (docs/BRD-IMPLEMENTATION-STATUS.md Section 3): a recruiter must not
-- be able to see a candidate's phone/personal_email/gender -- via applicant_directory OR the raw
-- students table -- before that candidate is shortlisted on THEIR company's JD.
--
-- Finding #7 was the single most severe issue found across both security passes: the masking
-- view (applicant_directory) was correct, but the raw students table's RLS policy had no matching
-- status guard, so a recruiter could bypass the view entirely with a direct query. Fixed in
-- 0012_codex_audit_fixes.sql by adding the same status check to students_select's recruiter
-- clause. This test exists so that fix can never silently regress.
--
-- Run via `supabase test db` once Docker is available (needs the local stack), or directly
-- against any Postgres with the pgtap extension via scripts/run-pgtap.mjs (Docker-free, used to
-- verify this file against the real hosted project on 2026-08-21). Self-contained: creates its
-- own institute/batch/company/student/recruiter fixtures and rolls back at the end, so it never
-- touches real data.

begin;
create extension if not exists pgtap;

select plan(7);

-- ── Fixtures (as postgres / bypasses RLS) ──────────────────────────────────────────────────

insert into institutes (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'pgTAP Test Institute', 'pgtap-test-institute-001');

insert into batches (id, institute_id, name, is_active) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'pgTAP Test Batch', true);

-- auth.users rows for the two test identities -- public.users.auth_user_id has a real FK to
-- auth.users(id), so this can't be an invented UUID with no backing row.
insert into auth.users (id) values
  ('44444444-4444-4444-4444-444444444444'),
  ('88888888-8888-8888-8888-888888888888');

-- Student's own user row + student row (phone/personal_email/gender are the fields under test)
insert into users (id, auth_user_id, institute_id, batch_id, name, email, status) values
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   'pgTAP Test Student', 'student@pgtap.test', 'active');

insert into students (id, user_id, batch_id, roll_no, name, phone, personal_email, gender) values
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222', 'PGTAP001', 'pgTAP Test Student',
   '9999999999', 'student.secret@pgtap.test', 'female');

-- Recruiter's company + user row + Recruiter role
insert into companies (id, institute_id, name) values
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'pgTAP Test Recruiter Co');

insert into users (id, auth_user_id, institute_id, company_id, name, email, status) values
  ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888',
   '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666',
   'pgTAP Test Recruiter', 'recruiter@pgtap.test', 'active');

insert into user_roles (user_id, role_id)
  select '77777777-7777-7777-7777-777777777777', id from roles where name = 'Recruiter';

-- JD owned by that company, and an application from the student, starting at status 'applied'
insert into jds (id, company_id, batch_id, role_title, apply_by_deadline, status) values
  ('99999999-9999-9999-9999-999999999999', '66666666-6666-6666-6666-666666666666',
   '22222222-2222-2222-2222-222222222222', 'pgTAP Test Role', now() + interval '30 days', 'published');

insert into applications (id, student_id, jd_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555',
   '99999999-9999-9999-9999-999999999999', 'applied');

-- ── Simulate the recruiter's authenticated session ─────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Finding #7's exact regression case: pre-shortlist, the raw students table must return
-- ZERO rows for this recruiter -- before the 0012 fix, this returned the full unmasked row.
select is(
  (select count(*)::int from students where id = '55555555-5555-5555-5555-555555555555'),
  0,
  'Finding #7 regression guard: recruiter cannot SELECT the raw students row pre-shortlist'
);

-- applicant_directory shows the applicant but with phone/personal_email/gender NULLed
select is(
  (select phone from applicant_directory where student_id = '55555555-5555-5555-5555-555555555555'),
  null,
  'applicant_directory masks phone pre-shortlist'
);
select is(
  (select personal_email from applicant_directory where student_id = '55555555-5555-5555-5555-555555555555'),
  null,
  'applicant_directory masks personal_email pre-shortlist'
);
select is(
  (select gender from applicant_directory where student_id = '55555555-5555-5555-5555-555555555555'),
  null,
  'applicant_directory masks gender pre-shortlist'
);

-- ── Advance to shortlisted (as postgres -- the status-change path itself is a separate,
--    application-layer concern, not what this test covers) ────────────────────────────────

reset role;
update applications set status = 'shortlisted' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Post-shortlist: the raw row becomes visible (by design -- this matches
-- applicant_directory's own unmasking condition, so the two stay in agreement) and the view
-- unmasks phone/personal_email.
select is(
  (select count(*)::int from students where id = '55555555-5555-5555-5555-555555555555'),
  1,
  'post-shortlist: recruiter can now SELECT the raw students row (matches view unmask condition)'
);
select is(
  (select phone from applicant_directory where student_id = '55555555-5555-5555-5555-555555555555'),
  '9999999999',
  'post-shortlist: applicant_directory unmasks phone'
);
select is(
  (select personal_email from applicant_directory where student_id = '55555555-5555-5555-5555-555555555555'),
  'student.secret@pgtap.test',
  'post-shortlist: applicant_directory unmasks personal_email'
);

select * from finish();
rollback;
