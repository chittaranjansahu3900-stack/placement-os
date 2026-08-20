# PlacementOS BRD Implementation Status

**Assessment date:** 20 August 2026 (Codex); fixes verified and applied same day (Claude)  
**Requirements source:** `docs/PlacementOS_BRD_v3.pdf`  
**Code assessed:** current PlacementOS workspace through migration `0017_placement_export_dataset.sql`
(Codex's original assessment); **all original release-blocking findings below were
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
| Implemented in code | 32 | 54% |
| Partial | 19 | 32% |
| Missing | 8 | 14% |
| **Total functional requirements** | **59** | **100%** |

(FR-3.1, FR-4.1, FR-4.2, FR-4.4, and FR-10.6 moved after the candidate-packet workflow;
FR-8.1/8.3/8.4 after Outreach completion; FR-10.7 after DOCX/templates; and FR-7.2/7.3 after
templated wide exports. FR-5.4 had already moved after Finding #6's fix. The security findings in
Section 3 were authorization/security corrections, not new feature completions — fixing them closed
real bypasses but didn't complete missing UI/workflow pieces, so most other FR statuses are unchanged
even though the underlying risk is lower. See each row's updated "Remaining work" for what's actually left.)

All ten Section 4 modules now have at least a baseline surface. The strongest areas are Defaults &
Compliance, the eligibility core, student self-service, and the basic placement dashboard. The largest
remaining gaps are email/notification delivery, full JD lifecycle and fields,
historical report comparison, production outreach sending, SSO, and the remaining Cursivo-grade Resume
Maker capabilities.

These counts describe code coverage, not pilot acceptance. No Appendix F acceptance criterion has yet
been demonstrated against the real 2024–25 source data, and migrations have not been executed against
a real Postgres/Supabase environment.

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
| FR-1.2 | Partial | JD creation captures title, fixed/variable/derived total CTC, locations, branch, batch, min CGPA, unplaced-only, and deadline. | Add grade, eligible specializations, maximum backlog, open positions, explicit total CTC handling, and JD attachment/storage. |
| FR-1.3 | Partial | Draft and Published states are usable. | Add optional Admin approval and transitions for Applications Closed, Shortlisting, Closed, plus valid-transition enforcement. |
| FR-1.4 | Implemented | JD detail calls `eligible_student_count_for_jd()` before publish. | Validate against at least three real historical JDs. |
| FR-1.5 | Partial | Recruiters can see their RLS-scoped JD list, including older records. | Add “Clone JD” and a season-aware history/template workflow. |
| FR-1.6 | Implemented | Multiple users can reference one company; JD RLS scopes recruiters to their own company. | Validate with two recruiter accounts in real Postgres. |

### 4.2 Eligibility Engine & Notification

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-2.1 | Implemented | SQL eligibility engine evaluates batch, branch, specialization, CGPA, backlog, placement status, and defaults. | Execute and reconcile against real roster data. |
| FR-2.2 | Implemented | `unplaced_only` excludes students whose placement status is Placed. | Replay against the 337 historical placed records. |
| FR-2.3 | Implemented | Configurable defaults threshold feeds eligibility; student self-check returns a specific defaults reason. | Validate the source tracker totals for the full batch. |
| FR-2.4 | Missing | No notification sender or CDPO mailer template is wired. | Configure Resend/sender domain, build the mailer template, and send on publish. |
| FR-2.5 | Missing | An Admin-only eligible-list SQL function exists, but there is no override model or UI. | Add per-JD include/exclude overrides, review UI, and make the final send/apply eligibility honor them. |
| FR-2.6 | Partial | `jd_notifications` schema stores sent/opened timestamps. | Write delivery rows, connect provider webhooks/open tracking, and expose delivery status. |

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
| FR-4.5 | Partial | `application_private_notes` exists as its own table with a student-proof RLS policy (Finding #8, fixed). | No UI yet to add or view notes — schema/security foundation is now correct, the recruiter-facing mutation/display isn't built. |
| FR-4.6 | Missing | Status changes update the shared database only. | Notify affected students and assigned SPC after single or bulk shortlist submission. |

### 4.5 Shortlist Coordination (SPC)

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-5.1 | Partial | SPC dashboard lists visible JDs with shortlist and total-application counts. | Show the actual current round; define “active” consistently and exclude closed records as appropriate. |
| FR-5.2 | Partial | SPC/recruiter can assign round name, datetime, and room/link. | Add reminder nudges and delivery logging. |
| FR-5.3 | Partial | Recruiter and SPC operate on the same application/round data. | Add automatic student and SPC notifications for round outcomes. |
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
| FR-7.4 | Missing | Admin can switch which single batch is viewed. | Add side-by-side historical comparisons and trend metrics once multiple seasons are available. |

### 4.8 Pre-Season Outreach CRM

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-8.1 | Implemented | Five-stage Kanban, individual creation, and staged/reviewed target-company CSV import exist; quoted fields, reordered headers, stage validation, in-file duplicates, and existing institute companies are handled. | Add explicit season attribution when outreach funnel reporting (FR-8.13) is implemented. |
| FR-8.2 | Partial | Owner and Supervisor fields and assignment UI exist. | Require valid JPC/Senior-SPC role choices, derive/report the supervisory line, and prevent unassigned companies where the BRD requires an owner. |
| FR-8.3 | Implemented | Multiple contacts per company capture and display Title, Full Name, Last Name, HR Designation, Email, cc Email, and Phone. | Validate import/display labels against all 18 real JPC tabs. |
| FR-8.4 | Implemented | All eight company-type personas have distinct starter content; selecting a persona and contact loads an editable company/contact/sender-personalized preview, and sender attribution remains the logged-in user. | Obtain CDPO approval for production wording before connecting real email delivery. |
| FR-8.5 | Partial | All required disposition enums can be logged and manually changed. | Implement actual mail merge, one activity per recipient, provider-driven sent/open/click/bounce updates, and response handling. |
| FR-8.6 | Missing | No queue or schedule model/UI. | Add scheduled sends, retries, rescheduling, idempotency, and failure visibility. |
| FR-8.7 | Implemented | Timestamped, logged-by call remarks are stored and shown chronologically. | Validate same-session supervisor visibility in real Postgres. |
| FR-8.8 | Partial | SPC remarks are separate from call remarks. | Restrict SPC remarks to the supervising Senior SPC/Admin and surface JPC remarks separately where required by Appendix B.3. |
| FR-8.9 | Implemented | Standalone JD Form Received flag exists and is not auto-linked to onboarding. | Add audit logging if required operationally. |
| FR-8.10 | Partial | Owner/Supervisor reassignment UI and audit event exist; database-level enforcement now restricts changing either column to Admin or the company's current supervisor (Finding #5, fixed). | "Tie it to staleness/supervision views" — the original note's intent here isn't concretely specified enough to build against; needs a decision on what that should actually mean before implementation. |
| FR-8.11 | Missing | No deliverability monitoring. | Add SPF/DKIM/DMARC checks and provider bounce-rate trends after sender-domain selection. |
| FR-8.12 | Missing | No Placement Committee Vault or storage policies. | Decide retention/read rules, create Supabase Storage buckets/RLS, and add attachment selection in outreach. |
| FR-8.13 | Partial | Kanban columns display overall stage counts. | Add contacted→responded→onboarded reporting per JPC and season. |

### 4.9 Platform / Admin

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-9.1 | Partial | Admin can create/archive/reactivate dated batch/seasons, then use staged roster preview/validation and confirmed batch-scoped upsert. | Map the complete real Profile Sheet CSV, including prior employers, 10th/12th, credentials, and other qualifications. |
| FR-9.2 | Partial | Five base roles, 14 Permission Sets, multi-role joins, direct-user Permission Set assignment/removal, custom-role clone and bundle editing, user deactivate/reactivate, masking views, and all 9 Section 3 security findings are implemented. `0016` also tenant-scopes every activated assignment path and database-locks base-role bundles. | Complete the systematic permission-vs-role-name UI gate audit, add auto-expiry, and verify the full CRUD/RLS matrix against real Postgres. |
| FR-9.3 | Partial | Append-only audit table/viewer logs publish, status, placement, user, role, and reassignment events. | Add missing JD approval events, explicit Admin shortlist-override semantics, permission-set edits, and audit coverage for other high-risk actions. |
| FR-9.4 | Missing | Supabase email/password and temporary student passwords are the current stand-ins. | Select and integrate institute SSO; map identity, domain, activation, and logout/session behavior. |

### 4.10 Resume Maker for Students

| ID | Status | What exists | Remaining work |
|---|---|---|---|
| FR-10.1 | Implemented | Students create and clone multiple persona-specific CV versions and select the current version. | Add naming/archive ergonomics and validate concurrency against Postgres. |
| FR-10.2 | Partial | First CV imports name/contact, PG/graduation, prior employers, and credentials when those fields exist. | Import 10th/12th, positions/projects/other qualifications and the complete Profile Sheet; add guided setup/import. |
| FR-10.3 | Implemented | Students select a JD, paste its text, and receive transparent keyword score, missing terms, and section coverage. | Store the full JD description so paste is unnecessary; optionally port Cursivo’s richer ATS rules. |
| FR-10.4 | Partial | Fact-safe action/outcome/metric composer creates a draft without inventing supplied facts. | Connect an approved AI provider, add bullet rewrite/diff/apply flow, and enforce prompt/output privacy and fact guards. |
| FR-10.5 | Implemented | SPC/Admin section or bullet comments are visible to students; each can be marked Applied or Dismissed. | Improve anchor selection UX and notification of new comments. |
| FR-10.6 | Implemented | Current CV is snapshotted on application and integrated into individual/merged candidate packets; pre-shortlist packet reads are RPC-masked, while the exact full document unblocks after shortlist. | Execute migration `0014` and validate direct-RPC, raw-table, and UI behavior with recruiter/SPC accounts. |
| FR-10.7 | Implemented | Resume Maker offers three selectable layouts, browser Print/Save PDF, and genuine OOXML `.docx` generation with semantic sections and selectable text. | Validate all three formats with recruiter ATS tools and representative one-/two-page CVs. |
| FR-10.8 | Implemented | Resume editor displays urgency for upcoming published JDs using `apply_by_deadline`. | The mapping section also mentions daily edit streaks; those are not implemented, though FR-10.8 itself is covered. |

## 5. Appendix F acceptance status

The BRD requires demonstration against real data. The current repository contains no automated tests,
the migrations have never run against real Postgres, and the referenced historical source files are not
present in this repository. Consequently, none of these items is signed off.

| Acceptance criterion | Current assessment |
|---|---|
| Recruiter self-registers, is Admin-approved, and publishes without CDPO editing | **Not accepted.** UI path exists, but Pending/Active enforcement has authorization gaps. |
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

1. Execute all migrations on local/hosted Supabase; fix SQL/runtime failures and generate database types.
   **This is now the single largest remaining risk.** Every fix in this document — Codex's original
   eight findings and everything before them — has been hand-reviewed only; none of it, including the
   fixes themselves, has run against a real Postgres. `0012_codex_audit_fixes.sql`'s triggers and the
   `LEFT JOIN LATERAL` in particular need to be watched closely on first apply.
2. ~~Close the authorization/privacy boundary issues: user status/scope self-update, Active-status
   enforcement, student-column self-update, Permission-Set-based UI/export gates, raw student-field
   masking bypass, application private-note exposure, and company reassignment scope.~~ **Done —
   `0011_students_self_update_guard.sql` and `0012_codex_audit_fixes.sql`, all re-verified against the
   actual policy definitions before being marked fixed (see Section 3).** A systematic re-audit of every
   *other* permission-vs-role-name UI gate beyond `/reports/export` is still worth doing — only the one
   Codex specifically flagged was checked here.
3. Add automated tests for RLS, cross-tenant isolation, recruiter-company scoping, masking, student
   column guards, application CV snapshots, bulk shortlist, and reporting calculations. **Still the best
   way to make sure fix #6 above stays fixed** — this class of bug (row-level RLS with no column guard,
   or a UI/view masking pattern with an unguarded raw-table escape hatch) has now been found and fixed
   nine separate times across this codebase's history by two different reviewers, purely through manual
   re-reading. That's not a sustainable verification strategy at this codebase's size.
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

1. Institute SSO provider/protocol and domain/identity mapping.
2. Resend sender domain, From identities, templates, and tracking policy.
3. Supabase Storage bucket/RLS design, CV/vault retention period, and DPDP deletion workflow.
4. AI provider/model, student-data processing terms, prompt logging, and usage controls.
5. Official historical report templates and the exact mapping of pivoted/TBD/multi-date source cells.

## 7. Verification completed in this workspace

- `npm run lint` passes (re-run clean after `0012_codex_audit_fixes.sql` and its app-code changes).
- `npm run build` passes on Next.js 16.3.1, all 24 routes compile (re-run clean after the same changes).
- `npx tsc --noEmit` passes.
- Every one of the 8 release-blocking findings in Section 3 was independently re-verified against the
  actual current policy/function text (`grep`+`Read`, not assumed correct from the description alone)
  before being fixed — same standard applied throughout this codebase's security history.
- RLS and migrations were manually reviewed only — **still not executed against a real Postgres,
  including the fixes themselves.** This remains the top P0 item (Section 6).

## 8. Definition of “BRD complete” from here

PlacementOS should not be described as BRD-complete until:

1. every Partial/Missing requirement above is either Implemented or explicitly removed from an approved
   BRD revision;
2. all Appendix F checks pass against the institute’s real source data;
3. migrations and RLS tests pass on real Postgres/Supabase;
4. the unresolved SSO, email, storage, AI, retention, and report-template decisions are recorded; and
5. security review confirms no client can bypass approval, masking, placement status, tenant isolation,
   or recruiter-company boundaries through direct Supabase API calls.
