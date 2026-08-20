# Handover to Codex — PlacementOS (rewritten 2026-08-20, supersedes the earlier version)

The previous version of this file routed Defaults Tracker, Reporting, RBAC admin UI, and the
Company Pipeline Kanban board to Codex. All of that is done now (see
`docs/BRD-IMPLEMENTATION-STATUS.md` for the FR-by-FR record) — this is a fresh split of what's
actually left, written after Codex's own BRD/security audit and Claude's fixes to it landed
(`0011_students_self_update_guard.sql`, `0012_codex_audit_fixes.sql`).

**Read `docs/BRD-IMPLEMENTATION-STATUS.md` first.** It's the canonical FR-by-FR status record —
this doc only exists to divide what's listed there as Partial/Missing so neither of us re-does
the other's work. Don't maintain a second "what's done" narrative here.

## Why this split, not some other one

Two things went wrong before that this split is designed to prevent:

1. **A migration filename collision** — Claude and Codex both created a `0010_*.sql` independently.
   Fixed by rename, but avoid it going forward: **schema/migration changes for this phase are
   Claude's** (see below for why). If your task turns out to need one anyway, say so in this file
   rather than silently adding one — number it starting from `0014` and update this doc with what
   you actually used.
   **Codex used `0014_masked_candidate_packets.sql` for FR-4.4:** a migration was unavoidable because
   pre-shortlist CV review must redact contact fields at the database boundary; relaxing the raw
   `cv_documents` policy or masking only in React would have reopened the PII bypass fixed in `0012`.
   **Codex used `0015_outreach_persona_templates.sql` for FR-8.4:** this is seed-content only (no
   schema/RLS change), so existing databases receive the same eight templates as fresh installs.
   **Codex used `0016_admin_assignment_scope_guards.sql` for FR-9.2:** exposing direct grants and
   editable role bundles made the existing permission-only, cross-tenant-capable policies an active
   security boundary. The migration tenant-scopes the assignment tables and database-locks base roles.
   **Codex used `0017_placement_export_dataset.sql` for FR-7.2/7.3:** Reports & Export must read
   official student-level report fields without gaining unrestricted raw `students` access. The RPC
   checks permission, tenant, and batch and returns only fields required by the three export templates.
2. **The same class of RLS bug found nine times across this codebase's history** — row-level RLS
   with no column guard, or a masking view with an unguarded raw-table escape hatch — by two
   different reviewers, purely through manual re-reading, because no automated test catches it.
   Claude is picking up test infrastructure for exactly this reason (see below). If your track
   touches RLS at all, re-read `USING` against `WITH CHECK` by hand regardless — the tests won't
   exist yet when you start.

## Claude's track (schema/RLS-adjacent, in progress starting now)

1. **Systematic permission-vs-role-name UI gate audit** (BRD-IMPLEMENTATION-STATUS.md Section 6,
   P0 #2 residual). Codex's Finding #4 caught one instance (`/reports/export`); every other
   `ctx.roleNames.some(...)` check across `src/app/(dashboard)/**/page.tsx` and `route.ts` needs
   the same scrutiny against the actual Section 7.2/7.3 Permission Set catalog, not just role
   name. Uses the `hasPermission()` helper already added to `src/lib/auth/current-user.ts`.
2. **FR-1.2/1.3 — JD lifecycle completion.** The schema already has `grade`,
   `eligible_specializations`, `max_backlog`, `open_positions` (0001) — the JD creation form
   (`src/app/(dashboard)/jds/new/page.tsx`, `src/app/actions/jds.ts`) just doesn't capture them.
   Also adding the missing status transitions (Applications Closed / Shortlisting / Closed) with
   valid-transition enforcement, which needs a trigger — that's the reason this is Claude's and
   not a pure UI task.
3. **FR-4.5 — private notes UI.** `application_private_notes` (0012) exists with correct RLS
   (no student-visible branch at all) but no UI reads or writes it yet. Finishing the loop on the
   table just split out.
4. **FR-2.5 — Admin eligibility override UI.** Per-JD include/exclude of specific students from
   the eligible/notified list, on top of `eligible_students_for_jd()` (0004).
5. **Automated test setup.** No test runner is configured yet (`package.json` has no `test`
   script) — picking a framework and writing the highest-value tests first: RLS policies, the
   masking boundary (`students_select` + `applicant_directory` agreement), the column-guard
   triggers (`0007`, `0011`, `0012`), and cross-tenant isolation. This is explicitly the fix for
   "found nine times by hand" above, not a nice-to-have.

## Codex's track (UI/workflow completion on modules you already have full context in)

You built Resume Maker, the Outreach CRM adaptation, bulk shortlisting, and the roster-import
review flow — these extend the same modules, so you're not starting cold:

1. **DONE — FR-4.2 applicant sort/filter controls** (CGPA/work-ex/specialization plus search,
   branch/status, and sort direction) on `src/app/(dashboard)/jds/[id]/applicants/page.tsx`.
2. **DONE — FR-4.4 merged/inline candidate packet view**, on top of the CV-snapshot attachment
   (`0009_resume_maker.sql`) and masked packet RPC (`0014_masked_candidate_packets.sql`).
3. **DONE — FR-7.2/7.3 Final Placement exports.** Official source-compatible wide company blocks,
   configurable Accreditation Detail, and PII-free Public Company Summary. The route still checks
   `hasPermission('Reports & Export')`; `0017` provides its narrowly scoped tenant dataset.
4. **DONE — FR-8.1/8.3/8.4 Outreach CRM completion.** Staged target-company CSV import, all
   CompanyContact source fields, eight real persona templates, and contact/sender-personalized preview.
5. **DONE — FR-9.1/9.2 admin UI polish.** Batch/season create/archive/reactivate, individual
   extra-Permission-Set assignment/removal, existing custom-role bundle editing, and user reactivation.
6. **DONE — FR-10.7 Resume Maker export/templates.** Genuine OOXML `.docx` generation plus
   Placement Cell Classic, Modern Blue, and Compact Executive layouts, alongside print/PDF.

## Not a good fit for either of us right now — needs a decision first, not code

Unchanged from the previous handover, still blocked on the same product/infra decisions:

- **SSO (§9)** — BRD leaves the provider unresolved. Flag, don't pick one.
- **Email delivery (Resend)** — unwired. Unblocks FR-2.4/2.6, FR-4.6, FR-5.2/5.3 reminders, and
  FR-8.5/8.6 outreach sending all at once, so worth doing as one task once it's decided — but
  confirm sender domain/template content with the user before anything reaches real
  recruiters/students.
- **File storage (JD attachments, CVs, Placement Committee Vault)** — needs a Supabase Storage
  bucket/RLS design decision (do the Section 7.4 masking rules apply to file reads too?) before
  implementation.
- **AI provider for Resume Maker (FR-10.4)** — model/provider, prompt logging, and student-data
  processing terms need a decision before wiring anything up.

## The one item still genuinely blocking both of us

**No migration has ever run against a real Postgres — including every fix either of us has made,
this session included.** `npm run db:start` needs Docker, which hasn't been available in either
of our environments so far. This is P0 #1 in `BRD-IMPLEMENTATION-STATUS.md` and now the single
largest risk in the repo: 16 migration files of hand-reviewed-only SQL, several with triggers doing
real work (`pg_trigger_depth()` guards, `LEFT JOIN LATERAL`, cascading trigger interactions across
`cv_documents`/`students`/`applications`). Whoever gets handed a real environment first should run
`npm run db:start && npm run db:reset` before touching anything else — expect to fix something on
first apply, and re-verify the trigger-interaction reasoning in the migration comments once you
can actually watch it execute instead of trace it by hand.

## Definition of done, whatever you pick up

- Re-read `USING` vs `WITH CHECK` on anything RLS-adjacent you touch, even if it's not "supposed"
  to be your track this round (see "why this split" above).
- If your task needs a migration and you're on the Codex track: number it `0014+`, and add a line
  to this file's "why this split" section noting what you used and why the Claude-only-migrations
  rule didn't fit your case.
- Update `docs/BRD-IMPLEMENTATION-STATUS.md`'s relevant FR row(s) when you ship something — that
  file, not this one, is the shared source of truth for what's done.
- `src/types/domain.ts` is hand-written, not generated. If a real Supabase project is linked in
  your environment, run `npm run db:types` and prefer the generated `Database` type for new query
  code instead of extending the hand-written one.
