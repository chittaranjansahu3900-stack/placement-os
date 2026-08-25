import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { applyToJd } from "@/app/actions/applications";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import type { Jd } from "@/types/domain";

type JdWithCompany = Jd & { companies: { name: string } | null };
type MyEligibility = { eligible: boolean; reasons: string[] };

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
      <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-8 text-center max-w-xl mx-auto shadow-sm">
        <OpsIcon name="shield" size={28} className="mx-auto mb-2 text-amber-400" />
        <h1 className="text-lg font-bold text-white">Student Profile Required</h1>
        <p className="mt-2 text-xs text-slate-400">
          No student record is linked to your user account. Please contact your CDPO administrator for batch enrollment.
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
    <div className="max-w-3xl space-y-7">
      {/* Header Banner */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 font-mono text-xs text-emerald-400">
          <OpsIcon name="briefcase" size={14} />
          <span>Student Placement Portal</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <span>Active Placement Drives</span>
          <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
            {rows.length} Drives
          </span>
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Opportunities published for your batch with automated real-time eligibility evaluation.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* JDs List */}
      <div className="space-y-4">
        {rows.map((jd, i) => {
          const applied = appliedByJd.get(jd.id);
          const elig = eligibilityChecks[i].data as MyEligibility | null;
          const stillOpen = new Date(jd.apply_by_deadline) > new Date();

          return (
            <div
              key={jd.id}
              className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 hover:border-slate-650 transition-all shadow-sm space-y-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-amber-400 font-bold font-mono text-base shadow-inner">
                    {(jd.companies?.name ?? "C").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-white text-base truncate">
                      {jd.companies?.name ?? "Company"} — {jd.role_title}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-slate-400">
                      {jd.ctc_total != null && (
                        <span className="font-bold text-amber-300">
                          {jd.ctc_total} LPA CTC
                        </span>
                      )}
                      {jd.locations.length > 0 && (
                        <span>· {jd.locations.join(", ")}</span>
                      )}
                      <span className="flex items-center gap-1 text-slate-400">
                        <OpsIcon name="clock" size={11} />
                        <span>Deadline: {new Date(jd.apply_by_deadline).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {applied && !applied.withdrawn_at ? (
                    <StatusBadge status={applied.status} size="md" />
                  ) : stillOpen && elig?.eligible ? (
                    <form action={applyToJd}>
                      <input type="hidden" name="jd_id" value={jd.id} />
                      <button
                        type="submit"
                        className="ops-button-primary"
                      >
                        <OpsIcon name="check" size={13} />
                        <span>1-Click Apply</span>
                      </button>
                    </form>
                  ) : (
                    <span className="rounded border border-slate-750 bg-slate-950 px-3 py-1.5 font-mono text-xs font-medium text-slate-400">
                      {stillOpen ? "Criteria Ineligible" : "Applications Closed"}
                    </span>
                  )}
                </div>
              </div>

              {!elig?.eligible && elig?.reasons && elig.reasons.length > 0 && (
                <div className="rounded-md border border-amber-800/70 bg-amber-950/40 p-3 text-xs text-amber-200 shadow-inner">
                  <p className="font-mono text-[10px] uppercase font-bold tracking-wider text-amber-300">Eligibility Status Detail:</p>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-300">
                    {elig.reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-lg border border-slate-750 bg-slate-900/60 p-12 text-center text-slate-400">
            <OpsIcon name="briefcase" size={28} className="mx-auto mb-2 opacity-40 text-slate-400" />
            <p className="text-sm font-medium text-slate-300">No open placement opportunities active for your cohort right now.</p>
          </div>
        )}
      </div>
    </div>
  );
}
