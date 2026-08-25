# Applicant directory masking — fix proposal

**Status:** proposal only, not implemented. Written 22 August 2026 during a database-security review
(Claude's track). Do not implement while Gemini is actively editing `applicant_directory`'s only
consumer (`src/app/(dashboard)/jds/[id]/applicants/page.tsx`) — this needs a UI query change (Step 4
below) alongside the migration, and that file is currently Gemini's surface.

## Confirmed defect

`applicant_directory` (`0004_settings_functions_views.sql`) is declared with `security_invoker = true`
and joins `applications a JOIN students s ON s.id = a.student_id JOIN jds j ON j.id = a.jd_id` as a
plain INNER JOIN. Because it's invoker-security, the join to `students` is evaluated under the
**querying recruiter's own RLS**, not the view owner's. `students_select`'s only recruiter-reachable
branch requires the application to already be `shortlisted`/`interview`/`selected`/`waitlisted`:

```
(a.student_id = students.id) AND (j.company_id = current_company_id())
  AND has_permission('Shortlisting (recruiter-scoped)')
  AND (a.status = ANY (ARRAY['shortlisted','interview','selected','waitlisted']))
```

Pre-shortlist, that branch doesn't match, `students_select` returns zero rows for that student, and
the INNER JOIN drops the entire application row from the view — not just its sensitive columns.
**Reproduced directly against the hosted database, 22 August 2026:** a recruiter querying
`applicant_directory` for a JD with one `applied`-status application got **0 rows**, while the same
recruiter querying the raw `applications` table directly (which has its own, non-`students`-joined
RLS) correctly saw **1 row**. The `applications` row exists and is visible; the joined view silently
erases it.

**Scope:** this only affects the **Recruiter** persona. Admin and SPC hold `Student Data - Full`,
which is `students_select`'s *second* branch and has no shortlist-status condition at all — so
`applicant_directory` queries from Admin/SPC accounts already see every row regardless of status.
The defect is specific to `src/app/(dashboard)/jds/[id]/applicants/page.tsx`'s main query
(`supabase.from("applicant_directory").select("*").eq("jd_id", id)`, line 147), which is the
recruiter-facing applicant list (FR-4.2) — i.e., the page a recruiter would use to *decide* who to
shortlist shows them nobody until someone else already progressed that candidate. This inverts the
actual workflow.

**Why the existing pgTAP test didn't catch it:** `001_applicant_directory_masking.test.sql`'s
pre-shortlist assertions were all of the form
`select phone from applicant_directory where student_id = ...` — a scalar subquery. A masked column
(`NULL`) and an absent row (subquery matches nothing, also `NULL`) are indistinguishable through that
shape. The test has been corrected (see "Test file changes" below) to assert row *existence*
separately from column masking, which is how this defect actually surfaces now: the corrected test
fails against current behavior, documenting the defect rather than hiding it.

## Recommended security model

Mirror `get_candidate_packets()` (`0014_masked_candidate_packets.sql`) exactly — this codebase already
has the right pattern for this class of problem, just not applied to the applicant *list*. That
function is `SECURITY DEFINER`, joins `students` directly (bypassing `students_select`'s row
filtering entirely, since it's the function owner's privileges that apply inside a security-definer
body), and instead enforces the real authorization boundary through its own explicit `WHERE` clause —
company/institute scope plus a named Permission Set — with masking applied via `CASE` at the column
level, not left to row-level RLS to sort out.

Do **not** fix this by changing `students_select` or dropping `applicant_directory`'s
`security_invoker` flag. Loosening `students_select` would reopen the exact class of bug Finding #7
closed (raw-table PII exposure) for every *other* consumer of that policy, not just this one view.
Dropping `security_invoker` would make the view bypass RLS entirely and depend solely on its own
`CASE` logic never having a gap — defense-in-depth the raw-table guard currently provides would be
gone. A dedicated RPC keeps both protections: RLS still blocks direct `students` reads for anyone
without a real reason, and the RPC's own scoped `WHERE` clause is the (separately auditable)
authorization boundary for this one specific, legitimate read pattern.

## SQL/API shape

New migration (next available number when implemented — check `supabase/migrations/` at that time,
this proposal doesn't reserve one):

```sql
create function get_applicant_directory(p_jd_id uuid)
returns table (
  application_id uuid,
  jd_id uuid,
  student_id uuid,
  status application_status,
  round_history jsonb,
  applied_at timestamptz,
  roll_no text,
  name text,
  total_work_ex_months int,
  branch text,
  specialization text,
  cgpa numeric,
  phone text,
  personal_email text,
  gender text
)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    a.id, a.jd_id, a.student_id, a.status, a.round_history, a.applied_at,
    s.roll_no, s.name, s.total_work_ex_months,
    s.graduation_details ->> 'branch',
    s.pg_details ->> 'specialization',
    coalesce((s.graduation_details ->> 'cgpa')::numeric, (s.pg_details ->> 'cgpa')::numeric),
    case when a.status in ('shortlisted','interview','selected','waitlisted') then s.phone else null end,
    case when a.status in ('shortlisted','interview','selected','waitlisted') then s.personal_email else null end,
    case when a.status in ('shortlisted','interview','selected','waitlisted') then s.gender else null end
  from applications a
  join jds j on j.id = a.jd_id
  join batches b on b.id = j.batch_id
  join students s on s.id = a.student_id
  where a.jd_id = p_jd_id
    and (
      (j.company_id = current_company_id() and has_permission('Shortlisting (recruiter-scoped)'))
      or (b.institute_id = current_institute_id()
          and (has_permission('Shortlist Oversight') or has_permission('Student Data - Full')))
    );
end;
$$;

revoke all on function get_applicant_directory(uuid) from public;
grant execute on function get_applicant_directory(uuid) to authenticated;
```

Column list and masking condition are copied verbatim from the existing `applicant_directory` view
definition — this is a re-platforming of proven logic onto a security-definer function, not a redesign
of what gets masked or when.

`applicant_directory` (the view) is left in place, unchanged — it's still fine for any consumer that
isn't the Recruiter-scoped list (or simply unused going forward if every caller switches to the RPC;
that's a separate cleanup decision, not required for this fix).

## Required migration

One migration: create the function above, `revoke`/`grant` as shown. Additive only — no existing
table, view, or policy changes. No backfill needed (nothing is stored; this is a read path).

## UI query change needed later

`src/app/(dashboard)/jds/[id]/applicants/page.tsx:147` currently:

```ts
supabase.from("applicant_directory").select("*").eq("jd_id", id),
```

becomes:

```ts
supabase.rpc("get_applicant_directory", { p_jd_id: id }),
```

The returned shape is the same column set (same `ApplicantDirectoryRow` type should still apply, or
need only a mechanical rename if column ordering changes anything downstream — verify against
`src/types/domain.ts`'s `ApplicantDirectoryRow`). This is exactly the kind of page-level query change
the working boundary for this review excludes — it belongs to whoever integrates this after Gemini's
visual pass is done, per the task's own scoping.

## Why it cannot leak raw student data

- The function only ever returns the same masked column set the current view already returns —
  masking logic is copied unchanged, not loosened.
- Authorization is the function's own explicit `WHERE` clause, evaluated for every row: a Recruiter
  must match `company_id = current_company_id()` (their own company only) *and* hold
  `Shortlisting (recruiter-scoped)`; anyone else must hold an institute-scoped permission
  (`Shortlist Oversight` or `Student Data - Full`). A different company's Recruiter, or a Recruiter
  without that Permission Set, matches neither branch and gets zero rows for that JD — same effective
  boundary `get_candidate_packets()` already enforces successfully in production.
- Raw, unfiltered `students` access is untouched: `students_select`'s RLS keeps blocking direct reads
  exactly as Finding #7 fixed it. This function doesn't relax that policy — it just stops routing the
  Recruiter-facing list *through* a policy that was never designed to also gate this join.
- `SECURITY DEFINER` functions in this codebase are already held to an explicit standard (see `0023`'s
  review, and `get_candidate_packets`/`release_jd_to_batch` before it): tenant/company scope must be
  checked in the function body, not assumed from caller-side RLS. This function follows that standard.

## Exact USING/WITH CHECK implications

None — this is a new function, not a policy change. No existing `USING`/`WITH CHECK` pair is touched.
The function's `WHERE` clause is the functional equivalent of a `USING` clause but lives in the
function body (standard for this codebase's existing security-definer RPCs), not in `pg_policy`.

## Test cases

Add a new pgTAP file (or extend `001_applicant_directory_masking.test.sql` with a second scenario
block) covering, for `get_applicant_directory()` specifically:

1. Pre-shortlist: the row is present (row count 1, not 0) with `phone`/`personal_email`/`gender` all
   `NULL` — the row-existence assertion the current view-based test cannot make.
2. Post-shortlist: same row, now with `phone`/`personal_email`/`gender` populated.
3. Raw `students` table access remains blocked for the same recruiter, pre- and post-shortlist except
   the existing Finding #7 unmask condition — i.e., confirm this fix didn't touch that boundary at all.
4. A different company's Recruiter (same institute) gets zero rows for the same JD.
5. An SPC (`Shortlist Oversight`) and an Admin (`Student Data - Full`) each get the row, unmasked,
   regardless of status — confirming the institute-scoped branch still works as it already does today
   via the view.
6. A Recruiter who holds `JD Management` for the company but not `Shortlisting (recruiter-scoped)`
   (if that combination is ever possible under a custom role) gets zero rows — confirms the function
   checks the specific Permission Set, not just company ownership.
