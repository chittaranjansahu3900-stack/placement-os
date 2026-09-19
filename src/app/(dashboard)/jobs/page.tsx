import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { applyToJd } from "@/app/actions/applications";
import { OpsIcon } from "@/components/shared/ops-icon";
import { StatusPill } from "@/components/student/status-pill";
import { CompanyAvatar } from "@/components/student/company-avatar";
import Link from "next/link";
import type { Jd } from "@/types/domain";

type JdWithCompany = Jd & { companies: { id: string; name: string } | null };
type MyEligibility = { eligible: boolean; reasons: string[] };

function daysLeftLabel(deadline: string) {
  const ms = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: "Closed", classes: "text-slate-400" };
  if (days === 0) return { text: "Closes today", classes: "text-red-300 font-semibold" };
  if (days <= 2) return { text: `${days} day${days === 1 ? "" : "s"} left`, classes: "text-red-300 font-semibold" };
  if (days <= 7) return { text: `${days} days left`, classes: "text-amber-300 font-semibold" };
  return { text: `${days} days left`, classes: "text-slate-400" };
}

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
      <div className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center shadow-sm">
        <OpsIcon name="shield" size={28} className="mx-auto mb-2 text-amber-400" />
        <h1 className="text-lg font-bold text-white">Student profile required</h1>
        <p className="mt-2 text-xs text-slate-400">
          No student record is linked to your account. Contact your CDPO administrator for batch enrollment.
        </p>
      </div>
    );
  }

  const { data: jds } = await supabase
    .from("jds")
    .select("*, companies(id, name)")
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
    <div className="max-w-3xl space-y-6">
      <div className="border-b border-slate-800/80 pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Browse opportunities</h1>
          <p className="mt-1 text-xs text-slate-400">
            {rows.length} role{rows.length === 1 ? "" : "s"} published for your batch, sorted by deadline.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-900/60 bg-red-950/40 p-3.5 text-xs text-red-300 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((jd, i) => {
          const applied = appliedByJd.get(jd.id);
          const elig = eligibilityChecks[i].data as MyEligibility | null;
          const stillOpen = new Date(jd.apply_by_deadline) > new Date();
          const deadline = daysLeftLabel(jd.apply_by_deadline);
          const companyName = jd.companies?.name ?? "Company";

          return (
            <div
              key={jd.id}
              className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm transition-all hover:border-slate-750 hover:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3.5">
                  <CompanyAvatar name={companyName} />
                  <div className="min-w-0">
                    {jd.companies ? (
                      <Link href={`/company/${jd.companies.id}`} className="font-bold text-white hover:text-blue-400 transition-colors truncate block">
                        {companyName} — {jd.role_title}
                      </Link>
                    ) : (
                      <h2 className="truncate font-bold text-white">{companyName} — {jd.role_title}</h2>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      {jd.ctc_total != null && <span className="font-semibold text-slate-200">{jd.ctc_total} LPA</span>}
                      {jd.locations.length > 0 && <span>{jd.locations.join(", ")}</span>}
                      <span className={deadline.classes}>
                        Deadline {new Date(jd.apply_by_deadline).toLocaleDateString([], { month: "short", day: "numeric" })} · {deadline.text}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {applied && !applied.withdrawn_at ? (
                    <StatusPill status={applied.status} />
                  ) : stillOpen && elig?.eligible ? (
                    <form action={applyToJd}>
                      <input type="hidden" name="jd_id" value={jd.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors cursor-pointer"
                      >
                        <OpsIcon name="check" size={13} />
                        1-Click Apply
                      </button>
                    </form>
                  ) : stillOpen ? (
                    <StatusPill status="not_eligible" />
                  ) : (
                    <StatusPill status="applications_closed" />
                  )}
                </div>
              </div>

              {!elig?.eligible && elig?.reasons && elig.reasons.length > 0 && (
                <div className="mt-3.5 flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-300">
                  <OpsIcon name="alert-triangle" size={13} className="mt-0.5 shrink-0 text-amber-400" />
                  <p className="leading-relaxed">{elig.reasons.join(" · ")}</p>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
            <OpsIcon name="briefcase" size={28} className="mx-auto mb-2 text-slate-500" />
            <p className="text-sm font-medium text-slate-400">No open placement opportunities for your cohort right now.</p>
          </div>
        )}
      </div>
    </div>
  );
}
