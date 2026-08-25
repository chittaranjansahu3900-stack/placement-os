# Placement OS

Placement process digitization for premium B-Schools, starting with IIM Raipur's CDPO.
Standalone SaaS on its own subdomain under the iitiimcareers.in platform — visually aligned
with the platform, architecturally independent of Cursivo and OutreachOS.

Full requirements, data model, personas, journeys, competitive analysis, and MVP acceptance
criteria live in the BRD: `docs/PlacementOS_BRD_v3.pdf`.

Current requirement-by-requirement completion and remaining work are tracked in
`docs/BRD-IMPLEMENTATION-STATUS.md`.

## Status

Every Section 4 module now has a working baseline UI, matching the BRD's own MVP philosophy
(Section 8.2: "every module gets a working baseline... rather than one module being built deep while
others are absent"). Full loop: sign up → post a JD → import a roster → a student creates a
profile-prefilled CV → applies with that CV snapshot → a recruiter shortlists them and sees the attached
CV as masked fields unmask → an SPC schedules interview rounds and sees stale pipelines flagged → a
placement is confirmed → it shows up in the Reports dashboard and CSV export. Outreach CRM, Resume
Maker, and RBAC admin UI (roles, users, audit log) are all in. None of it has run against a real Postgres
yet — see "Known gaps."

## Stack (BRD Section 12.1)

- Next.js 16 (App Router, Turbopack). **This is not the Next.js in most training data** —
  `middleware.ts` is renamed `proxy.ts` (Node.js runtime, not Edge), `cookies()`/`params`/
  `searchParams` are always async. Read `node_modules/next/dist/docs/` before touching
  routing/auth code; `AGENTS.md` points there.
- Supabase (Postgres + Auth), Row-Level Security implementing the Role/Permission Set model
- Hosting: **Firebase App Hosting**, not Vercel — a deliberate deviation from the BRD's
  Section 12.1 recommendation (Vercel, to match OutreachOS). See "Hosting" below.
- Notifications: Resend (not yet wired)

## What's actually built

- **Schema** (`supabase/migrations/`): all Section 5 entities, corrected against Appendix B's
  real column mapping. Multi-tenant from day one (`institute_id` + RLS), per Section 12.1.
- **RBAC** (`0002_rls_policies.sql`, `0003_seed_reference_data.sql`): the 5 base roles + 14
  permission sets from Section 7.2/7.3, enforced as Postgres RLS policies — not just UI checks.
- **Field-level masking** (`0004_settings_functions_views.sql`, hardened by `0012_codex_audit_fixes.sql`):
  recruiter screens read the `applicant_directory` view, which masks phone/personal_email/gender until
  that application is shortlisted — and as of 0012, `students_select`'s raw-table recruiter clause now
  requires the same shortlisted+ condition, so the view is no longer the *only* thing enforcing this.
  This was a real, confirmed bypass (Codex's Section 3 Finding #7, `docs/BRD-IMPLEMENTATION-STATUS.md`) —
  a recruiter could previously query `students` directly and get full unmasked PII for anyone who'd
  applied to their company at any status, not just shortlisted+.
- **Eligibility Engine** (FR-2.1–FR-2.3, same migration): `eligible_student_count_for_jd()` is
  callable by anyone who can see the JD (no PII); `eligible_students_for_jd()` — the actual
  row list — is gated to Student Data - Full (Admin/SPC) per FR-2.5.
- **Auth**: recruiter self-registration (FR-1.1, pending Admin approval), login, a role-aware
  dashboard shell. First Admin has to be bootstrapped out-of-band (`npm run admin:bootstrap` —
  there's no self-service path to Admin by design, see the script's own comment for why).
- **JD lifecycle** (Section 4.1/4.2): Draft → Publish, with the live eligible-count preview
  from FR-1.4.
- **Roster import** (FR-9.1 + Appendix D): Admin pastes a CSV, reviews every parsed row and validation
  issue, then explicitly confirms the RLS-gated upsert into `students`. The shared client/server parser
  supports quoted commas and reordered headers, bounds-checks numeric fields, validates email shape,
  and skips invalid rows only after showing them to the Admin.
- **Student login provisioning**: since SSO (Section 9) is unresolved, an Admin can generate a
  one-time-password login per imported student from the roster page as a stand-in for "SSO
  auto-activates" (Section 7.5).
- **Student application flow** (Section 4.3): browse published JDs for my batch, a real
  per-criterion eligibility self-check with reasons (FR-3.4, `my_eligibility_for_jd()`), one-click
  apply, My Applications with live status, withdraw before deadline.
- **Recruiter shortlisting** (Section 4.4): the applicant UI reads `applicant_directory`, so phone/email
  visually unmask only on the shortlisted application row — and that's now backed by a matching raw-table
  restriction (see Field-level masking above), not just the view. Recruiters can act per candidate or
  select up to 500 candidates for one atomic shortlist/waitlist/reject action, with an optional
  Round 1 / GD / PI / Final label appended to each selected candidate's round history. The same page
  now has recruiter-controlled search, CGPA/work-ex/branch/specialization/status filters and sorting,
  plus inline and merged-print Profile Sheet + attached-CV packets. `0014_masked_candidate_packets.sql`
  provides pre-shortlist packets with contact/gender/CV contact fields redacted at the database boundary;
  full packet data unblocks after shortlist without relaxing raw `students` or `cv_documents` access.
- **SPC Coordination** (Section 4.5): `/spc` dashboard off the `spc_pipeline_overview` view —
  shortlisted/total count per active JD and a staleness flag (FR-5.4, no round update within
  `institute_settings.staleness_days`). Interview round scheduling (FR-5.2 — round name,
  time, room/link) lives on the same applicants page as shortlisting, appended to
  `applications.round_history` via `append_application_round()`. Reminder nudges (FR-5.2) aren't
  built — no email delivery yet, and a fake "nudge sent" button that doesn't send anything isn't
  worth having.
- **Defaults Tracker** (Section 4.6): `/admin/defaults` — Admin imports attendance/default CSVs
  (FR-6.3, re-importable via a `(student_id, activity_name)` unique constraint added in
  `0008_defaults_unique_constraint.sql`) and sets the defaults threshold (FR-6.2, feeds the
  Eligibility Engine's existing check). `/defaults` is the student's own read-only view (FR-6.4).
- **Reporting** (Section 4.7): `/reports` — placed/unplaced, avg/median/highest CTC, company-wise
  breakdown, and templated CSV export via `/reports/export`. This module needed a
  gap closed first: nothing previously turned an "selected" application into an actual placement
  record. Added `confirmPlacement()` — a deliberate separate confirmation step gated to Admin/SPC
  (not the recruiter who set the status), since "recruiter marked them selected" and "this offer
  is final and the student is placed" are different claims. Export now offers the source-compatible
  wide Final Placement Datasheet (four columns per company), configurable Accreditation Detail, and
  a PII-free Public Company Summary. The tenant-scoped `0017` RPC avoids unrestricted raw student
  access and the route preserves the `Reports & Export` Permission Set check. Batch-over-batch
  comparison (FR-7.4, needs multiple seasons to exist) isn't built.
- **Outreach CRM** (Section 4.8): `/companies` is now a real Kanban board grouped by pipeline
  stage and includes staged/reviewed target-company CSV import; `/companies/[id]` has stage
  transitions, Owner (JPC)/Supervisor (Senior SPC) assignment, the JD Form Received flag, a
  complete source-sheet contact directory (including title/last-name/cc email), eight distinct
  persona templates with contact/company/sender preview, and
  separate Call Remarks / SPC Remarks logs (Appendix B.3 — the live sheet has three distinct
  remark fields, matched here). Honest scope: **outreach is logged, not sent** — no email
  infrastructure is wired up, so the compose button is labeled "Log Outreach," not "Send," and
  recipient disposition (opened/clicked/responded) is a manual dropdown, not real tracking.
  Scheduled/queued sends (FR-8.6), deliverability health monitoring (FR-8.11), and the
  Placement Committee Vault (FR-8.12, needs file storage) aren't built.
- **RBAC Admin UI** (Section 4.9): `/admin/users` (Section 6.7) — approve/reject pending accounts,
  deactivate/reactivate users, assign/remove Roles, and manage individual extra Permission Sets.
  `/admin/roles` (Section 6.8) — create a custom Role by cloning an existing bundle and edit a
  custom role's name/bundle later; system base roles are locked in both UI and RLS. `/admin/roster`
  creates, archives, and reactivates dated batch/seasons before staged roster import. Assignment
  writes are tenant-scoped by `0016_admin_assignment_scope_guards.sql`. `/admin/audit-log` (FR-9.3) — read-only
  by construction, no update/delete policy exists on `audit_log_entries` at all. Wired
  `log_audit_event()` into JD publish, shortlist status changes, placement confirmation, and every
  admin action above — it wasn't being called anywhere before this pass, so the audit log table
  existed but stayed empty regardless of what happened in the app.
- **Resume Maker baseline** (Section 4.10): `/resume` — students create multiple persona-specific CV
  versions, with the first version pre-filled from their roster profile; edit the placement-cell layout
  with a live preview; use the action/outcome/metric achievement builder; see upcoming JD urgency;
  run transparent keyword coverage against a selected JD; choose Placement Cell Classic, Modern Blue,
  or Compact Executive; and export through browser Print/Save PDF or a genuine OOXML `.docx`.
  `/resume/review` gives Admin/SPCs an inline section/bullet comment
  workflow, and students action each comment as applied or dismissed. `0009_resume_maker.sql` makes
  the current CV a snapshot on each new application; recruiters can open only that exact attached CV,
  and only after the relevant candidate is shortlisted. Honest scope: the fact-safe achievement builder
  is deterministic until an AI provider is configured.

## Security note

Mid-build audit of `0002_rls_policies.sql` caught the same bug shape five separate times: a
`WITH CHECK` clause weaker than its matching `USING` clause (dropping the `has_permission(...)`
condition and leaving only the institute-match check). Since RLS applies `USING` to what you
can target and `WITH CHECK` to what the resulting row must satisfy, an unprivileged authenticated
user — a Student, a Recruiter, anyone logged in — could have inserted or updated rows in
`students`, `default_records`, `companies`, `company_contacts`, and `outreach_activities` well
past what their role should allow. All five are fixed (`WITH CHECK` now mirrors `USING`
everywhere), but **because these migrations have never run against a real Postgres, this class
of bug wasn't caught by any tool** — it was found by manually re-reading every policy and
diffing USING against WITH CHECK by hand. Do that re-read again after any future RLS edit, and
budget for a real pentest/security-review pass before this goes anywhere near production data,
not just another hand-review.

Separately, while building round scheduling (`0007_spc_coordination.sql`): `applications_update`
RLS is row-level, so a student who owns their application row could `UPDATE` any column on it,
not just `withdrawn_at`. Nothing had exploited that yet (the app only ever sent `{withdrawn_at}`
for a student caller), but the new `append_application_round()` RPC is callable directly by any
authenticated user regardless of what the UI shows, so this one was caught and fixed *before*
shipping rather than after — a `BEFORE UPDATE` trigger now blocks a student caller from touching
anything but `withdrawn_at`. Same pattern as the CV review comment trigger from the first
security pass. Worth remembering as a standing rule: **any time a new RPC writes to a table a
non-privileged role has row-level UPDATE access to, check whether that role can now reach columns
RLS never meant to expose to them** — RLS alone won't catch it.

A third instance of the same underlying pattern (`0011_students_self_update_guard.sql`), found
while reviewing the Resume Maker migration rather than while building something new: `students_self_update`
(0002) lets a student `UPDATE` their own `students` row with **no column restriction at all** —
`user_id = current_user_id()` on both USING and WITH CHECK, nothing narrower. That row holds
`graduation_details`/`pg_details` (CGPA, branch, backlog_count) — the exact fields the Eligibility
Engine (`_eligible_student_ids_for_jd`, 0004) trusts unconditionally — plus `placement_status` and
`batch_id`. A student could self-edit their own CGPA to pass a JD's minimum, or their branch to
pass an eligible-branches filter, directly against the Supabase client with no server action
involved at all. This one went unnoticed through two earlier security passes specifically because
nothing in the app *used* this policy — the CV-sync triggers in 0009 write through SECURITY
DEFINER, bypassing RLS entirely, so there was no feature pointing at the gap to prompt a second
look. It surfaced only because fixing it required checking whether a legitimate nested write (the
CV-sync trigger touching a student's own `latest_cv_document_id`) would collide with the new
restriction — which is exactly the kind of question worth asking about *every* existing
self-service RLS policy, not just ones a new feature happens to touch. Fixed with a
`pg_trigger_depth() = 0` guard so the restriction only applies to a genuine top-level client
update, not the nested trigger-issued one, and scoped to allow only `phone`/`personal_email`
self-edits — everything else on that row is institute-managed (roster import, CV activity,
placement confirmation).

**Codex ran an independent BRD/security audit** (`docs/BRD-IMPLEMENTATION-STATUS.md`) and found
seven more real, confirmed issues in the same vein — one of them (Finding #7, `students_select`'s
recruiter clause missing the shortlisted-status filter) is arguably the most severe single finding
across both reviewers: a recruiter could query `students` directly and get full unmasked PII for
anyone who'd applied to their company, at *any* status, completely bypassing the point of the
`applicant_directory` view. Every finding was independently re-verified against the actual current
policy/function text before being trusted (same discipline as everything above — an AI audit is not
automatically correct just because it's thorough) and then fixed in
`0012_codex_audit_fixes.sql`. The single highest-leverage fix in that batch: `current_user_id()`
(and `current_company_id()`) now require `status = 'active'`. Every other permission check in the
system — `has_permission()`, `has_role()`, `current_student_id()` — routes through
`current_user_id()` internally, so this one change closes an entire class of gap at once: previously,
a self-registered Recruiter already held their role's default Permission Sets the moment they signed
up, *before* Admin approval, because nothing anywhere checked `status = 'active'` — the "pending
approval" gate was purely a UI message, not a real boundary. Full findings, verification notes, and
fixes are in `docs/BRD-IMPLEMENTATION-STATUS.md` Section 3 — that document is now the canonical
FR-by-FR BRD traceability record; don't re-derive a parallel "what's done" list here.

## Known gaps (don't re-litigate these, just build them next)

- No SSO — Section 9 leaves the provider unresolved, so auth is Supabase email/password for now.
- No file storage — JD attachments, CV files, and the Placement Committee Vault (FR-8.12) aren't
  wired to Supabase Storage yet.
- No email delivery (Resend) — JD notifications (FR-2.4/2.6), student login handoff, and all of
  Outreach CRM's "sending" are manual/synchronous stand-ins
  or explicitly logged-not-sent right now.
- Resume Maker still needs a configured AI provider for true bullet rewriting/CoPilot behavior and
  structured import from existing PDF/DOCX files. The current baseline deliberately does not claim deterministic keyword
  coverage or the fact-safe achievement composer is generative AI.
- FR-7.3 (configurable export templates for other audiences) and FR-7.4 (batch-over-batch
  comparison) are out — the latter needs multiple seasons of real data to mean anything.
- Editing an existing custom Role's Permission Set bundle after creation isn't built — only
  create-a-new-role-by-cloning is.
- `src/types/domain.ts` is hand-written, not generated. Once a real Supabase project is
  linked, run `npm run db:types` and prefer the generated `Database` type for new query code.
- No automated tests.

## Hosting: Firebase App Hosting, not Vercel

Deliberate choice, not the BRD default — the founder didn't want Vercel. Firebase App Hosting
is Google's current first-class Next.js product (Cloud Run-based; this is *not* the older
static-export "Firebase Hosting"). Two things worth knowing before you rely on this:

- **`next.config.ts` sets `output: 'standalone'`.** Verified locally: without it, the build
  succeeds but the Cloud Run container fails to start with nothing in the logs pointing back
  to this as the cause. Confirmed `.next/standalone/server.js` lands at the path App Hosting's
  buildpack expects (this repo isn't a monorepo, so no custom `scripts.runCommand` override is
  needed in `apphosting.yaml`).
- **`src/proxy.ts` is a real, unverified risk.** Firebase's own Next.js Adapter blog post
  (March 2026) says Proxy/Middleware "still face architectural challenges" across hosting
  providers and isn't fully supported everywhere yet. It should work functionally — App Hosting
  runs the actual `next start` Node process on Cloud Run, not an edge runtime, so proxy.ts
  executes in-process same as any Node middleware — but this is reasoning from how Cloud Run
  works, not a confirmed deploy. **Test the auth-redirect flow (an unauthenticated request to
  `/dashboard` should redirect to `/login`) as the first thing you check after the first real
  deploy.** If it's broken, that's the first place to look.
- Next.js 16.3.1 (this repo's version) is just past the 16.2 floor for Firebase's stable
  Adapter API — comfortably supported, not bleeding-edge for App Hosting specifically.

`apphosting.yaml` at the repo root declares the required env vars/secrets but has empty
placeholder values for `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` — fill those
in, or set them in the Firebase Console instead (console values there win over the file).
`SUPABASE_SERVICE_ROLE_KEY` is wired as a Secret Manager reference, not a plain value, since it
bypasses RLS.

**Setup** (needs your own interactive `firebase login` + GitHub App install through the Firebase
Console — not something that could be done from this session):

1. `npm install -g firebase-tools` (or use `npx firebase-tools`), then `firebase login`.
2. Reuse the existing Firebase project behind Cursivo/OutreachOS's auth federation layer if you
   want one project across all iitiimcareers.in products, or create a new one — your call, not
   made here.
3. `firebase apphosting:secrets:set SUPABASE_SERVICE_ROLE_KEY` to create the secret
   `apphosting.yaml` references.
4. Firebase Console → Hosting & Serverless → App Hosting → create a backend, connect this
   GitHub repo, set the live branch. Automatic rollouts deploy on every push to that branch —
   there's no separate manual deploy command once connected.

## Resend notification setup

PlacementOS uses one server-side queue for JD publication, application/shortlist updates,
SPC round notices and reminders, and outreach mail merge. The copy in
`src/lib/notifications/templates.ts` is deliberately marked as a draft: obtain CDPO approval
before changing `NOTIFICATIONS_SEND_ENABLED` to `true`.

1. Verify `mail.iitiimcareers.in` in Resend and configure
   `PlacementOS Notifications <notifications@mail.iitiimcareers.in>` as `RESEND_FROM_EMAIL`.
   Set `RESEND_SENDING_DOMAIN` to that public sending domain and
   `RESEND_DKIM_SELECTOR` to the selector Resend asks you to publish; FR-8.11's
   server-only health check uses them for SPF/DKIM/DMARC assessment. The later
   IIM Raipur sender change is an environment-value swap, not a code change.
2. Create server-only Firebase secrets for `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`,
   `NOTIFICATION_CRON_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY`. Never prefix these with
   `NEXT_PUBLIC_`.
3. Register `https://YOUR_APP_HOST/api/webhooks/resend` in Resend for email lifecycle events.
4. Invoke `POST /api/notifications/process` on a schedule with
   `Authorization: Bearer <NOTIFICATION_CRON_SECRET>` so queued retries are processed.
5. Send a controlled internal pilot, confirm sent/delivered/open/bounce events in the UI, and only
   then enable real-recipient delivery.

## Local setup

1. Create a Supabase project (or run one locally — `npm run db:start` needs Docker, which
   wasn't available in the environment this was built in, so migrations are unexecuted and
   unverified against a real Postgres — reviewed by hand only).
2. `cp .env.local.example .env.local` and fill in the Supabase URL/keys.
3. Push the schema: `supabase link` then `supabase db push` (or `npm run db:reset` against a
   local stack) — **the migrations have never been run against a real Postgres**, only
   reviewed by hand, so expect to fix something on the first push.
4. `npm run admin:bootstrap -- you@iimraipur.ac.in 'a-strong-password' 'CDPO Office'` to create
   the first Admin login.
5. `npm run dev`.

## Module lineage

Both now built (see "What's actually built" above); this is what they were adapted from, per
Section 12.1/4.8.1/4.10.1, if you're trying to port a feature this baseline doesn't have yet:

- **Resume Maker** (Section 4.10) — adapted from Cursivo's CV editor. AI-assist (real bullet
  rewriting via a configured LLM provider, not the current deterministic fact-safe builder) is
  the main piece of that stack still unported.
- **Pre-Season Outreach CRM** (Section 4.8) — adapted from OutreachOS's module set (minus Inbox,
  Auto-Apply). Scheduled/queued sends and deliverability health monitoring are the main pieces
  still unported — both need real email infrastructure this baseline doesn't have.
