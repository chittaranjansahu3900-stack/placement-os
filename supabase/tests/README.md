# Tests

Two separate suites, for two separate reasons — don't merge them.

## `src/**/*.test.ts` — Vitest, pure logic

Run with `npm test`. These need nothing but Node — no Supabase, no Docker.
They cover the parsers and pure functions that don't touch Postgres:
CSV import parsing (`csv.ts`, `roster-csv.ts`, `company-csv.ts`), Resume
Maker's content normalization/scoring (`resume.ts`), and the
`canViewCandidatePacket()` masking-condition mirror (`candidate-packets.ts`).
**These currently pass — 43/43, verified by actually running them, not just
reasoned about.**

## `supabase/tests/database/*.test.sql` — pgTAP, RLS/masking

They exist because of the actual gap this repo's history keeps surfacing:
**the same class of RLS bug — a masking view with an unguarded raw-table
escape hatch, or `WITH CHECK` weaker than `USING` — has been found and
fixed nine separate times by two different reviewers, purely by manually
re-reading policy SQL.** That's not sustainable at this codebase's size, and
manual review will keep missing things a real test would catch on every run.

### Running them

Two ways, same test files either way:

```bash
npm run db:start   # needs Docker (unavailable in both agents' environments so far)
supabase test db   # runs everything under supabase/tests/database/
```

```bash
# Docker-free alternative, used to actually run and verify these tests on 2026-08-21:
DB_URL='postgres://postgres:PASSWORD@db.<project-ref>.supabase.co:5432/postgres' \
  npm run test:rls
```
`scripts/run-pgtap.mjs` executes each `.test.sql` file statement-by-statement against `DB_URL`
via a plain `pg` connection and prints the TAP output — same test files, same assertions, no
Docker required. Not a replacement for `supabase test db` long-term, just what made these
actually runnable before Docker/CI access existed. Each test file is self-contained: it creates
its own institute/batch/company/student/recruiter fixtures inside `begin;`/`rollback;` and
touches no real data.

### What's covered vs. what's still missing

`001_applicant_directory_masking.test.sql` covers the single most severe finding across both
security passes (Codex's Finding #7, `docs/BRD-IMPLEMENTATION-STATUS.md` Section 3): a recruiter
querying the raw `students` table directly (not the `applicant_directory` view) could see a
candidate's unmasked phone/personal_email/gender before that candidate was shortlisted. **Written
and verified passing (7/7) against the real hosted project on 2026-08-21** — the recruiter session
is simulated for real (`set local role authenticated` + `request.jwt.claim.sub`), so this
genuinely exercises RLS, not just a syntax check.

Not yet covered, and worth writing next: cross-tenant isolation (institute A can't see institute
B's rows — Codex's `0016_admin_assignment_scope_guards.sql` fix), every column-guard trigger
(`0007`, `0011`, `0012`, `0013`, `0018` — students/applications/users/company-reassignment/
JD-status self-service restrictions), and the bulk-shortlist RPC's recruiter-company scoping
(`0010`).
