# Fit briefs — design record

**Added:** 19 September 2026. **Migration:** `0027_fit_briefs.sql`. **Tests:** `supabase/tests/database/004_fit_input_masking.test.sql` (18 pgTAP assertions, not yet run against hosted Postgres), `src/lib/fit/schema.test.ts` (10 Vitest).

## What it is

A recruiter writes what a strong candidate looks like in plain language (must-haves / nice-to-haves). Every applicant's packet is read against those lines and the recruiter gets a **brief**: a verdict (`strong / likely / partial / weak / insufficient_evidence`), a one-line summary, one evidence row per criterion — claim, source label, verbatim quote — interview probes derived from the gaps, and the list of fields the model was not allowed to see. The applicants list can be ordered by verdict.

It orders. It does not decide. Nothing in this feature writes to `applications.status`.

## Why it is built the way it is

| Decision | Reason |
|---|---|
| Model input comes only from `get_fit_input()`, never from `get_applicant_directory()` or `get_candidate_packets()` | Those two unmask contacts after shortlist because the recruiter is allowed to see them. The model is not. `get_fit_input()` strips name, gender, age, phone, personal email, section, defaults, placement status and the CV identity block in SQL, for every caller and every status. `personalInfo` is rebuilt from an allow-list (summary, headline, totalExperience) so a new identity field added to the CV schema is excluded by default. |
| Quotes are validated as substrings of the packet text (`quoteAppearsIn`) before storage | A fabricated "led the pricing team" is a hiring decision made on fiction. A failed quote downgrades the row to `not_found`, keeps the claim visible, and marks the brief `degraded` (shown with a warning in the UI). |
| Verdict is recomputed from the evidence table (`reconcileVerdict`), model verdict is a tie-breaker only | The headline can never disagree with the rows under it. Freshers with nothing to assess get `insufficient_evidence`, never `weak`. |
| Criteria are versioned and immutable; briefs are keyed to a criteria version | Editing a criterion after a decision must not rewrite the evidence the decision was made on. |
| `application_fit_briefs` has no student-visible SELECT branch | Same rule as `application_private_notes` (Finding #8). Students are never told a model's opinion of them. |
| SPC sees `fit_verdict_distribution()` (counts per version), not individual briefs | Oversight of *how criteria are being used* without a second reviewer reading model opinions of named students. |
| Feedback (`fit_brief_feedback`) is one row per recruiter per brief; disputes are audited as `fit_brief.disputed` | The calibration count on the page is auditable, and a pattern of disputes on one JD is visible to Admin through the existing audit log. |
| Model is `claude-fable-5-1` by default (`ANTHROPIC_FIT_MODEL`), temperature 0 | Evidence discipline and ownership-vs-participation judgment are the feature. A cheaper model can be configured per environment, never per request. |
| Every SECURITY DEFINER function revokes PUBLIC and anon explicitly | Per the documented 0025 limitation: `ALTER DEFAULT PRIVILEGES` does not reliably protect functions created after it in this Supabase project. |

## Data flow

```
recruiter writes criteria ──▶ saveFitCriteria() ──▶ jd_fit_criteria (v N+1)   [+ interpretations via interpretCriteria()]
                                                          │
POST /api/jds/:id/fit ──▶ for each un-briefed application:
   get_fit_input(app)  ──▶ renderPacketText() ──▶ Claude (FIT_SYSTEM_PROMPT) ──▶ parseFitBrief() ──▶ reconcileVerdict()
                                                          │
                                              application_fit_briefs (RLS insert) + audit fit_brief.generated
                                                          │
/jds/:id/fit ──▶ ranked list, brief panel, agree/disagree ──▶ fit_brief_feedback + audit fit_brief.confirmed|disputed
```

## Permissions

| Action | Who |
|---|---|
| Write criteria, generate briefs, read briefs, give feedback | `Shortlisting (recruiter-scoped)`, own company only |
| Read criteria and briefs for any JD in the institute | `Shortlist Oversight` |
| Read `get_fit_input()` | either of the above, or `Student Data - Full` (Admin) — with the same stripping |
| Students | nothing: no RLS branch, RPC returns null |

## Configuration

```
FIT_AI_ENABLED=true
ANTHROPIC_API_KEY=…            # already used by Resume AI quality review
ANTHROPIC_FIT_MODEL=claude-fable-5-1   # optional; falls back to ANTHROPIC_MODEL, then the default
```

## Not done yet

- Apply `0027` to hosted Supabase and run `npm run test:rls` (expect 46 + 18 = 64).
- Regenerate `src/types/database.types.ts`, then collapse `src/types/fit-database.ts` into `Database`.
- The "try before you save" panel (three anonymised applicants read against unsaved criteria) shown in the mock is not built; today the loop is save → generate → dispute → re-save.
- Rate/cost control: the route caps at 25 briefs per call and skips existing ones; there is no per-institute monthly cap yet.
- CDPO sign-off on the "deliberately not used" wording before pilot.
