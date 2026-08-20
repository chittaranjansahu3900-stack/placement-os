import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { applyToJd } from "@/app/actions/applications";
import type { Jd } from "@/types/domain";

type JdWithCompany = Jd & { companies: { name: string } | null };
type MyEligibility = { eligible: boolean; reasons: string[] };

// FR-2.1–FR-3.4 from the student's side: browse published JDs for my batch,
// self-check eligibility (my_eligibility_for_jd, 0006), apply in one click.
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, batch_id")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-white">Browse JDs</h1>
        <p className="mt-2 text-sm text-neutral-500">
          No student profile is linked to your account yet — check with your CDPO Admin.
        </p>
      </div>
    );
  }

  const { data: jds } = await supabase
    .from("jds")
    .select("*, companies(name)")
    .eq("batch_id", student.batch_id)
    .neq("status", "draft")
    .order("apply_by_deadline");

  const { data: myApplications } = await supabase
    .from("applications")
    .select("jd_id, status, withdrawn_at")
    .eq("student_id", student.id);

  const appliedByJd = new Map((myApplications ?? []).map((a) => [a.jd_id, a]));
  const rows = (jds ?? []) as JdWithCompany[];

  const eligibilityChecks = await Promise.all(
    rows.map((jd) => supabase.rpc("my_eligibility_for_jd", { p_jd_id: jd.id })),
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-white">Browse JDs</h1>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {rows.map((jd, i) => {
          const applied = appliedByJd.get(jd.id);
          const elig = eligibilityChecks[i].data as MyEligibility | null;
          const stillOpen = new Date(jd.apply_by_deadline) > new Date();

          return (
            <li key={jd.id} className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">
                    {jd.companies?.name ?? "Unknown company"} — {jd.role_title}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Apply by {new Date(jd.apply_by_deadline).toLocaleString()}
                  </p>
                </div>
                {applied && !applied.withdrawn_at ? (
                  <span className="shrink-0 rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
                    {applied.status}
                  </span>
                ) : stillOpen && elig?.eligible ? (
                  <form action={applyToJd}>
                    <input type="hidden" name="jd_id" value={jd.id} />
                    <button
                      type="submit"
                      className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                    >
                      Apply Now
                    </button>
                  </form>
                ) : (
                  <span className="shrink-0 text-xs text-neutral-500">
                    {stillOpen ? "Not eligible" : "Closed"}
                  </span>
                )}
              </div>
              {!elig?.eligible && elig?.reasons && elig.reasons.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-400">
                  {elig.reasons.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <p className="text-sm text-neutral-500">No open JDs for your batch right now.</p>
        )}
      </ul>
    </div>
  );
}
