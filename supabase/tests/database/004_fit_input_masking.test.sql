-- pgTAP coverage for 0027_fit_briefs.sql — the model-facing read path for Fit briefs.
--
-- The property under test is stricter than get_candidate_packets(): the payload handed to the
-- model must never contain identity or masked fields — name, gender, age, phone, personal email —
-- for ANY authorized caller at ANY application status, including after shortlist and including
-- Admin. The seed data therefore puts distinctive sentinel strings in every one of those fields
-- (both on the students row and inside the CV snapshot's personalInfo) and asserts by substring
-- search over the whole JSON text, not by checking named keys: a masked NULL and a renamed key
-- are indistinguishable through a named-key check (the same lesson as Finding #10's test rewrite).
--
-- Run via `supabase test db` or scripts/run-pgtap.mjs. Self-contained; rolls back.

begin;
create extension if not exists pgtap;

select plan(18);

-- ── Fixtures ────────────────────────────────────────────────────────────────────────────────

insert into institutes (id, name, slug) values
  ('f1111111-1111-1111-1111-111111111111', 'Fit Input Test Institute', 'fit-input-test');
insert into batches (id, institute_id, name, is_active) values
  ('f2222222-2222-2222-2222-222222222222', 'f1111111-1111-1111-1111-111111111111', 'Fit Batch', true);
insert into companies (id, institute_id, name) values
  ('f3333333-3333-3333-3333-333333333333', 'f1111111-1111-1111-1111-111111111111', 'Fit Own Co'),
  ('f4444444-4444-4444-4444-444444444444', 'f1111111-1111-1111-1111-111111111111', 'Fit Other Co');

insert into auth.users (id) values
  ('f7777777-7777-7777-7777-777777777777'), -- student
  ('f9999999-9999-9999-9999-999999999999'), -- own-company recruiter
  ('fa111111-1111-1111-1111-111111111111'), -- other-company recruiter
  ('fa222222-2222-2222-2222-222222222222'); -- admin (Student Data - Full)

insert into users (id, auth_user_id, institute_id, batch_id, name, email, status) values
  ('f6666666-6666-6666-6666-666666666666', 'f7777777-7777-7777-7777-777777777777',
   'f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222',
   'SENTINEL_STUDENT_NAME', 'fit-student@pgtap.test', 'active');
insert into students (id, user_id, batch_id, roll_no, name, age, gender, phone, personal_email,
                      total_work_ex_months, prior_employers, other_qualifications) values
  ('f5555555-5555-5555-5555-555555555555', 'f6666666-6666-6666-6666-666666666666',
   'f2222222-2222-2222-2222-222222222222', 'FIT01', 'SENTINEL_STUDENT_NAME', 27,
   'SENTINEL_GENDER', 'SENTINEL_PHONE_9111', 'SENTINEL_EMAIL@pgtap.test',
   28, '[{"employer":"Acme Systems","role":"SDE","months":28}]', 'SENTINEL_QUALIFICATION_OK');

insert into users (id, auth_user_id, institute_id, company_id, name, email, status) values
  ('f8888888-8888-8888-8888-888888888888', 'f9999999-9999-9999-9999-999999999999',
   'f1111111-1111-1111-1111-111111111111', 'f3333333-3333-3333-3333-333333333333',
   'Own Recruiter', 'fit-own@pgtap.test', 'active'),
  ('fa333333-3333-3333-3333-333333333333', 'fa111111-1111-1111-1111-111111111111',
   'f1111111-1111-1111-1111-111111111111', 'f4444444-4444-4444-4444-444444444444',
   'Other Recruiter', 'fit-other@pgtap.test', 'active');
insert into users (id, auth_user_id, institute_id, name, email, status) values
  ('fa444444-4444-4444-4444-444444444444', 'fa222222-2222-2222-2222-222222222222',
   'f1111111-1111-1111-1111-111111111111', 'Fit Admin', 'fit-admin@pgtap.test', 'active');

insert into user_roles (user_id, role_id)
  select 'f6666666-6666-6666-6666-666666666666', id from roles where name = 'Student';
insert into user_roles (user_id, role_id)
  select 'f8888888-8888-8888-8888-888888888888', id from roles where name = 'Recruiter';
insert into user_roles (user_id, role_id)
  select 'fa333333-3333-3333-3333-333333333333', id from roles where name = 'Recruiter';
insert into user_roles (user_id, role_id)
  select 'fa444444-4444-4444-4444-444444444444', id from roles where name = 'Admin';

insert into cv_documents (id, student_id, version_no, content) values
  ('fb111111-1111-1111-1111-111111111111', 'f5555555-5555-5555-5555-555555555555', 1,
   '{"title":"CV","personalInfo":{"name":"SENTINEL_STUDENT_NAME","email":"SENTINEL_EMAIL@pgtap.test","phone":"SENTINEL_PHONE_9111","linkedin":"SENTINEL_LINKEDIN","location":"Raipur","summary":"Backend engineer who shipped a 140M events/day pipeline","headline":"SDE","website":"","dateOfBirth":"SENTINEL_DOB","gender":"SENTINEL_GENDER","totalExperience":"28 months"},"academics":[],"experience":[{"id":"e1","company":"Acme Systems","role":"SDE","period":"2022-2024","bullets":[{"id":"b1","text":"Built a distributed telemetry pipeline handling 140M events per day"}]}],"projects":[],"positions":[],"skills":["Python"],"certifications":[],"awards":[],"languages":[],"hobbies":["SENTINEL_HOBBY"],"publications":[],"activities":[],"customSections":[],"hiddenSections":[],"sectionOrder":[],"jdFit":null}');

insert into jds (id, company_id, batch_id, role_title, apply_by_deadline, status) values
  ('fc111111-1111-1111-1111-111111111111', 'f3333333-3333-3333-3333-333333333333',
   'f2222222-2222-2222-2222-222222222222', 'Fit Test Role', now() + interval '30 days', 'published');

insert into applications (id, student_id, jd_id, status, cv_document_id) values
  ('fd111111-1111-1111-1111-111111111111', 'f5555555-5555-5555-5555-555555555555',
   'fc111111-1111-1111-1111-111111111111', 'applied', 'fb111111-1111-1111-1111-111111111111');

-- ── Own-company Recruiter, pre-shortlist ────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9999999-9999-9999-9999-999999999999', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 1. Authorized caller gets a payload.
select isnt(
  get_fit_input('fd111111-1111-1111-1111-111111111111'), null,
  'own-company Recruiter: fit input is returned pre-shortlist'
);
-- 2-3. The work content the brief needs IS present.
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text like '%140M events per day%',
  'own-company Recruiter: CV work bullets are present'
);
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text like '%SENTINEL_QUALIFICATION_OK%',
  'own-company Recruiter: profile-sheet qualifications are present'
);
-- 4-9. Identity and masked fields are absent from the entire JSON text.
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_STUDENT_NAME%',
  'pre-shortlist: student name is absent (students row and CV)'
);
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_PHONE%',
  'pre-shortlist: phone is absent'
);
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_EMAIL%',
  'pre-shortlist: personal email is absent'
);
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_GENDER%',
  'pre-shortlist: gender is absent (students row and CV)'
);
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_DOB%'
  and get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_LINKEDIN%',
  'pre-shortlist: date of birth and LinkedIn are absent'
);
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_HOBBY%',
  'pre-shortlist: hobbies are absent'
);

-- ── After shortlist: the recruiter may see contacts in the packet, the model still may not ──

reset role;
update applications set status = 'shortlisted' where id = 'fd111111-1111-1111-1111-111111111111';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9999999-9999-9999-9999-999999999999', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 10. Sanity: the packet path DOES unmask now (so the next assertion is meaningful).
select is(
  (select student->>'phone' from get_candidate_packets(array['fd111111-1111-1111-1111-111111111111']::uuid[])),
  'SENTINEL_PHONE_9111',
  'control: get_candidate_packets unmasks phone after shortlist'
);
-- 11. Fit input still does not.
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_PHONE%'
  and get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_EMAIL%'
  and get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_GENDER%'
  and get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_STUDENT_NAME%',
  'post-shortlist: fit input still contains no name, phone, email or gender'
);

-- ── Admin (Student Data - Full): same stripping ─────────────────────────────────────────────

select set_config('request.jwt.claim.sub', 'fa222222-2222-2222-2222-222222222222', true);
-- 12.
select isnt(get_fit_input('fd111111-1111-1111-1111-111111111111'), null,
  'Admin: fit input is returned');
-- 13.
select ok(
  get_fit_input('fd111111-1111-1111-1111-111111111111')::text not like '%SENTINEL_%',
  'Admin: no sentinel identity field reaches the model even for Student Data - Full'
);

-- ── Other-company Recruiter: nothing ───────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', 'fa111111-1111-1111-1111-111111111111', true);
-- 14.
select is(get_fit_input('fd111111-1111-1111-1111-111111111111'), null,
  'a Recruiter at another company gets null (indistinguishable from absent)');

-- ── Student: cannot read own brief or fit input ────────────────────────────────────────────

select set_config('request.jwt.claim.sub', 'f7777777-7777-7777-7777-777777777777', true);
-- 15.
select is(get_fit_input('fd111111-1111-1111-1111-111111111111'), null,
  'the Student themself gets null from get_fit_input');

reset role;
insert into jd_fit_criteria (id, jd_id, version_no, criteria, created_by_user_id) values
  ('fe111111-1111-1111-1111-111111111111', 'fc111111-1111-1111-1111-111111111111', 1,
   '[{"id":"c1","kind":"must","text":"Shipped a distributed system"}]',
   'f8888888-8888-8888-8888-888888888888');
insert into application_fit_briefs (id, application_id, criteria_id, verdict, summary, model, generated_by_user_id) values
  ('fe222222-2222-2222-2222-222222222222', 'fd111111-1111-1111-1111-111111111111',
   'fe111111-1111-1111-1111-111111111111', 'strong', 'SENTINEL_BRIEF_SUMMARY', 'test-model',
   'f8888888-8888-8888-8888-888888888888');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f7777777-7777-7777-7777-777777777777', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
-- 16. No student-visible SELECT branch on briefs (Finding #8 rule).
select is(
  (select count(*)::int from application_fit_briefs where application_id = 'fd111111-1111-1111-1111-111111111111'),
  0, 'the Student cannot select their own fit brief'
);
-- 17. Nor the criteria.
select is(
  (select count(*)::int from jd_fit_criteria where jd_id = 'fc111111-1111-1111-1111-111111111111'),
  0, 'the Student cannot select the JD fit criteria'
);

-- ── anon: EXECUTE revoked (0025 systemic rule applied explicitly) ────────────────────────────

reset role;
-- 18.
select ok(
  not has_function_privilege('anon', 'get_fit_input(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'fit_verdict_distribution(uuid)', 'EXECUTE'),
  'anon cannot execute get_fit_input or fit_verdict_distribution'
);

select * from finish();
rollback;
