import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  excludeStudentFromJd,
  includeStudentInJd,
  removeEligibilityOverride,
} from "@/app/actions/eligibility";
import { OpsIcon } from "@/components/ops-icon";
import { StatCard } from "@/components/stat-card";
import type { Jd, JdEligibilityOverride, Student } from "@/types/domain";

export default async function JdEligibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Student Data - Full")) redirect(`/jds/${id}`);

  const supabase = await createClient();

  const { data: jd } = await supabase
    .from("jds")
    .select("*, companies(name)")
    .eq("id", id)
    .single();
  const typedJd = jd as unknown as (Jd & { companies: { name: string } | null }) | null;
  if (!typedJd) redirect("/jds");

  const [{ data: finalList }, { data: overrides }, { data: batchStudents }] = await Promise.all([
    supabase.rpc("final_eligible_students_for_jd", { p_jd_id: id }),
    supabase.from("jd_eligibility_overrides").select("*").eq("jd_id", id),
    supabase.from("students").select("id, roll_no, name").eq("batch_id", typedJd.batch_id).order("roll_no"),
  ]);

  const finalRows = (finalList ?? []) as Student[];
  const overrideRows = (overrides ?? []) as JdEligibilityOverride[];
  const finalIds = new Set(finalRows.map((s) => s.id));
  const includedIds = new Set(overrideRows.filter((o) => o.override_type === "include").map((o) => o.student_id));
  const excludedOverrides = overrideRows.filter((o) => o.override_type === "exclude");

  const batchStudentRows = (batchStudents ?? []) as Pick<Student, "id" | "roll_no" | "name">[];
  const excludedStudentsById = new Map(batchStudentRows.map((s) => [s.id, s]));
  const availableToInclude = batchStudentRows.filter((s) => !finalIds.has(s.id));

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header Banner */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <Link href={`/jds/${id}`} className="hover:text-amber-400 flex items-center gap-1 transition-colors">
            <OpsIcon name="briefcase" size={13} />
            <span>{typedJd.role_title}</span>
          </Link>
          <span>/</span>
          <span className="text-slate-200">Eligibility Overrides</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>Student Eligibility Console</span>
              <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
                {typedJd.companies?.name ?? "Company"}
              </span>
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              BRD Section 2.5: Override auto-calculated criteria by explicitly including or excluding cohort members.
            </p>
          </div>

          <Link
            href={`/jds/${id}`}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Back to JD Detail
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3.5 text-xs text-red-200">
          <OpsIcon name="alert-triangle" size={16} className="text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Final Qualified Cohort"
          value={finalRows.length}
          secondary="Auto-qualified + manual overrides"
          icon="check-shield"
          highlight="emerald"
        />
        <StatCard
          label="Manual Overrides"
          value={overrideRows.length}
          secondary={`${includedIds.size} included · ${excludedOverrides.length} excluded`}
          icon="shield"
          highlight="gold"
        />
      </div>

      {/* Manual Include Form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <OpsIcon name="plus" size={14} className="text-blue-400" />
          <span>Manually Grant Candidate Eligibility</span>
        </h2>
        <form action={includeStudentInJd.bind(null, id)} className="mt-3 flex gap-2">
          <select
            name="student_id"
            required
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-mono"
          >
            <option value="">Select student from batch to include...</option>
            {availableToInclude.map((s) => (
              <option key={s.id} value={s.id}>
                {s.roll_no} — {s.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            Grant Override
          </button>
        </form>
      </div>

      {/* Active Eligible List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h2 className="text-sm font-bold text-white font-mono flex items-center justify-between">
          <span className="flex items-center gap-2">
            <OpsIcon name="user-check" size={16} className="text-emerald-400" />
            <span>Qualified Candidates ({finalRows.length})</span>
          </span>
        </h2>

        <ul className="mt-4 divide-y divide-slate-800/80 font-mono text-xs">
          {finalRows.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="font-bold text-amber-300">{s.roll_no}</span>
                <span className="text-white font-sans font-medium">{s.name}</span>
                {includedIds.has(s.id) && (
                  <span className="rounded-full bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    Manually Included
                  </span>
                )}
              </div>

              {includedIds.has(s.id) ? (
                <form action={removeEligibilityOverride.bind(null, id, s.id)}>
                  <button type="submit" className="text-xs text-red-400 hover:underline">
                    Remove Override
                  </button>
                </form>
              ) : (
                <form action={excludeStudentFromJd.bind(null, id, s.id)}>
                  <button type="submit" className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:text-red-300 hover:border-red-900 transition-colors">
                    Exclude
                  </button>
                </form>
              )}
            </li>
          ))}
          {finalRows.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500 font-mono">No eligible candidates qualified for this drive.</p>
          )}
        </ul>
      </div>

      {/* Excluded Overrides Bucket */}
      {excludedOverrides.length > 0 && (
        <div className="rounded-2xl border border-red-900/40 bg-red-950/10 p-5 backdrop-blur-md">
          <h2 className="text-sm font-bold text-red-300 font-mono flex items-center gap-2">
            <OpsIcon name="alert-triangle" size={16} className="text-red-400" />
            <span>Manually Excluded Candidates ({excludedOverrides.length})</span>
          </h2>

          <ul className="mt-3 divide-y divide-red-900/30 font-mono text-xs">
            {excludedOverrides.map((o) => {
              const student = excludedStudentsById.get(o.student_id);
              return (
                <li key={o.id} className="flex items-center justify-between py-2.5">
                  <span className="text-slate-400 line-through">
                    {student ? `${student.roll_no} — ${student.name}` : o.student_id}
                  </span>
                  <form action={removeEligibilityOverride.bind(null, id, o.student_id)}>
                    <button type="submit" className="rounded border border-blue-800 bg-blue-950/60 px-2.5 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-900">
                      Restore to Eligible List
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
