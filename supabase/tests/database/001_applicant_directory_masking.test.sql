-- pgTAP coverage for Finding #7 (Recruiter cannot bypass masking via the raw students table) and
-- Finding #10 (applicant_directory silently drops pre-shortlist rows instead of masking them —
-- docs/BRD-IMPLEMENTATION-STATUS.md Section 3, docs/APPLICANT-MASKING-FIX-PROPOSAL.md).
--
-- HISTORY: this file originally tested the applicant_directory VIEW directly. That view is
-- security_invoker = true with an INNER JOIN to students; students_select's only
-- Recruiter-reachable branch requires shortlisted+ status, so pre-shortlist the join silently
-- dropped the whole row (Finding #10). The view is left unchanged — the fix is
-- get_applicant_directory() (0024_masked_applicant_directory_rpc.sql), a SECURITY DEFINER RPC
-- that enforces its own authorization and masking instead of depending on students_select to also
-- gate this join. This file now tests that RPC. The Finding #7 raw-table regression guard is
-- unrelated to the view/RPC choice and is preserved as-is.
--
-- Unmask condition (resolves a real discrepancy in the original proposal doc, per the migration's
-- own header comment): status in (shortlisted/interview/selected/waitlisted) OR the caller holds
-- Student Data - Full. Holding Shortlist Oversight alone grants row visibility but not unmasking.
--
-- Run via `supabase test db` (needs Docker) or scripts/run-pgtap.mjs (Docker-free). Self-contained:
-- creates its own institutes/batches/companies/students/users and rolls back at the end.

begin;
create extension if not exists pgtap;

select plan(22);

-- ── Institute A fixtures (as postgres / bypasses RLS) ──────────────────────────────────────

insert into institutes (id, name, slug) values
  ('a1111111-1111-1111-1111-111111111111', 'Masking RPC Test Institute A', 'masking-rpc-test-a');
insert into batches (id, institute_id, name, is_active) values
  ('a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'Batch A', true);
insert into companies (id, institute_id, name) values
  ('a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'Recruiter Own Co'),
  ('a4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', 'Unrelated Co');

insert into auth.users (id) values
  ('a7777777-7777-7777-7777-777777777777'), -- student
  ('a9999999-9999-9999-9999-999999999999'), -- recruiter (own company)
  ('aaaaaaaa-2222-2222-2222-222222222222'), -- recruiter (unrelated company)
  ('aaaaaaaa-5555-5555-5555-555555555555'), -- shortlist-oversight-only custom role holder
  ('aaaaaaaa-7777-7777-7777-777777777777'), -- admin (Student Data - Full)
  ('aaaaaaaa-9999-9999-9999-999999999999'), -- pending recruiter
  ('bbbbbbbb-2222-2222-2222-222222222222'); -- deactivated shortlist-oversight-only holder

insert into users (id, auth_user_id, institute_id, batch_id, name, email, status) values
  ('a6666666-6666-6666-6666-666666666666', 'a7777777-7777-7777-7777-777777777777',
   'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
   'Masking Test Student', 'masking-student@pgtap.test', 'active');
insert into students (id, user_id, batch_id, roll_no, name, phone, personal_email, gender) values
  ('a5555555-5555-5555-5555-555555555555', 'a6666666-6666-6666-6666-666666666666',
   'a2222222-2222-2222-2222-222222222222', 'MASKRPC01', 'Masking Test Student',
   '9111111111', 'masking.student.secret@pgtap.test', 'female');

insert into users (id, auth_user_id, institute_id, company_id, name, email, status) values
  ('a8888888-8888-8888-8888-888888888888', 'a9999999-9999-9999-9999-999999999999',
   'a1111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333',
   'Own-Company Recruiter', 'own-recruiter@pgtap.test', 'active'),
  ('aaaaaaaa-1111-1111-1111-111111111111', 'aaaaaaaa-2222-2222-2222-222222222222',
   'a1111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444',
   'Unrelated-Company Recruiter', 'unrelated-recruiter@pgtap.test', 'active'),
  ('aaaaaaaa-4444-4444-4444-444444444444', 'aaaaaaaa-5555-5555-5555-555555555555',
   'a1111111-1111-1111-1111-111111111111', null,
   'Shortlist-Oversight-Only User', 'oversight-only@pgtap.test', 'active'),
  ('aaaaaaaa-6666-6666-6666-666666666666', 'aaaaaaaa-7777-7777-7777-777777777777',
   'a1111111-1111-1111-1111-111111111111', null,
   'Institute Admin', 'admin@pgtap.test', 'active'),
  ('aaaaaaaa-8888-8888-8888-888888888888', 'aaaaaaaa-9999-9999-9999-999999999999',
   'a1111111-1111-1111-1111-111111111111', null,
   'Pending Recruiter', 'pending-recruiter@pgtap.test', 'pending'),
  ('bbbbbbbb-1111-1111-1111-111111111111', 'bbbbbbbb-2222-2222-2222-222222222222',
   'a1111111-1111-1111-1111-111111111111', null,
   'Deactivated Oversight-Only User', 'deactivated-oversight@pgtap.test', 'deactivated');

insert into user_roles (user_id, role_id)
  select 'a8888888-8888-8888-8888-888888888888', id from roles where name = 'Recruiter';
insert into user_roles (user_id, role_id)
  select 'aaaaaaaa-1111-1111-1111-111111111111', id from roles where name = 'Recruiter';
insert into user_roles (user_id, role_id)
  select 'aaaaaaaa-6666-6666-6666-666666666666', id from roles where name = 'Admin';

-- Custom, institute-scoped role holding ONLY Shortlist Oversight (not Student Data - Full) --
-- the plain 'SPC' base role holds both by default, so it can't isolate this case.
insert into roles (id, institute_id, name, is_base_role) values
  ('aaaaaaaa-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111',
   'Shortlist-Oversight-Only (pgTAP)', false);
insert into role_permission_sets (role_id, permission_set_id)
  select 'aaaaaaaa-3333-3333-3333-333333333333', id from permission_sets where name = 'Shortlist Oversight';
insert into user_roles (user_id, role_id) values
  ('aaaaaaaa-4444-4444-4444-444444444444', 'aaaaaaaa-3333-3333-3333-333333333333'),
  ('bbbbbbbb-1111-1111-1111-111111111111', 'aaaaaaaa-3333-3333-3333-333333333333');

-- Two JDs from the same company/batch: JD 1 drives the pre->post shortlist transition; JD 2 stays
-- pre-shortlist throughout for the permission-tier / cross-tenant / edge-case assertions.
insert into jds (id, company_id, batch_id, role_title, apply_by_deadline, status) values
  ('bbbbbbbb-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333',
   'a2222222-2222-2222-2222-222222222222', 'Masking RPC Test Role 1', now() + interval '30 days', 'published'),
  ('bbbbbbbb-5555-5555-5555-555555555555', 'a3333333-3333-3333-3333-333333333333',
   'a2222222-2222-2222-2222-222222222222', 'Masking RPC Test Role 2', now() + interval '30 days', 'published');

insert into applications (id, student_id, jd_id, status) values
  ('bbbbbbbb-4444-4444-4444-444444444444', 'a5555555-5555-5555-5555-555555555555',
   'bbbbbbbb-3333-3333-3333-333333333333', 'applied'),
  ('bbbbbbbb-6666-6666-6666-666666666666', 'a5555555-5555-5555-5555-555555555555',
   'bbbbbbbb-5555-5555-5555-555555555555', 'applied');

-- ── Own-company Recruiter, pre-shortlist (JD 1) ─────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9999999-9999-9999-9999-999999999999', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 1. Row exists via the RPC pre-shortlist (the defect this whole fix is for).
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  1,
  'own-company Recruiter: RPC returns the row pre-shortlist (Finding #10 fixed)'
);
-- 2-4. Masked pre-shortlist.
select is(
  (select phone from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  null, 'own-company Recruiter: phone masked pre-shortlist'
);
select is(
  (select personal_email from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  null, 'own-company Recruiter: personal_email masked pre-shortlist'
);
select is(
  (select gender from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  null, 'own-company Recruiter: gender masked pre-shortlist'
);
-- 5. Finding #7 regression guard: raw students table still blocked pre-shortlist.
select is(
  (select count(*)::int from students where id = 'a5555555-5555-5555-5555-555555555555'),
  0,
  'Finding #7 regression guard: raw students table still blocked pre-shortlist'
);
-- 6. A different company's recruiter (same institute) gets zero rows.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-2222-2222-2222-222222222222', true);
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  0,
  'a different company''s Recruiter (same institute) gets zero rows'
);

-- ── Advance JD 1's application to shortlisted (as postgres) ────────────────────────────────

reset role;
update applications set status = 'shortlisted' where id = 'bbbbbbbb-4444-4444-4444-444444444444';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9999999-9999-9999-9999-999999999999', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 7. Row still present post-shortlist.
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  1, 'own-company Recruiter: RPC row still present post-shortlist'
);
-- 8-10. Unmasked post-shortlist.
select is(
  (select phone from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  '9111111111', 'own-company Recruiter: phone unmasked post-shortlist'
);
select is(
  (select personal_email from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  'masking.student.secret@pgtap.test', 'own-company Recruiter: personal_email unmasked post-shortlist'
);
select is(
  (select gender from get_applicant_directory('bbbbbbbb-3333-3333-3333-333333333333')),
  'female', 'own-company Recruiter: gender unmasked post-shortlist'
);
-- 11. Raw students table becomes visible post-shortlist (unchanged, pre-existing behavior).
select is(
  (select count(*)::int from students where id = 'a5555555-5555-5555-5555-555555555555'),
  1, 'post-shortlist: raw students row now visible to the recruiter (matches unmask condition)'
);

-- ── Permission-tier checks against JD 2, kept pre-shortlist throughout ─────────────────────

-- 12-13. Shortlist-Oversight-only custom role: sees the row, but it stays masked (no Student
--        Data - Full). This is the discrepancy the migration explicitly resolves.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')),
  1, 'Shortlist-Oversight-only role: sees the pre-shortlist row (institute-scoped visibility)'
);
select is(
  (select phone from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')),
  null, 'Shortlist-Oversight-only role: phone stays masked (holds Oversight, not Student Data - Full)'
);

-- 14-15. Admin (Student Data - Full): sees the row AND it's unmasked despite being pre-shortlist.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-7777-7777-7777-777777777777', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')),
  1, 'Admin (Student Data - Full): sees the pre-shortlist row'
);
select is(
  (select phone from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')),
  '9111111111', 'Admin (Student Data - Full): phone unmasked despite pre-shortlist status'
);

-- 16. Pending Recruiter: zero rows (current_user_id() resolves to null, Finding #2 mechanism).
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-9999-9999-9999-999999999999', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')),
  0, 'a Pending Recruiter (own company) gets zero rows'
);

-- 17. Deactivated Shortlist-Oversight-only holder: zero rows.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')),
  0, 'a deactivated Shortlist-Oversight-only holder gets zero rows'
);

-- 18. anon cannot execute the RPC at all (grant-level, not just permission-level).
reset role;
set local role anon;
select throws_ok(
  $$select * from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')$$,
  '42501',
  null,
  'anon role cannot execute get_applicant_directory (no EXECUTE grant)'
);

-- ── Cross-institute checks: Institute B actors against Institute A's JD 2 ─────────────────

reset role;
insert into institutes (id, name, slug) values
  ('cccccccc-1111-1111-1111-111111111111', 'Masking RPC Test Institute B', 'masking-rpc-test-b');
insert into companies (id, institute_id, name) values
  ('cccccccc-2222-2222-2222-222222222222', 'cccccccc-1111-1111-1111-111111111111', 'Institute B Co');
insert into auth.users (id) values
  ('cccccccc-4444-4444-4444-444444444444'), ('cccccccc-6666-6666-6666-666666666666');
insert into users (id, auth_user_id, institute_id, company_id, name, email, status) values
  ('cccccccc-3333-3333-3333-333333333333', 'cccccccc-4444-4444-4444-444444444444',
   'cccccccc-1111-1111-1111-111111111111', 'cccccccc-2222-2222-2222-222222222222',
   'Institute B Recruiter', 'institute-b-recruiter@pgtap.test', 'active'),
  ('cccccccc-5555-5555-5555-555555555555', 'cccccccc-6666-6666-6666-666666666666',
   'cccccccc-1111-1111-1111-111111111111', null,
   'Institute B Admin', 'institute-b-admin@pgtap.test', 'active');
insert into user_roles (user_id, role_id)
  select 'cccccccc-3333-3333-3333-333333333333', id from roles where name = 'Recruiter';
insert into user_roles (user_id, role_id)
  select 'cccccccc-5555-5555-5555-555555555555', id from roles where name = 'Admin';

-- 19. Cross-institute Recruiter (company-mismatch branch): zero rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')),
  0, 'a Recruiter in a different institute gets zero rows'
);

-- 20. Cross-institute Admin (Student Data - Full, but wrong institute): zero rows. Isolates the
--     explicit institute check from the permission check.
select set_config('request.jwt.claim.sub', 'cccccccc-6666-6666-6666-666666666666', true);
select is(
  (select count(*)::int from get_applicant_directory('bbbbbbbb-5555-5555-5555-555555555555')),
  0, 'an Admin (Student Data - Full) in a different institute still gets zero rows'
);

-- ── Edge cases ──────────────────────────────────────────────────────────────────────────────

-- 21. Null p_jd_id fails safely with an explicit error, not a silent wrong answer.
select set_config('request.jwt.claim.sub', 'a9999999-9999-9999-9999-999999999999', true);
select throws_ok(
  $$select * from get_applicant_directory(null)$$,
  'P0001',
  'p_jd_id is required',
  'a null p_jd_id raises an explicit error'
);

-- 22. A well-formed but non-existent JD id returns zero rows, not an error.
select is(
  (select count(*)::int from get_applicant_directory('dddddddd-dddd-dddd-dddd-dddddddddddd')),
  0, 'a non-existent JD id returns zero rows, not an error'
);

select * from finish();
rollback;
