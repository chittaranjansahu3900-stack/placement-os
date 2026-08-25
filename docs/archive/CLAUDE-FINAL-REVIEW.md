# Claude Final Review — PlacementOS, 22 August 2026

Senior security/UX/release-readiness review of Gemini's completed premium UI pass, working in the
shared tree alongside Codex. Scope: Phase 1 (database/security handoff completion), Phase 2 (UI
review across all listed routes), Phase 3 (deliverability foundation review). This document is the
findings register; `docs/AGENT-SYNC.md` carries the handoff narrative and file list.

**Overall assessment: the codebase is in materially good shape.** The critical JD-release workflow
is implemented correctly end-to-end — in the UI, not just the database — and every permission gate I
audited two sessions ago survived Gemini's visual pass completely intact. No Blocker-severity finding
came out of this review. The two most severe items (applicant-masking omission, no Kanban
drag-and-drop) were already honestly disclosed with ⚠️ markers in `docs/screenshots/manifest.md`
before I started — I independently verified both are accurate, not new discoveries.

## Blocker

None found in this pass.

## High

### H1 — Admin/Users role-assignment `<select>` defaults to "Admin"

- **Route/component:** `/admin/users`, `src/app/(dashboard)/admin/users/page.tsx:192-201`.
- **Current problem:** `availableRoles` (roles the target user doesn't already hold) is rendered
  into a plain `<select>` with no placeholder option. A browser auto-selects the first `<option>`.
  Since `roles` is queried `.order("name")` and "Admin" sorts first alphabetically among
  {Admin, BD, Recruiter, SPC, Student}, the dropdown defaults to **Admin** for almost every user row
  that doesn't already hold it — confirmed against the `23-admin-users.png` screenshot, where rows
  for a Student, a Recruiter, a BD, and an SPC user all show "Admin" pre-selected next to their
  "+ Assign" button. Clicking "+ Assign" without deliberately changing the dropdown grants the most
  privileged role in the system to that user.
- **Why High, not Blocker:** `assignRole` is gated behind `requirePermission("User Management")` —
  confirmed in `src/app/actions/admin.ts:65` — so this can't be triggered by an unauthorized caller.
  It's a dangerous *default*, not a broken *boundary*. Still High because the actual consequence
  (accidental Admin grant) is severe, the trigger is a single unmodified click, and it will happen
  on essentially every row where the operator doesn't specifically notice and change the dropdown.
- **Recommended behavior:** Add a disabled, unselected placeholder as the first `<option>` (e.g.
  `<option value="" disabled selected>Select role…</option>`) so no role is granted unless
  deliberately chosen. Do not silently reorder `availableRoles` as the fix — an explicit placeholder
  is safer and clearer than relying on sort order.
- **Acceptance criterion:** On `/admin/users`, for a user holding zero or one role, the "+ Assign"
  role dropdown's default state has no role selected; submitting without an explicit selection
  either does nothing or is rejected server-side, never silently assigns a role.
- **Not fixed in this pass** — `admin/users/page.tsx` is inside Gemini's active JSX-ownership scope
  per `docs/AGENT-SYNC.md`; flagged for integration rather than edited directly, consistent with the
  working boundary for this review.

## Medium

### M1 — Dashboard header season badge is a hardcoded string

- **Route/component:** All dashboard pages, `src/app/(dashboard)/layout.tsx:102` (
  `<span>2024–26 Placement Season</span>`).
- **Current problem:** The header's "active season" indicator (with an animated live-status dot) is
  literal JSX text, not derived from `ctx` or any batch query. It happens to match the seeded
  `PGP 2024-26` batch in every screenshot, but nothing keeps it in sync with the institute's actual
  active batch — if a real institute activates a differently-named or later season, the header would
  silently keep claiming "2024–26."
- **Recommended behavior:** Query the institute's active batch (`batches` where `is_active = true`)
  and render its real name, or omit the badge if none is active, matching the honest-empty-state
  pattern used elsewhere in this codebase (e.g. `/reports`' "fewer than two seasons" gate).
- **Acceptance criterion:** Activating a differently-named batch changes the header text on next
  render without a code change.
- **Not fixed here** — same file (`(dashboard)/layout.tsx`) as H1's neighbor; a data-fetching change
  to a file in active shared use, flagged for integration.

### M2 — `12a-masked.png` (verified, not new — tracking only)

- **Route/component:** `docs/screenshots/12a-masked.png`, manifest row 19.
- **Current problem:** Confirmed by direct pixel comparison against `12-applicants-recruiter.png`:
  identical data, all four candidates already past shortlist stage, full contact info visible. It
  cannot depict a genuine masked-but-present pre-shortlist row because Finding #10
  (`docs/BRD-IMPLEMENTATION-STATUS.md` Section 3) means no such row currently renders at all.
- **Status:** Already honestly disclosed — manifest row 19 carries
  `⚠️ no masked pre-shortlist row is rendered for a standard Recruiter account`. No corrective action
  needed beyond what's already recorded. Regenerate this screenshot only after
  `docs/APPLICANT-MASKING-FIX-PROPOSAL.md` is implemented — a real masked row will exist to capture.
- **Acceptance criterion:** Once the masking fix lands, recapture `12a-masked.png` against a
  genuinely pre-shortlist application and remove the manifest caveat.

### M3 — `14b-kanban-drag.png` filename implies unsupported drag-and-drop (verified, not new)

- **Route/component:** `docs/screenshots/14b-kanban-drag.png`, manifest row 24; `/companies`.
- **Current problem:** Confirmed via `grep -r "draggable|dragstart|dragover|ondrop" src/` — zero
  matches anywhere in the codebase. Stage changes happen by opening a company's detail page
  (`/companies/[id]`), not by dragging cards on the board. The filename itself (not just a viewer's
  assumption) names a capability that doesn't exist.
- **Status:** Already honestly disclosed — manifest row 24 carries
  `⚠️ requested drag/stage-change affordance is not implemented on /companies`. No corrective action
  needed on the image; consider renaming the file itself (e.g. `14b-kanban-hover.png`) next time
  screenshots are regenerated, so the filename doesn't need a caveat to be accurate.

## Polish

### P1 — Duplicated name rendering on company contact

- **Route/component:** `/companies/[id]`, contact directory card (`15-company-detail.png`): "Ms.
  Meera Krishnan **Krishnan**".
- **Likely cause:** Seed data has `full_name` already containing the surname, and the display
  concatenates `full_name` + `last_name` again. Low priority — affects only demo-seeded records
  (labeled or attributable to `(Screenshot Demo)`-style seed data elsewhere), not a security or
  workflow issue. Worth a one-line display-logic check next time someone is in that component, not
  urgent enough to justify touching Gemini's active surface for.

### P2 — Login form fields lack the asterisk convention used on signup

- **Route/component:** `/login` vs `/signup` (`01-login.png`, `02-signup.png`).
- **Observation:** Signup consistently marks required fields with `*`; login doesn't, though both
  its fields are obviously required (email + password, nothing else on the form). Cosmetic
  consistency only — not confusing in practice given the form's simplicity.

## Verified correct (evidence, not just "looks fine")

Recording what was explicitly checked and held up, since a review that only lists defects
under-reports the actual state of the codebase:

- **Permission-gate integrity across the entire visual pass.** Every `permissionNames`/`roleNames`
  check from the prior session's role-name audit (`canManageCompanies`, `canPostJd`,
  `canSeeSpcDashboard`, `canSeeReports`, `canReviewCvs`, `canManageUsers`, `canManageRoles`,
  `canViewAuditLog`, `canImportRoster`, `canSeeDefaultsAdmin`, and the JD-release-specific
  `canSubmitForReview`/`canReleaseToBatch`/`canManageEligibility` in `jds/[id]/page.tsx`) is present,
  unchanged, and correctly wired into the new `DashboardNav` component. Gemini's redesign touched
  presentation only, never the authorization logic underneath it.
- **JD-release workflow, UI layer:** confirmed no "Publish to Students" action exists anywhere for a
  Recruiter (`NEXT_STATUSES` in `jds/[id]/page.tsx` has no entry keyed on `draft`); a submitted,
  unreleased JD shows "Pending SPC review" (`StatusBadge`, amber, icon + text — not color-only) and
  an explicit "Students cannot see or apply to this opportunity yet" banner; the SPC release queue
  (`/spc`) shows company, role, target batch, recruiter deadline, and submission timestamp per row,
  exactly as required; the deadline `<input type="datetime-local">` carries a real `max` attribute
  pinned to the recruiter's original deadline, enforcing "keep or prepone, never postpone" at the UX
  layer in addition to the database trigger; release feedback (`releaseJdToBatch` in
  `src/app/actions/jds.ts`) distinguishes sent/blocked/failed notification counts in its notice text.
- **AI feature honesty:** `resume-ai-assistant.tsx`'s buttons are real, wired controls (not fake
  affordances) that call `/api/resume/ai`; when `RESUME_AI_ENABLED` is off, the route returns a real
  503 with a clear message, which the component surfaces as a visible error — no fake success, no
  silent no-op.
- **Responsive handling on the widest table:** the applicants matrix (`jds/[id]/applicants/page.tsx`)
  wraps its table in `overflow-x-auto` on its own container, not the page body — the correct pattern
  for a 7+ column table at narrow viewports. (Note: no 390px/1024px screenshots exist to visually
  confirm every route — this was verified by source inspection, not a live capture. See "Not
  independently verified" below.)
- **Demo data is transparently labeled, not disguised.** Every screenshot-seeded record uses names
  like "(Screenshot Demo)" visibly in the UI, including inside the audit log
  (`screenshot.seeded` action, actor "Aditi Admin (Screenshot Demo)") — real seeded data through the
  actual login form, not a mocked/fabricated view, and honestly attributed as such.
- **`globals.css:44` trailing whitespace** — fixed (isolated, zero-risk removal of invisible
  whitespace, doesn't touch any visual rule).
- **`git diff --check`** — clean of real issues after the above fix (remaining output is only
  Windows CRLF-normalization warnings, not actual whitespace/conflict-marker problems).

## Not independently verified (scope/tooling limits, not evidence of a problem)

- **390px and 1024px viewports** — no screenshots exist at those widths (all 26 are captured at
  1440×900 per `manifest.md`'s own footer). Overflow handling was checked by source inspection
  (`overflow-x-auto` wrappers) on the highest-risk table, not by rendering at those widths. Genuine
  mobile/tablet visual QA is still outstanding.
- **Color contrast ratios** — not measured with a contrast-checking tool; assessed only by reading
  the Tailwind color tokens in context (e.g. status badges pair color with an icon and a text label
  throughout, which is the more load-bearing accessibility property than raw contrast ratio, but
  contrast itself wasn't independently measured).
- **Keyboard-only navigation, live-clicked** — `aria-current="page"`, visible focus-ring utility
  classes, and semantic `<nav aria-label>` landmarks are present in `dashboard-nav.tsx`, but no live
  keyboard walkthrough was performed against a running instance.

## Phase 1 — Database/security summary (evidence)

Full detail in `docs/AGENT-SYNC.md`'s Claude entry from this session and the prior one. Headline,
re-verified fresh in this pass (not carried over from memory):

- Migrations `0001`–`0023` present and in order on `styqkekxmyjupanwdxid` (fresh query, this
  session).
- All four `jds.spc_*` review/release columns exist; `release_jd_to_batch` is `SECURITY DEFINER`
  with `search_path=public` pinned, `EXECUTE` correctly granted to `authenticated`.
- `002_spc_jd_release_gate.test.sql`: 19/19 passing against hosted Postgres, fresh run this session.
- `001_applicant_directory_masking.test.sql`: 11/12 passing — the one failure is Finding #10's
  intentional documentation, not a regression.
- One pre-existing, schema-wide (not `0023`-specific) finding stands from the prior session:
  `anon` retains `EXECUTE` on all 33 `SECURITY DEFINER` functions via Supabase's default ACLs;
  not independently exploitable (every function checked has its own active-user guard) but still
  open, needs its own migration.

## Phase 3 — Deliverability summary (evidence)

- `deliverability-server.ts` is genuinely server-only (`import "server-only"`), uses the service-role
  client exclusively within that file, and its Supabase select list is `status, created_at, sent_at,
  delivered_at, bounced_at` only — no recipient address, subject, body, or provider ID ever leaves
  the aggregation layer.
- SPF/DKIM/DMARC logic matches its documented contract exactly (missing-selector → `unconfigured`,
  not `fail`; resolver errors → `error`, distinct from a genuinely absent record; DMARC `p=none` →
  `warning`, `p=quarantine`/`p=reject` → `pass`).
- `classifyDeliverabilityHealth` returns `insufficient_data` below 25 attempts before any
  healthy/warning/critical branch runs — confirmed by reading the function, not just the type.
- One near-miss, caught before acting on it: I initially suspected `ATTEMPTED_STATUSES` excluding
  `failed` was a bug contradicting the doc's prose. Checked the existing test
  (`deliverability.test.ts`'s "computes summary and chronological daily provider outcomes" case)
  before changing anything — it explicitly asserts `failed` is excluded, confirming this is Codex's
  deliberate design (bounce/complaint rate should reflect recipient reactions to delivered mail, not
  our own send-pipeline failure rate), not an accident. Fixed the *documentation* instead (added the
  missing "and failed" to the exclusion list in `docs/DELIVERABILITY-INTEGRATION.md`), left the code
  untouched.
- No UI/API consumer exists yet, correctly, per the documented "authorization decision not yet made"
  gate — confirmed no route imports these files.
