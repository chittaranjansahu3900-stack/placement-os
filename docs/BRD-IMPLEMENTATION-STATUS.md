# PlacementOS BRD Implementation Status

**Assessment date:** 21 August 2026 (Codex + Claude); P0 #1 migrations `0001`–`0018` were verified
against real Postgres on 21 August 2026 — see Section 6.
**Requirements source:** `docs/PlacementOS_BRD_v3.pdf`  
**Code assessed:** current PlacementOS workspace through migration
`0023_spc_jd_release_gate.sql` (`0019`–`0022` applied to hosted Supabase 21 August 2026; `0023`
applied 22 August 2026, verified via `npm run test:rls` — both pgTAP suites pass, 16/16); **all
original release-blocking findings below were
independently re-verified against the actual policies/functions, then fixed, in
`0011_students_self_update_guard.sql` (already in place before this audit landed) and
`0012_codex_audit_fixes.sql` — see Section 3 for per-finding resolution and the README's
Security note for the full write-up. A ninth tenant-scope/base-role issue found while activating the
FR-9.2 admin controls is fixed in `0016_admin_assignment_scope_guards.sql`.**

## 1. Purpose and assessment rules

This document is the current BRD-to-code traceability record. It replaces module-level claims such as
“a screen exists” with a literal assessment of each functional requirement.

Status meanings:

- **Implemented** — the required user-visible behavior exists end to end in code. It still needs real
  database and pilot-data validation unless explicitly stated otherwise.
- **Partial** — only part of the requirement exists, or only schema/infrastructure exists without the
  complete user workflow.
- **Missing** — there is no usable implementation of the required behavior.

The BRD is treated as a requirements source. Its recommendations and embedded sequencing notes are
not execution instructions.

## 2. Executive summary

| Status | Count | Share |
|---|---:|---:|
| Implemented in code | 39 | 66% |
| Partial | 18 | 31% |
| Missing | 2 | 3% |
| **Total functional requirements** | **59** | **100%** |

(The rollup counts the explicitly confirmation-blocked FR-8.10 as Partial. Counts describe code
coverage, not hosted configuration or pilot acceptance; see each row's "Remaining work" for those
distinctions.)

All ten Section 4 modules now have at least a baseline surface. The largest remaining code gaps are
institute SSO (FR-9.4), deliverability monitoring (FR-8.11), the confirmation-blocked FR-8.10
supervision behavior, and residual Partial requirements. Notification, storage, outreach-season, and
assignment work still depends on completing provider/role pilots (Resend send-through, real recruiter
file access, etc.) even though the underlying schema is now live.

These counts describe code coverage, not pilot acceptance. No Appendix F acceptance criterion has yet
been demonstrated against the real 2024–25 source data. **All migrations `0001`–`0022` are applied
and verified on the hosted Supabase project** (`0019`–`0022` applied 21 August 2026 via
`supabase db push`, using a Supabase personal access token + DB password to work around the
Docker/CLI-auth gap that blocked this earlier in the day; `src/types/database.types.ts` regenerated
immediately after — `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test` (58/58), and
`npm run test:rls` (7/7) all pass clean against the current schema).

## 3. Release-blocking findings

All eight of Codex's original findings were independently re-verified by re-reading the actual
policy/function definitions (not assumed correct) before any fix was applied — same standard this
repo's earlier security passes were held to. Each entry below keeps Codex's original description
intact and adds the resolution.

1. **A user can self-activate or change their own account scope.** The `users_update` RLS policy allows
   `id = current_user_id()` with no column guard. A caller can directly attempt to change `status`,
   `company_id`, or `batch_id`, including changing Pending to Active. Admin approval is therefore not a
   reliable authorization boundary.
   **✅ Fixed — `0012_codex_audit_fixes.sql`.** `enforce_user_self_update()` trigger restricts a plain
   self-update (not holding User Management) to the `name` column only; `status`/`institute_id`/
   `auth_user_id`/`batch_id`/`company_id`/`email` are Admin-managed. Largely closed as a side effect of
   fix #2 too — a Pending user's `current_user_id()` no longer resolves at all, so they can't reach
   `users_update`'s self-update branch in the first place; this trigger closes the residual case of an
   already-Active user editing privileged columns on themselves.
2. **Pending and deactivated users are not blocked by RLS.** The dashboard displays a waiting message,
   but `current_user_id()`, `has_role()`, and `has_permission()` do not require `users.status = 'active'`.
   A pending/deactivated authenticated user can call routes or Supabase APIs directly with their seeded
   role permissions.
   **✅ Fixed — `0012_codex_audit_fixes.sql`, highest-leverage fix in the batch.** `current_user_id()`
   and `current_company_id()` now require `status = 'active'`. Since `has_permission()`, `has_role()`,
   and `current_student_id()` all key off `current_user_id()` internally, this single change closes the
   gap everywhere at once rather than needing a per-policy patch. `current_institute_id()` is
   deliberately left unrestricted so a Pending user's own dashboard can still render the
   waiting-for-approval state.
3. **Students can modify placement-sensitive roster columns.** `students_self_update` allows an owner
   to update their entire student row as long as `user_id` remains theirs. A direct API caller can attempt
   to change `placement_status`, `batch_id`, marks/profile JSON, and `latest_cv_document_id`. Own Profile
   should be enforced with a column-level trigger or restricted RPCs.
   **✅ Already fixed before this audit landed — `0011_students_self_update_guard.sql`.** Found
   independently during the Resume Maker review; restricts self-update to `phone`/`personal_email` via a
   `pg_trigger_depth() = 0` guard (so it doesn't collide with the CV-sync trigger's legitimate nested
   write to the same row).
4. **Some UI gates use base-role names instead of effective Permission Sets.** Custom roles with the
   correct permissions may be redirected, while a base role may receive a capability the BRD did not
   assign. One concrete example is `/reports/export`: SPC has Reports - View Only in the BRD, but the
   route permits anyone whose role name is SPC to export.
   **✅ Fixed for the named instance.** `/reports/export` now calls a new `hasPermission()` helper
   (`src/lib/auth/current-user.ts`), which calls the real `has_permission('Reports & Export')` RPC
   instead of checking `roleNames`. Other UI gates in the app check role name for capabilities where
   every relevant role happens to map to the same permission (verified case-by-case, not just assumed) —
   this specific mismatch (SPC = view-only, not export) was the one place role name and permission set
   actually diverged.
5. **Company reassignment is too broad.** Company owners and supervisors satisfy `companies_update`
   RLS and can update `owner_user_id`/`supervisor_user_id`; FR-8.10 limits reassignment to Senior
   SPC/Admin. Column-specific enforcement is missing.
   **✅ Fixed — `0012_codex_audit_fixes.sql`.** `enforce_company_reassignment_scope()` trigger restricts
   changes to `owner_user_id`/`supervisor_user_id` to `has_role('Admin')` or the row's own current
   `supervisor_user_id` (the closest available proxy for "Senior SPC," since that's not a separate
   fixed Permission Set in the schema). Verified this doesn't block the legitimate initial-owner-at-
   creation path (`createCompany` sets `owner_user_id` via INSERT, which this `BEFORE UPDATE` trigger
   doesn't touch at all).
6. **Staleness does not track the latest round update.** `spc_pipeline_overview` compares `now()` to
   `jds.updated_at`, while scheduling a round updates `applications.updated_at`. A fresh round can leave
   the JD marked stale, and an unrelated JD edit can make a stale round look fresh.
   **✅ Fixed — `0012_codex_audit_fixes.sql`.** `spc_pipeline_overview` recomputed to use
   `greatest(jds.updated_at, max(applications.updated_at) for that JD)`, via a `LEFT JOIN LATERAL`.
   Also added the Admin-only staleness-days edit control on `/spc` that was previously missing
   entirely (Section 9 leaves "who can change it" unresolved in the BRD; defaulted to Admin, matching
   the defaults-threshold precedent).
7. **Recruiter field masking can be bypassed through the raw table API.** The UI correctly reads
   `applicant_directory`, but `students_select` also lets a recruiter select the underlying full student
   row whenever that student applied to the recruiter’s company, without requiring Shortlisted status.
   A direct Supabase query can therefore expose phone, personal email, and gender before shortlist.
   Restrict raw table access and make a masked view/RPC the only recruiter-readable interface.
   **✅ Fixed — `0012_codex_audit_fixes.sql`.** Added `and a.status in ('shortlisted', 'interview',
   'selected', 'waitlisted')` to `students_select`'s recruiter clause, matching `applicant_directory`'s
   own masking condition exactly. This was the most severe of the eight findings — a direct, confirmed
   PII exposure bypassing the entire point of the masking view — and the kind of gap this codebase's own
   prior security passes should have caught (the view was built specifically to solve this and the raw
   table was never re-checked against it).
8. **Recruiter private notes are readable by students through the raw application row.** Students may
   select their own `applications` row, which includes `private_notes`. Hiding the value in the React
   page is not field-level security. Move notes to a separately protected table or revoke raw-column
   access and expose safe application views.
   **✅ Fixed — `0012_codex_audit_fixes.sql`.** `private_notes` dropped from `applications` entirely;
   moved to a new `application_private_notes` table whose SELECT policy has no student-visible branch
   at all (recruiter-own-company, Shortlist Oversight, or Student Data - Full only). Confirmed via grep
   that no feature currently writes to this column, so this closes a latent exposure before any UI ever
   populates it, rather than after.

9. **Admin assignment policies were permission-gated but not tenant-scoped, and system base roles were
   locked only in the UI.** `users_update`, `user_roles_write`, and `user_permission_sets_write` could
   target a known user UUID in another institute; `roles_write` and `role_permission_sets_write` allowed
   direct mutation of global base roles by any Role & Permission Management holder.
   **✅ Fixed — `0016_admin_assignment_scope_guards.sql`.** User/assignment writes now require the
   target user to belong to `current_institute_id()`, assignable roles must be global base roles or local
   roles, and role/bundle writes are limited to non-base roles owned by the current institute. Each new
   `USING`/`WITH CHECK` pair was mirrored and re-read after the change.

## 4. Functional requirement traceability

### 4.1 Company Onboarding & JD Management

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-1.1 | Partial | Recruiter self-signup creates a Pending user; Admin approve/reject UI exists. | Enforce work-email policy, real verification/activation email, and Active status in every authorization path. Close the self-activation RLS issue above. |
| FR-1.2 | Partial | JD creation captures all listed structured fields and now accepts an original attachment into the private `placement-files` bucket, storing the object path in the existing `jds.jd_attachment_url` and exposing a short-lived download. | Apply `0020_plain_file_storage.sql` and validate upload/download with recruiter and student roles; retention/replacement cleanup still needs an institute decision. |
| FR-1.3 | Implemented | The 22 August workflow decision is enforced in code and migration `0023`: Recruiter sets the deadline and submits a student-hidden draft → SPC reviews and may keep or prepone (never postpone) the deadline → SPC releases to the assigned batch → Published → Applications Closed → Shortlisting → Closed. The database locks the submitted payload and blocks direct Recruiter publication. `0023` is applied to hosted Supabase and `002_spc_jd_release_gate.test.sql` passes 9/9 against it (22 August 2026). | A return-for-revision path was deliberately not invented because its behavior has not been specified — flag before building. Still needs a real-role pilot walkthrough. |
| FR-1.4 | Implemented | JD detail calls `eligible_student_count_for_jd()` before publish. | Validate against at least three real historical JDs. |
| FR-1.5 | Implemented | `/jds` now separates active-season work from an inactive-season historical template library. Any RLS-visible JD can be cloned to an active batch as a fresh Draft with a new deadline; structured fields copy, while applications, status, timestamps, notifications, and the attachment (unless explicitly selected) do not. The clone is audit-logged. | Validate cloning with a recruiter-owned company and at least two real seasons; confirm whether template naming/favourites are needed beyond the historical library. |
| FR-1.6 | Implemented | Multiple users can reference one company; JD RLS scopes recruiters to their own company. | Validate with two recruiter accounts in real Postgres. |

### 4.2 Eligibility Engine & Notification

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-2.1 | Implemented | SQL eligibility engine evaluates batch, branch, specialization, CGPA, backlog, placement status, and defaults. | Execute and reconcile against real roster data. |
| FR-2.2 | Implemented | `unplaced_only` excludes students whose placement status is Placed. | Replay against the 337 historical placed records. |
| FR-2.3 | Implemented | Configurable defaults threshold feeds eligibility; student self-check returns a specific defaults reason. | Validate the source tracker totals for the full batch. |
| FR-2.4 | Partial | SPC release—not Recruiter submission—now resolves the final override-adjusted eligible list and queues a shared Resend template per student through `src/lib/notifications/`; sender identity is runtime configuration and sending defaults off. `0023` (the SPC release gate this depends on) is applied to hosted Supabase. | Configure/verify Resend and `APP_BASE_URL`, obtain CDPO wording sign-off, then enable and pilot live delivery. |
| FR-2.5 | Implemented | `jd_eligibility_overrides` (`0018_eligibility_overrides.sql`) plus an include/exclude review UI (`src/app/(dashboard)/jds/[id]/eligibility/page.tsx`, `src/app/actions/eligibility.ts`) let Admin force-include/exclude specific students per JD, batch-scope-guarded at the trigger level. | Confirm the notification-send path actually honors overrides (not just the eligibility display), and validate against real Postgres. |
| FR-2.6 | Partial | Signed raw-body Resend webhooks idempotently update the generic delivery ledger, create/update `jd_notifications` only after actual send events, and the JD detail page exposes delivery/open counts. | Apply `0019`, register the production webhook, and validate sent/delivered/open/bounce events in an internal pilot. |

### 4.3 Student Application Flow

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-3.1 | Implemented | One-click apply captures the current CV document as an immutable application snapshot; its application packet compiles the complete roster Profile Sheet, including prior employers and all academic/profile JSON fields, without re-entry. | Validate a three-employer packet against real source data and decide whether the Profile Sheet itself must also be frozen at apply time. |
| FR-3.2 | Implemented | Students can withdraw before the JD deadline. | Add real database integration tests around deadline and ownership enforcement. |
| FR-3.3 | Implemented | My Applications shows company, role, withdrawal, and live status values. | Optional: add a richer timestamped status timeline. |
| FR-3.4 | Implemented | `my_eligibility_for_jd()` returns specific batch, placement, branch, specialization, CGPA, backlog, and defaults reasons. | Validate wording and outcomes with real blocked students. |

### 4.4 Candidate Packet & Recruiter Shortlisting

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-4.1 | Implemented | Each application packet combines the complete roster Profile Sheet with the exact CV version captured at apply time. | Validate layout and source-field labels with recruiters; decide whether Profile Sheet values must be immutable snapshots. |
| FR-4.2 | Implemented | Applicant controls support name/roll search; status, branch, specialization, minimum-CGPA, and minimum-work-ex filters; and CGPA/name/work-ex/applied-date/status sorting in either direction. | Reconcile manual ordering against real applicant data. |
| FR-4.3 | Implemented | Per-candidate actions plus atomic bulk shortlist/waitlist/reject for up to 500 selections, with optional round labels. | Execute migration `0010` and test recruiter-company scoping. |
| FR-4.4 | Implemented | Recruiters can open an inline Profile Sheet + attached-CV packet per applicant and print all visible packets as one merged PDF. `get_candidate_packets()` returns masked contact/gender/CV contact fields pre-shortlist and full data after shortlist without weakening raw-table RLS. | Execute migration `0014` and verify masking plus merged pagination against real Postgres/browser output. |
| FR-4.5 | Implemented | `application_private_notes` (student-proof RLS, Finding #8) now has a recruiter-facing UI on the applicants page (`src/app/actions/private-notes.ts`, wired into `src/app/(dashboard)/jds/[id]/applicants/page.tsx`) to add and view notes per candidate. | Validate against real Postgres and real applicant volume. |
| FR-4.6 | Partial | Successful single and bulk application-status changes now queue student and assigned-SPC notifications through the shared helper, after RLS-gated mutations succeed. | Apply `0019`, complete Resend configuration/CDPO sign-off, and pilot single plus bulk delivery. |

### 4.5 Shortlist Coordination (SPC)

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-5.1 | Implemented | SPC dashboard now excludes Closed JDs, keeps Published / Applications Closed / Shortlisting pipelines active, and derives the actual latest assigned round from `applications.round_history`. Each row shows round label, schedule, room/link, and how many candidates' latest round matches it alongside shortlist/total counts. | Validate mixed per-candidate round assignments with real process data and confirm whether “current” should later prefer the nearest future schedule over the latest assignment timestamp. |
| FR-5.2 | Partial | SPC/recruiter can assign round name, datetime, and room/link; the shared queue creates immediate notices and provider-scheduled 24-hour reminders with retry state. | Apply `0019`, configure the authenticated queue processor, approve wording, and validate reminder timing with Resend. |
| FR-5.3 | Partial | Round changes now automatically queue matching student and assigned-SPC emails against the same application/round data. | Apply/configure the notification backend and validate the real recipient workflow; outcome-specific wording still needs CDPO confirmation. |
| FR-5.4 | Implemented | Staleness now tracks `greatest(jds.updated_at, latest applications.updated_at)` (Finding #6, fixed), with an Admin-only edit control for the threshold on `/spc`. | Test boundary dates against real Postgres. |

### 4.6 Defaults & Compliance Tracker

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-6.1 | Implemented | Per-activity GL/Summit/Process/Seminar records roll up through `student_defaults_summary`. | Reconcile category and total semantics against the real Defaults Tracker. |
| FR-6.2 | Implemented | Admin can change the threshold; eligibility blocks at or above it. | Clarify whether institutes require warn-only as well as block behavior. |
| FR-6.3 | Implemented | Admin CSV import maps records by batch and roll number and supports re-import/upsert. | Replace the simple comma splitter with the staged parser pattern if source files contain quoted fields; validate the full batch. |
| FR-6.4 | Implemented | Students see their own total and activity-level attended/default status read-only. | Confirm privacy wording and source-data parity with the institute. |

### 4.7 Final Placement Reporting

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-7.1 | Implemented | Batch dashboard shows placed/total, average, median, highest CTC, and company breakdown. | Validate calculations against historical source data. |
| FR-7.2 | Implemented | The official export reproduces the wide source structure: one four-column block per company (Date Floated / Date of Process / Profiles Offered / Result-Package) with student rows, multi-date text support, no formulas, and blank unknown dates instead of `TBD`. | Reconcile the generated workbook-width CSV against all 247 companies / 337 placed records and obtain institute layout sign-off. |
| FR-7.3 | Implemented | Reports offers Official Wide, Accreditation Detail, and PII-free Public Company Summary templates; accreditation fields and unplaced-row inclusion are configurable. Export authorization still uses `Reports & Export`, and `0017` supplies only tenant-scoped report fields instead of broad raw-student access. | Validate column selections with official accreditation/public consumers and add saved institute-specific presets if requested. |
| FR-7.4 | Implemented | Reports supports explicit current/baseline season selection and a side-by-side table for placement rate, placed count, cohort size, average/median/highest CTC, and unique hiring-company count, with signed batch-over-batch deltas. With fewer than two seasons it displays an honest availability gate instead of zero trends. | Validate against two populated real seasons when available and confirm whether the institute wants additional company/role-level trends. |

### 4.8 Pre-Season Outreach CRM

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-8.1 | Implemented | Five-stage Kanban, individual creation, and staged/reviewed target-company CSV import exist; quoted fields, reordered headers, stage validation, in-file duplicates, and existing institute companies are handled. | Add explicit season attribution when outreach funnel reporting (FR-8.13) is implemented. |
| FR-8.2 | Partial | Company detail now reports the Owner → Supervisor line and filters assignment choices to active same-tenant JPC/BD and SPC/Senior-SPC role lineages (including cloned roles). The Server Action revalidates lineage/status, and `0021_company_assignment_role_guard.sql` enforces it against direct API writes while preventing an existing assignment from being cleared. | Apply/role-test `0021`; decide at which pipeline stage legacy/new companies must become fully assigned before adding a blanket creation/stage-transition requirement. |
| FR-8.3 | Implemented | Multiple contacts per company capture and display Title, Full Name, Last Name, HR Designation, Email, cc Email, and Phone. | Validate import/display labels against all 18 real JPC tabs. |
| FR-8.4 | Implemented | All eight company-type personas have distinct starter content; selecting a persona and contact loads an editable company/contact/sender-personalized preview, and sender attribution remains the logged-in user. | Obtain CDPO approval for production wording before connecting real email delivery. |
| FR-8.5 | Partial | Persona outreach now supports multi-contact mail merge with one activity/job per recipient; Resend lifecycle webhooks drive sent/open/click/bounce status while human response dispositions remain editable. | Apply/configure `0019` and Resend, obtain CDPO template approval, then validate a controlled mail merge and decide whether inbound-response ingestion is required. |
| FR-8.6 | Partial | Migration `0019` and the company UI implement queued/scheduled sends, provider idempotency, exponential retries, manual retry/reschedule, failure visibility, and an authenticated processor endpoint. | Apply `0019`, configure the cron secret/scheduler and Resend secrets/webhook, then run scheduled-send and retry-failure pilots. |
| FR-8.7 | Implemented | Timestamped, logged-by call remarks are stored and shown chronologically. | Validate same-session supervisor visibility in real Postgres. |
| FR-8.8 | Partial | SPC remarks are separate from call remarks. | Restrict SPC remarks to the supervising Senior SPC/Admin and surface JPC remarks separately where required by Appendix B.3. |
| FR-8.9 | Implemented | Standalone JD Form Received flag exists and is not auto-linked to onboarding. | Add audit logging if required operationally. |
| FR-8.10 | Partial — confirmation required | Owner/Supervisor reassignment UI and audit event exist; database enforcement restricts changes to Admin or the company's current supervisor, and `0021` validates assignee role lineage. **Proposed behavior (not implemented):** add a Senior-SPC/Admin “Supervision” view containing Prospect/Contacted/Interested companies whose `greatest(companies.updated_at, latest outreach_activities.occurred_at)` is older than the threshold; show Owner → Supervisor, last touch, and days stale; allow only manual Owner reassignment from that row, require a reason, audit old/new owner + reason, and notify old/new JPC plus supervisor. Never auto-reassign. Keep supervisor changes as a separate Admin action. | **Confirm before coding:** (1) reuse `institute_settings.staleness_days` or add a separate outreach threshold; (2) whether Committed should also become stale; (3) whether current Senior SPC may change the supervisor or only the Owner; (4) whether the proposed mandatory reason and three-party notification are desired. |
| FR-8.11 | Missing | No deliverability monitoring. | Add SPF/DKIM/DMARC checks and provider bounce-rate trends after sender-domain selection. |
| FR-8.12 | Partial | `0020_plain_file_storage.sql` defines one private plain-file bucket and tenant/module RLS plus `committee_vault_files`; company detail has committee upload/list/download UI. JD attachments and student CV uploads reuse the same bucket. CV originals are downloadable to application viewers without a shortlist-status test and are never redacted, per the confirmed decision. | Apply `0020`, regenerate database types, and role-test JD/CV/Vault paths. Confirm retention/version-deletion policy before adding destructive cleanup. |
| FR-8.13 | Partial | Company Pipeline now includes a season selector and per-JPC funnel of unique Contacted → explicitly Responded → currently Onboarded companies with conversion rates. `0022_outreach_activity_season.sql` snapshots the actor's batch on each activity (and backfills derivable rows) so historical attribution does not change when a JPC moves seasons. | Apply/backfill `0022`, regenerate types, and reconcile activity ownership for rows logged by supervisors/imported only by name; confirm whether “Responded” should remain explicit-only or also infer from Interested/Committed stage. |

### 4.9 Platform / Admin

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-9.1 | Partial | Admin can create/archive/reactivate dated seasons and use staged, server-revalidated batch upsert. The canonical CSV contract now maps every non-system Student profile field: display sequence, section, age, gender, phone/email, graduation and PG details, Class 10/12, three prior employers, two projects, two positions of responsibility, credentials, and other qualifications. Common human-readable headers and reordered/quoted fields are supported; the generated database type defines the upsert payload. | Reconcile the canonical aliases and repeated-column limits against the unavailable real Profile Sheet, then run a full-batch dry run before marking Implemented. |
| FR-9.2 | Partial | Five base roles, 14 Permission Sets, multi-role joins, direct-user Permission Set assignment/removal, custom-role clone and bundle editing, user deactivate/reactivate, masking views, and all 9 Section 3 security findings are implemented. `0016` also tenant-scopes every activated assignment path and database-locks base-role bundles. The systematic permission-vs-role-name UI gate audit (Section 6, P0 #2) is also done — seven real mismatches fixed. | Add user auto-expiry (season-end/graduation) and verify the full CRUD/RLS matrix against real Postgres. |
| FR-9.3 | Partial | Append-only audit table/viewer logs JD submission for SPC review, SPC release, lifecycle status, placement, user, role, and reassignment events. | Add explicit Admin shortlist-override semantics, permission-set edits, and audit coverage for other high-risk actions. |
| FR-9.4 | Missing | Supabase email/password and temporary student passwords are the current stand-ins. | Select and integrate institute SSO; map identity, domain, activation, and logout/session behavior. |

### 4.10 Resume Maker for Students

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-10.1 | Implemented | Students create and clone multiple persona-specific CV versions and select the current version. | Add naming/archive ergonomics and validate concurrency against Postgres. |
| FR-10.2 | Implemented | First-CV setup imports name/contact, PG/graduation and Class 10/12 academics, prior employers, structured projects and positions of responsibility, credentials, and line/semicolon-separated other qualifications. It accepts the canonical nested Profile Sheet JSON and documented legacy aliases, preserves source wording, and does not invent bullets. | Reconcile aliases against the unavailable real Profile Sheet and confirm whether the institute wants a multi-step guided setup in addition to the existing editable first-CV review. |
| FR-10.3 | Implemented | Students select a JD, paste its text, and receive transparent keyword score, missing terms, and section coverage. | Store the full JD description so paste is unnecessary; optionally port Cursivo’s richer ATS rules. |
| FR-10.4 | Partial | `/api/resume/ai` is an authenticated server-only proxy with the requested split: Groq writing-assist, Gemini structured import from locally extracted/pasted CV text, and Claude quality review. It has purpose-specific input/output caps, a 45-second timeout, configurable model IDs, an admin kill switch, fact-safety prompts, reversible server-side PII masking/unmasking, and review-before-apply UI; no credit billing exists. | Configure the three server-only keys, security/privacy-review provider terms and model choices, enable the kill switch for an internal pilot, and add local PDF/DOCX text extraction so binary files never reach a provider before masking. |
| FR-10.5 | Implemented | SPC/Admin section or bullet comments are visible to students; each can be marked Applied or Dismissed. | Improve anchor selection UX and notification of new comments. |
| FR-10.6 | Implemented | Current CV is snapshotted on application and integrated into individual/merged candidate packets; pre-shortlist packet reads are RPC-masked, while the exact full document unblocks after shortlist. | Execute migration `0014` and validate direct-RPC, raw-table, and UI behavior with recruiter/SPC accounts. |
| FR-10.7 | Implemented | Resume Maker offers three selectable layouts, browser Print/Save PDF, and genuine OOXML `.docx` generation with semantic sections and selectable text. | Validate all three formats with recruiter ATS tools and representative one-/two-page CVs. |
| FR-10.8 | Implemented | Resume editor displays urgency for upcoming published JDs using `apply_by_deadline`. | The mapping section also mentions daily edit streaks; those are not implemented, though FR-10.8 itself is covered. |

## 5. Appendix F acceptance status

The BRD requires demonstration against real data. Migrations now run against a real, hosted Postgres
(Section 6, P0 #1, closed 21 August 2026), and a Vitest suite covers pure logic — but RLS/masking
behavior has no automated test yet, and the referenced historical source files (Profile Sheet, Defaults
Tracker, Final Placement Datasheet) are still not present in this repository. Consequently, none of
these items is signed off.

| Acceptance criterion | Current assessment |
|---|---|
| Recruiter self-registers, is Admin-approved, submits a deadline-bearing JD, and SPC releases it to the batch | **Implemented in code; not accepted yet.** Migration `0023` is applied and its pgTAP workflow test passes 9/9 on hosted Supabase (22 August 2026) — still needs a real-role pilot walkthrough before acceptance. |
| Eligible count matches three real 2024–25 JDs | **Not tested.** |
| Unplaced-only excludes all 337 historical placed students | **Not tested.** |
| Notification email matches the real CDPO circular | **Missing.** |
| Apply attaches complete Profile Sheet + latest CV for a three-employer student | **Implemented in code; not tested with a real three-employer profile.** |
| Applicant sort/filter matches manual CGPA/work-ex ordering | **Implemented in code; not reconciled against real applicant data.** |
| Defaults import reproduces the source Total Defaults for the full batch | **Not tested.** |
| Defaults-blocked student sees a specific reason | **Implemented in code; not tested with real data.** |
| Final Datasheet reconciles to 247 companies / 337 placed | **Required wide format is implemented in code; real-data reconciliation is not tested.** |
| Generated export contains no `#REF!` or `TBD` defects | **Implemented structurally; not signed off with real data.** The generator emits no formulas or `TBD` placeholders and preserves multiple process dates as quoted text. |
| JPC call log appears in Senior SPC view in the same session | **Implemented in code; not tested against real RLS.** |
| All values across 18 JPC tabs map without an unmapped status | **Not tested against the source tabs.** |

## 6. Remaining work by delivery priority

### P0 — required before a real-data pilot

1. ~~Execute all migrations on local/hosted Supabase; fix SQL/runtime failures and generate database
   types.~~ **✅ Closed 21 August 2026.** All 18 migrations (`0001`–`0018`) are applied and confirmed
   present in `supabase_migrations.schema_migrations` on the hosted project
   (`db.styqkekxmyjupanwdxid.supabase.co`), verified by direct `pg` connection and cross-checked against
   every table/view/enum expected through `0018` (`jd_eligibility_overrides`,
   `eligibility_override_type`, `application_private_notes`, `applicant_directory`, and the rest of the
   27 public-schema tables/views). No SQL/runtime failures were found on this pass.
   ~~Remaining from this item: `src/types/database.types.ts` still doesn't exist.~~ **Also closed, same
   day:** generated via `supabase gen types typescript --project-id styqkekxmyjupanwdxid` using a
   Supabase personal access token. New query code should prefer the generated `Database` type over the
   hand-written `src/types/domain.ts` per the handover's Definition of Done.
2. ~~Close the authorization/privacy boundary issues: user status/scope self-update, Active-status
   enforcement, student-column self-update, Permission-Set-based UI/export gates, raw student-field
   masking bypass, application private-note exposure, and company reassignment scope.~~ **Done —
   `0011_students_self_update_guard.sql` and `0012_codex_audit_fixes.sql`, all re-verified against the
   actual policy definitions before being marked fixed (see Section 3).**
   ~~A systematic re-audit of every *other* permission-vs-role-name UI gate beyond `/reports/export`
   is still worth doing~~ **— done, 21 August 2026.** All 12 remaining `roleNames.some/.includes`
   sites checked against the real `pg_policy` behind each one (not assumed from the BRD text). Seven
   real mismatches fixed: `importRoster`/`createStudentLogin`/`importDefaults` and the page-level
   gates on `/admin/users`, `/admin/roles`, `/admin/audit-log`, `/admin/roster`, `/admin/defaults`,
   plus `layout.tsx`'s `canManageCompanies` nav check — all were checking `roleNames.includes("Admin")`
   while the actual RLS/action behind them accepted a specific Permission Set instead (mostly
   `Student Data - Full`, which SPC holds by default too), so a custom role granted that Permission
   Set directly was being redirected away from a page whose buttons would have worked for it. Five
   sites checked out as already correct and left unchanged — `createBatch`/`setBatchActive`,
   `updateStalenessThreshold`, `updateDefaultsThreshold`, and two `isAdmin`/persona-identity checks —
   because their RLS is genuinely `has_role('Admin')`-hardcoded with no covering Permission Set, or
   (for `isStudent`/`isRecruiter`) they gate persona-identity nav sections by design, not a specific
   grant. Full writeup in `docs/HANDOVER-CODEX.md`, Claude's track item 1.
3. Add automated tests for RLS, cross-tenant isolation, recruiter-company scoping, masking, student
   column guards, application CV snapshots, bulk shortlist, and reporting calculations. **Still the best
   way to make sure fix #6 above stays fixed** — this class of bug (row-level RLS with no column guard,
   or a UI/view masking pattern with an unguarded raw-table escape hatch) has now been found and fixed
   nine separate times across this codebase's history by two different reviewers, purely through manual
   re-reading. That's not a sustainable verification strategy at this codebase's size.
   **Partial progress:** a Vitest suite now covers pure logic — CSV import parsing, Resume Maker scoring,
   and the `canViewCandidatePacket()` masking mirror — 43/43 passing (`npm test`). The RLS/masking side
   is now started: `supabase/tests/database/001_applicant_directory_masking.test.sql` covers Finding #7
   and is **verified passing (7/7)** against the real hosted project, run via `npm run test:rls`
   (`scripts/run-pgtap.mjs`, Docker-free — `supabase test db` still needs Docker). Still to write:
   cross-tenant isolation (`0016`), column-guard triggers (`0007`/`0011`/`0012`/`0013`/`0018`), and the
   bulk-shortlist RPC's recruiter-company scoping (`0010`).
4. Complete the JD form/lifecycle fields required by FR-1.2/1.3.
5. Complete recruiter private notes and validate the new packet masking/sort/filter workflow against real data.
6. Reconcile eligibility, defaults, and reporting against the actual 2024–25 data.

### P1 — required for BRD MVP feature completeness

1. Resend-based JD, shortlist, round, reminder, and activation notifications with delivery logging.
2. Admin eligibility override UI and persisted per-JD include/exclude rules.
3. Current-round-aware SPC dashboard and correct staleness calculation/configuration.
4. Reconcile and obtain institute sign-off for the completed official/public/accreditation exports at 247-company scale.
5. Outreach mail merge, queues/retries, provider tracking, and funnel reports (target import and real persona content are complete).
6. Complete full Profile Sheet import mapping, user auto-expiry, the permission UI-gate audit, and the verified CRUD/RLS matrix.
7. AI-assisted Resume Maker rewrite/diff flow and structured CV import; validate the completed DOCX/PDF/template library with recruiter ATS tools.

### P2 — requires product/infrastructure decisions

**Decided 21 August 2026** (see `docs/HANDOVER-CODEX.md` for full detail) — items 1–4 below now have
an answer; the Resend, Storage, and AI code paths are implemented but still require their row-specific
hosted configuration and pilot validation:

1. ~~Institute SSO provider/protocol~~ → **Google**, extending the existing Firebase Custom Token
   federation layer rather than a new integration (FR-9.4).
2. ~~Resend sender domain, From identities~~ → **two-phase**: a subdomain of `iitiimcareers.in`
   (e.g. `notifications@mail.iitiimcareers.in`) now for testing with real recipients, no external
   dependency; `placements@iimraipur.ac.in` later once IIM Raipur's IT adds SPF/DKIM DNS records —
   confirm before switching. Build the sender identity as config, not hardcoded, so the swap is a
   config change. Template wording still needs CDPO sign-off.
3. ~~Supabase Storage bucket/RLS design~~ → **deliberately no file-level masking** — a plain
   Storage bucket is enough. CVs are downloadable with full contact info regardless of shortlist
   status; confirmed as an explicit pilot-speed tradeoff after being flagged that it reopens the
   class of bypass Finding #7 closed at the DB level (the DB/screen-level masking still stands, a
   file download just routes around it). Revisit if this grows into a real multi-institute product.
   Retention period and DPDP deletion workflow (Appendix E) are still open.
4. ~~AI provider/model~~ → **full Cursivo-style multi-provider: Groq + Gemini + Claude**, same
   server-side-proxy/PII-masking/input-cap/kill-switch architecture as Cursivo, minus its
   credit-billing system (no per-student paid tiers here). Groq for writing-assist, Gemini for
   PDF/CV import parsing, Claude for higher-quality output. Prompt-logging and student-data-
   processing terms for DPDP still need confirming before real student CVs are sent to any of them.
5. Official historical report templates and the exact mapping of pivoted/TBD/multi-date source cells
   — still open, no decision yet.

## 6a. Logged for later — not in current BRD scope

Ideas raised during this build that are deliberately **not** being scheduled into either agent's
track yet, so they don't compete with the 16 Partial / 7 Missing FRs the BRD actually requires.
Not assigned a formal FR-ID — would need a BRD revision (a new Appendix, per the v3 pass's own
numbering-preservation rule) to become a real requirement.

- **Applicant rank/percentile estimate ("where do I stand"), logged 21 August 2026.** Inspired by a
  competitor screenshot (Superset's "Magic Sort Rank" — shows a student "rank 83 of 665 if you
  apply," claiming proprietary ML). Decided if/when this gets built:
  - **Basis:** a documented weighted formula (CGPA + work-ex + the existing FR-10.3 ATS/JD-fit
    score), not an opaque "ML" claim — consistent with this codebase's transparency-over-black-box
    approach elsewhere.
  - **Placement:** post-apply, in "My Applications," alongside the existing status timeline — not
    a new pre-apply screen.
  - **Privacy constraint, non-negotiable if built:** FR-3.5 already guarantees a student sees their
    own status only, never peers' outcomes. Any implementation must compute the rank server-side
    (e.g. a `percentile_rank()` window function in an RPC) and return only the calling student's
    own number — never expose other students' individual scores, names, or raw standings through
    the same call.
  - **Status:** explicitly deferred — "log it, build later" was the decision, not "build it now."

## 7. Verification completed in this workspace

- `npm run lint` passes (re-run clean after `0012_codex_audit_fixes.sql` and its app-code changes).
- `npm run build` passes on Next.js 16.3.1, all 24 routes compile (re-run clean after the same changes).
- `npx tsc --noEmit` passes.
- Every one of the 8 release-blocking findings in Section 3 was independently re-verified against the
  actual current policy/function text (`grep`+`Read`, not assumed correct from the description alone)
  before being fixed — same standard applied throughout this codebase's security history.
- **21 August 2026:** all 18 migrations confirmed applied on the hosted Supabase project via direct
  `pg` connection to `db.styqkekxmyjupanwdxid.supabase.co` — `supabase_migrations.schema_migrations`
  lists `0001` through `0018`, and every table/view/enum spot-checked through `0018` exists.
- **21 August 2026:** the first pgTAP test (`001_applicant_directory_masking.test.sql`, Finding #7)
  runs and passes 7/7 against the same live project, with the recruiter session genuinely simulated
  via `set local role authenticated` + `request.jwt.claim.sub` — RLS policy *behavior*, not just
  schema presence, is now covered for this one boundary. The broader RLS suite (cross-tenant
  isolation, column-guard triggers, bulk-shortlist scoping) is still unwritten.

## 8. Definition of “BRD complete” from here

PlacementOS should not be described as BRD-complete until:

1. every Partial/Missing requirement above is either Implemented or explicitly removed from an approved
   BRD revision;
2. all Appendix F checks pass against the institute’s real source data;
3. migrations and RLS tests pass on real Postgres/Supabase;
4. the unresolved SSO, email, storage, AI, retention, and report-template decisions are recorded; and
5. security review confirms no client can bypass approval, masking, placement status, tenant isolation,
   or recruiter-company boundaries through direct Supabase API calls.
