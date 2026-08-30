import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { applyToJd } from "@/app/actions/applications";
import { OpsIcon } from "@/components/shared/ops-icon";
import { StatusPill } from "@/components/student/status-pill";
import { CompanyAvatar } from "@/components/student/company-avatar";
import type { Company, Jd } from "@/types/domain";

type MyEligibility = { eligible: boolean; reasons: string[] };

// Read-only, student-safe view of a company. The BD/CDPO outreach tool at
// /companies/[id] shares the same company record but is staff-only (stage
// buttons, contact directory, email composer) — students never see it.
export default async function StudentCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("*").eq("id", id).single();
  if (!company) notFound();
  const typedCompany = company as Company;

  const { data: student } = await supabase
    .from("students")
    .select("id, batch_id")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <OpsIcon name="shield" size={28} className="mx-auto mb-2 text-amber-500" />
        <h1 className="text-lg font-bold text-slate-900">Student profile required</h1>
        <p className="mt-2 text-sm text-slate-500">No student record is linked to your account.</p>
      </div>
    );
  }

  const { data: jds } = await supabase
    .from("jds")
    .select("*")
    .eq("company_id", id)
    .eq("batch_id", student.batch_id)
    .neq("status", "draft")
    .order("apply_by_deadline");

  const roles = (jds ?? []) as Jd[];

  const { data: myApplications } = await supabase
    .from("applications")
    .select("jd_id, status, withdrawn_at")
    .eq("student_id", student.id);
  const appliedByJd = new Map((myApplications ?? []).map((a) => [a.jd_id, a]));

  const eligibilityChecks = await Promise.all(
    roles.map((jd) => supabase.rpc("my_eligibility_for_jd", { p_jd_id: jd.id })),
  );

  const { count: selectedFromBatch } = await supabase
    .from("applications")
    .select("id, jds!inner(company_id)", { count: "exact", head: true })
    .eq("status", "selected")
    .eq("jds.company_id", id)
    .eq("jds.batch_id", student.batch_id);

  const ctcValues = roles.map((r) => r.ctc_total).filter((v): v is number => v != null);
  const avgCtc = ctcValues.length > 0 ? (ctcValues.reduce((a, b) => a + b, 0) / ctcValues.length).toFixed(1) : null;
  const openCount = roles.filter((r) => new Date(r.apply_by_deadline) > new Date()).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/jobs" className="hover:text-slate-600">Opportunities</Link>
        <span>/</span>
        <span className="font-medium text-slate-600">{typedCompany.name}</span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <CompanyAvatar name={typedCompany.name} size={52} />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">{typedCompany.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{typedCompany.sector ?? "General sector"}</p>
          </div>
          {openCount > 0 && (
            <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Hiring now</span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-lg font-bold text-slate-900">{roles.length}</p>
            <p className="text-xs text-slate-400">Open roles</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{avgCtc ? `${avgCtc} LPA` : "—"}</p>
            <p className="text-xs text-slate-400">Avg. CTC this season</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{selectedFromBatch ?? 0}</p>
            <p className="text-xs text-slate-400">Selected from your batch</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Open roles</h2>
        {roles.map((jd, i) => {
          const applied = appliedByJd.get(jd.id);
          const elig = eligibilityChecks[i].data as MyEligibility | null;
          const stillOpen = new Date(jd.apply_by_deadline) > new Date();

          return (
            <div key={jd.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="min-w-0">
                <h3 className="truncate font-bold text-slate-900">{jd.role_title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {jd.ctc_total != null ? `${jd.ctc_total} LPA · ` : ""}
                  Deadline {new Date(jd.apply_by_deadline).toLocaleDateString([], { month: "short", day: "numeric" })}
                </p>
              </div>
              <div className="shrink-0">
                {applied && !applied.withdrawn_at ? (
                  <StatusPill status={applied.status} />
                ) : stillOpen && elig?.eligible ? (
                  <form action={applyToJd}>
                    <input type="hidden" name="jd_id" value={jd.id} />
                    <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                      Apply
                    </button>
                  </form>
                ) : stillOpen ? (
                  <StatusPill status="not_eligible" />
                ) : (
                  <StatusPill status="applications_closed" />
                )}
              </div>
            </div>
          );
        })}
        {roles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">No open roles from {typedCompany.name} for your batch right now.</p>
          </div>
        )}
      </div>
    </div>
  );
}
