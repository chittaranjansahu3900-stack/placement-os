# Handover to Codex — PlacementOS (rewritten 2026-08-21, supersedes the 2026-08-20 version)

**Read `docs/BRD-IMPLEMENTATION-STATUS.md` first.** It's the canonical FR-by-FR status record — this
doc only exists to divide what's listed there as Partial/Missing (plus five now-decided items that
weren't buildable before today) so neither of us re-does the other's work. Don't maintain a second
"what's done" narrative here — when you finish something, update that file's FR row, not this one.

This is a full rewrite, not a patch on the 2026-08-20 version — that version had accumulated enough
inline "done"/strikethrough annotations from one session's progress that it stopped being a clean
reference. Everything below reflects actual current state as of 2026-08-21.

## The split rule, unchanged

1. **Schema/migration/RLS-adjacent and identity/security work is Claude's.** If your task turns out
   to need a migration anyway, say so in this file rather than silently adding one — number it
   starting from `0019` (last used: `0018`, Claude's FR-2.5 eligibility overrides) and add a line
   here noting what you used and why.
   **Codex used `0019_notification_delivery_queue.sql` for FR-2.4/2.6, FR-4.6, FR-5.2/5.3, and
   FR-8.5/8.6:** scheduled sends, retry state, provider-message correlation, and idempotent webhook
   processing cannot be represented by `jd_notifications` or `outreach_activities` alone. The
   migration leaves `jd_notifications` unchanged, adds one shared server-written delivery queue,
   and gives browser roles read-only, permission-scoped visibility with no authenticated write
   policy.
   **Codex used `0020_plain_file_storage.sql` for FR-1.2, CV files, and FR-8.12:** the existing
   JD/CV object-path columns can reference Storage, but the committee vault has no metadata entity
   and none of the three file families had a bucket or policies. The migration adds one private
   plain-file bucket and vault metadata, preserving tenant/module boundaries while deliberately
   omitting shortlist-status gating and all redaction logic.
   **Codex used `0021_company_assignment_role_guard.sql` for FR-8.2:** filtering the assignment
   dropdown or validating only a Server Action would still let a direct Supabase update assign an
   arbitrary user. The trigger validates active same-tenant JPC/BD and SPC/Senior-SPC role lineage
   (including cloned roles) and prevents clearing an already assigned supervisory line.
   **Codex used `0022_outreach_activity_season.sql` for FR-8.13:** joining historical activity to
   `users.batch_id` at report time would rewrite old-season attribution whenever a JPC moves to a
   new batch. The migration snapshots the actor's same-tenant batch on insert and backfills what can
   be derived for existing rows.
   **Codex used `0023_spc_jd_release_gate.sql` for the 22 August 2026 JD-release decision:** keeping
   an awaiting-review JD as an ordinary draft without protected submission/release metadata would
   let a Recruiter publish through the direct Supabase API. The migration records the review handoff,
   locks the submitted payload, requires `Shortlist Oversight` for release, and permits SPC to keep
   or prepone—but never postpone—the recruiter deadline before publication.
2. **UI/workflow completion on modules you already own is yours** — Resume Maker, Outreach CRM,
   bulk shortlisting, candidate packets, roster import, reporting/export. You built these; you're
   not starting cold on any of them.
3. Re-read `USING` vs `WITH CHECK` by hand on anything RLS-adjacent you touch regardless of whose
   track it's on — the pgTAP suite (below) doesn't exist yet, so nothing catches this automatically
   yet. This class of bug has been found and fixed nine separate times across this codebase's
   history, by two different reviewers, purely by manual re-reading.

## State of the world, in one paragraph

The P0 infrastructure risk is closed: all 18 migrations (`0001`–`0018`) are verified applied on the
real hosted Supabase project (`db.styqkekxmyjupanwdxid.supabase.co`), and `src/types/database.types.ts`
is generated from it — prefer that over the hand-written `src/types/domain.ts` for new query code.
Four product decisions that were blocking build work are now resolved (SSO, email domain, CV file
masking, AI provider) — see each item below for what was decided. What's left is real, scoped
feature/security work, not more waiting on infrastructure or decisions.

## Claude's track

0. **Post-UI-redesign security/UX review — done, 22 August 2026.** Full findings in
   `docs/CLAUDE-FINAL-REVIEW.md`; handoff narrative and evidence in `docs/AGENT-SYNC.md`. Headline:
   no Blocker found; every permission-gate variable from item 1 below survived Gemini's visual pass
   completely unchanged (verified directly in `dashboard-nav.tsx`/`layout.tsx`); the JD-release
   workflow is correctly implemented in the UI, not just the database (no direct-publish action
   exists for Recruiter, deadline input has a real `max` attribute enforcing prepone-only, SPC
   release queue shows all required fields). One High finding (`/admin/users`' role dropdown
   defaults to granting Admin on an unmodified click) and one Medium (hardcoded season badge in the
   shared header) — both left for integration since their files are inside the UI redesign's active
   ownership scope. Migration `0023` and the applicant-masking diagnosis were independently
   re-verified fresh (not carried over from memory) — still 19/19 and 11/12 respectively.
1. ~~Systematic permission-vs-role-name UI gate audit~~ — **done, 21 August 2026.** Checked all 12
   files against the real RLS policy behind each action (queried `pg_policy` directly rather than
   assuming from the BRD text). Findings:
   - **Real bugs, fixed:** `importRoster`/`createStudentLogin` (`roster.ts`), `importDefaults`
     (`defaults.ts`), and the page-level gates on `/admin/users`, `/admin/roles`,
     `/admin/audit-log`, `/admin/roster`, `/admin/defaults` all checked `roleNames.includes("Admin")`
     while the actions/RLS behind them actually accept a specific Permission Set (`Student Data -
     Full`, `User Management`, `Role & Permission Management`, `Audit Log View`) — a custom role
     holding that grant without being literally named "Admin" was getting redirected away from a
     page whose own buttons would have worked for them. `layout.tsx`'s `canManageCompanies` nav
     check had the same issue (hardcoded role-name list vs. no real page-level gate on `/companies`
     at all). All now check `permissionNames`, matching the pattern already correct elsewhere in
     this file (`canPostJd`, `canSeeSpcDashboard`, etc.). Two pages (`/admin/roster`,
     `/admin/defaults`) mix a genuinely Admin-only section (RLS hardcodes `has_role('Admin')`, no
     Permission Set covers it — batch create/archive, defaults threshold) with a
     permission-scoped one on the same page; both are now gated section-by-section instead of one
     blanket top-level check, and `layout.tsx`'s admin nav links were split to match each
     destination's specific gate instead of one shared `isAdmin`.
   - **Already correct, left unchanged:** `createBatch`/`setBatchActive` (`admin.ts`),
     `updateStalenessThreshold` (`spc.ts`), `updateDefaultsThreshold` (`defaults.ts`), and
     `spc/page.tsx`'s `isAdmin` check — all mirror a genuinely role-hardcoded RLS policy
     (`has_role('Admin')`, no Permission Set exists for these), so a role-name check is the correct
     boundary, not a bug. `layout.tsx`'s `isStudent`/`isRecruiter`/`isAdmin` persona-identity checks
     are also correct by design (Section 7.2 ties those personas to a fixed page set, not a single
     permission) and were left as-is.
   - Verified clean after: `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test` (58/58).
2. **pgTAP RLS test suite — started 2026-08-21, extended 2026-08-22.**
   Two files now, both run via `DB_URL=<postgres-connection-string> npm run test:rls`
   (`scripts/run-pgtap.mjs`, Docker-free — `supabase test db` still needs Docker and remains the
   long-term preferred runner once that's available):
   - `001_applicant_directory_masking.test.sql` — Finding #7 (`students_select` vs
     `applicant_directory` agreement pre/post shortlist). **11/12 passing.** The one failure is
     intentional: the test was corrected 2026-08-22 to assert applicant-row *existence* separately
     from column masking (it previously only checked scalar column values, which can't distinguish
     a masked `NULL` from an absent row), and that correction surfaced a real, previously-hidden
     defect — see Section 3 Finding #10 in `BRD-IMPLEMENTATION-STATUS.md` and
     `docs/APPLICANT-MASKING-FIX-PROPOSAL.md`. Leave assertion 2 failing until that's fixed; don't
     revert the test to hide it again.
   - `002_spc_jd_release_gate.test.sql` — the FR-1.3 SPC release gate (`0023`). Independently
     security-reviewed and extended from 9 to **19/19 passing**: cross-institute release attempts,
     pending/deactivated Recruiter and SPC actors, forged release metadata, unrelated-field
     tampering during release, second-release attempts, past/equal/prepone deadlines, and
     direct-table-update bypass attempts (blocked by RLS before the trigger ever runs, since SPC
     lacks `JD Management`). One theorized cross-institute RLS gap was empirically tested and
     disproven before being written up — verify against real Postgres, don't trust a policy
     read-through alone, in either direction.
   **Still to write:** cross-tenant isolation (`0016`) as its own dedicated test (002 only covers it
   for the JD-release path), the column-guard triggers (`0007`, `0011`, `0012`, `0013`, `0018`), and
   the bulk-shortlist RPC's recruiter-company scoping (`0010`).
3. **SSO → Google**, decided 2026-08-21 (FR-9.4). Extends the existing Firebase Custom Token
   federation layer (BRD §12.1) rather than a fresh integration — scope it against that existing
   auth code first.
4. ~~Appendix B schema gaps~~ — **checked 2026-08-21, already done, nothing to build.** Verified
   directly against the live schema (not just the BRD PDF, which is what the original version of
   this item was based on): `students.display_seq`, `.section`, `.age`, `.gender` all exist and
   `gender` already gets the same pre-shortlist masking as phone/personal_email in
   `applicant_directory`; `outreach_activities.jpc_remark` exists distinct from
   `call_remarks`/`spc_remarks`; the `merge_status` enum already has all 7 values
   (`email_sent`, `email_opened`, `email_clicked`, `responded`, `not_interested`,
   `call_back_later`, `bounced`) — no separate mapping table needed, they're native enum labels.
5. **FR-9.2 residual**: user auto-expiry (season-end/graduation), full CRUD/RLS matrix
   verification. **FR-9.3**: add missing audit events (JD approvals, Admin shortlist-override
   semantics, permission-set edits).
6. ~~Applicant-directory masking defect (Section 3 Finding #10)~~ — **closed end to end, 22 August
   2026.** `get_applicant_directory(p_jd_id)` (`0024_masked_applicant_directory_rpc.sql`) is a
   `SECURITY DEFINER` RPC modeled on `get_candidate_packets()`'s already-proven pattern: bypasses
   `students_select` entirely, enforces its own company/institute/permission checks, masks
   phone/personal_email/gender by status **or** `Student Data - Full` (not `Shortlist Oversight`
   alone — a real discrepancy the original proposal doc had between its SQL sketch and its own test
   list, resolved explicitly in the migration). `anon` EXECUTE explicitly revoked, not just
   `PUBLIC`. Applied to hosted Supabase; `001_applicant_directory_masking.test.sql` rewritten to
   test the RPC (Finding #7's raw-table guard preserved) — **22/22 passing**, combined with `002`'s
   19/19 for a fully green 41/41 hosted pgTAP run. Both `.../applicants/page.tsx` and
   `.../applicants/packets/page.tsx` switched to the RPC (confirmed by direct source read) — full
   design record in `docs/APPLICANT-MASKING-FIX-PROPOSAL.md`.
7. **New, found 2026-08-22 — schema-wide `anon` EXECUTE grant.** Every `SECURITY DEFINER` function
   in this schema (33 of them, not just `0023`'s) has EXECUTE granted to `anon` via Supabase's own
   default project ACLs; `revoke ... from public` (the pattern used throughout this codebase,
   including `0023`) never actually strips it, since `anon` has its own direct default-privilege
   grant independent of the `PUBLIC` pseudo-role. Not exploitable today — every function checked has
   its own explicit `current_user_id() is null`-or-equivalent guard as backstop — but worth one
   dedicated migration (`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM
   anon`, plus explicit re-grants for anything genuinely meant to be anon-callable, if anything is)
   instead of relying on that holding for all 33 forever. Not fixed here — out of this review's
   scope, and a schema-wide grant change deserves its own focused pass, not a rider on an unrelated
   task.

## Codex's track

You built Resume Maker, the Outreach CRM adaptation, bulk shortlisting, candidate packets, and the
roster-import review flow — this extends the same modules.

1. **Resend email integration** — the single biggest unblock on your track. Build one shared
   notification helper, not five separate ones; it unblocks FR-2.4/2.6 (JD notifications), FR-4.6
   (shortlist auto-notify), FR-5.2/5.3 (SPC/round reminders), and FR-8.5/8.6 (outreach mail merge +
   scheduled/queued sends with retry) together.
   - **Sender domain, decided 2026-08-21, two-phase:** use a subdomain of `iitiimcareers.in` you
     control now (e.g. `notifications@mail.iitiimcareers.in`) for real testing today; swap to
     `placements@iimraipur.ac.in` later once IIM Raipur's IT adds SPF/DKIM DNS records for Resend on
     their domain — confirm that's done before switching. **Build the sender identity as a config
     value, not a hardcoded string**, so that swap is a config change, not a code change.
   - `jd_notifications` schema already exists (no migration needed) — write delivery rows and wire
     provider webhooks for open/click tracking.
   - Template wording needs CDPO sign-off before anything reaches real recruiters/students —
     flag for review, don't assume approval.
2. **AI provider proxy for Resume Maker (FR-10.4)** — decided 2026-08-21: full Cursivo-style
   multi-provider, **Groq + Gemini + Claude**, minus Cursivo's credit-billing system (no
   per-student paid tiers here). Mirror Cursivo's actual split: Groq (free) for the writing-assist
   panels (rewrite, achievement drafting), Gemini for PDF/CV import parsing (feeds FR-10.2's guided
   first-CV setup), Claude for higher-quality output where it's worth the per-token cost. Replicate
   Cursivo's architecture, not its billing: server-side proxy only (Next.js Server Action or Route
   Handler — never expose API keys to the browser), PII-mask CV content before it's sent to any
   model and unmask the response, input-size caps, admin kill switch. Needs `ANTHROPIC_API_KEY`,
   `GROQ_API_KEY`, `GEMINI_API_KEY` as server-only env vars (never `NEXT_PUBLIC_*`). Confirm
   prompt-logging and student-data-processing terms for DPDP (Appendix E) before real student CVs
   go through it.
3. **File storage (JD attachments, CVs, Placement Committee Vault)** — decided 2026-08-21:
   **deliberately no file-level masking.** A plain Supabase Storage bucket is enough; CVs are
   downloadable with full contact info regardless of shortlist status, confirmed as an intentional
   pilot-speed tradeoff (it does reopen the class of bypass Finding #7 closed at the DB level — the
   DB/screen-level masking still stands, a file download just routes around it; revisit if this
   grows into a real multi-institute product). This unblocks FR-1.2's JD attachment and FR-8.12's
   Placement Committee Vault. Retention period and DPDP deletion workflow (Appendix E) are still
   undecided — flag, don't guess a default.
4. **FR-1.5** — Clone JD + season-aware history/template workflow.
5. **FR-5.1** — SPC dashboard: show the actual current round (not just shortlist/total counts),
   define "active" consistently, exclude closed records appropriately.
6. **FR-8.2** — require valid JPC/Senior-SPC role choices on company assignment, derive/report the
   supervisory line, prevent unassigned companies where the BRD requires an owner.
7. **FR-8.10** — "tie reassignment to staleness/supervision views": the original BRD note isn't
   concrete enough to build against as written. Propose a specific behavior and flag it for
   confirmation before building, don't guess.
8. **FR-8.13** — outreach funnel reporting (contacted → responded → onboarded) per JPC and season.
9. **FR-10.2** — import 10th/12th, positions/projects/other qualifications into Resume Maker's
   first-CV setup (currently only imports name/contact, PG/graduation, prior employers, credentials).
10. **FR-9.1 residual** — complete full Profile Sheet CSV mapping (10th/12th, credentials, other
    qualifications), plus the four new Appendix B student columns once Claude adds them (item 4
    above) — you own roster-import review.
11. **FR-7.4** — batch-over-batch historical comparison, once ≥2 seasons exist on the platform.

## Logged, not scheduled — do not build

**Applicant rank/percentile ("where do I stand"), logged 2026-08-21** — see
`BRD-IMPLEMENTATION-STATUS.md` Section 6a for the full spec if this ever gets picked up. Explicitly
deferred; there are 16 Partial + 7 Missing real BRD FRs ahead of it.

## Still blocked on something outside either of our control

- **Official historical report templates** — no decision yet on who defines the exact
  accreditation-submission format (BRD §9 open item, P2 #5 in the status doc).
- **Real 2024–25 source data** (Profile Sheet, Defaults Tracker, Final Placement Datasheet) — not
  present in this repo. No Appendix F acceptance criterion can be signed off without it; this isn't
  something either of us can unblock by writing code.

## Definition of done, whatever you pick up

- Re-read `USING` vs `WITH CHECK` on anything RLS-adjacent you touch, even if it's not "supposed" to
  be your track this round.
- If your task needs a migration and you're on the Codex track: number it `0019+`, and add a line
  to this file noting what you used and why the Claude-only-migrations rule didn't fit your case.
- Update `docs/BRD-IMPLEMENTATION-STATUS.md`'s relevant FR row(s) when you ship something.
- Prefer `src/types/database.types.ts` (generated) over `src/types/domain.ts` (hand-written) for new
  query code. Re-run `npm run db:types` after any migration that changes the schema.
