import { describe, expect, it } from "vitest";
import { canViewCandidatePacket, PACKET_VISIBLE_STATUSES } from "./candidate-packets";

// This function is a UI-branching mirror of the Section 7.4 masking
// condition baked into the `applicant_directory` view and the
// `students_select`/`cv_documents_select` RLS policies
// (0004_settings_functions_views.sql, 0012_codex_audit_fixes.sql) — it
// decides whether the recruiter UI offers a "view full packet" link at all.
// If this list ever drifts from the SQL-side masking condition, a recruiter
// either loses a link they should have (annoying) or sees a link that 403s
// against RLS (broken, but not a security hole — RLS is still the real
// gate). Pinning the exact status list here catches drift either way.
describe("canViewCandidatePacket", () => {
  it("matches the exact status list the masking view unmasks on", () => {
    expect(PACKET_VISIBLE_STATUSES).toEqual(["shortlisted", "interview", "selected", "waitlisted"]);
  });

  it.each(PACKET_VISIBLE_STATUSES)("allows packet access once status is %s", (status) => {
    expect(canViewCandidatePacket(status)).toBe(true);
  });

  it.each(["applied", "under_review", "rejected"])("denies packet access while status is %s", (status) => {
    expect(canViewCandidatePacket(status)).toBe(false);
  });

  it("denies an unrecognized status rather than defaulting to allow", () => {
    expect(canViewCandidatePacket("not_a_real_status")).toBe(false);
  });
});
