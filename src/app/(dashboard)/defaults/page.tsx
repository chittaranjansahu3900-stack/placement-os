import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { OpsIcon } from "@/components/ops-icon";
import { StatCard } from "@/components/stat-card";
import type { DefaultRecord } from "@/types/domain";

export default async function MyDefaultsPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center max-w-xl mx-auto">
        <OpsIcon name="shield" size={28} className="mx-auto mb-2 text-amber-400" />
        <h1 className="text-lg font-bold text-white">Student Account Required</h1>
        <p className="mt-2 text-xs text-slate-400">
          No student record is linked to this login. Please check with your CDPO administrator.
        </p>
      </div>
    );
  }

  const [{ data: summary }, { data: records }] = await Promise.all([
    supabase
      .from("student_defaults_summary")
      .select("*")
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase.from("default_records").select("*").eq("student_id", student.id).order("activity_name"),
  ]);

  const rows = (records ?? []) as DefaultRecord[];
  const totalDefaults = summary?.total_defaults ?? 0;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header Banner */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono text-orange-400">
          <OpsIcon name="alert-triangle" size={14} />
          <span>Student Attendance &amp; Compliance</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <span>My Defaults &amp; Discipline Record</span>
          <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold border ${
            totalDefaults === 0
              ? "bg-emerald-950 text-emerald-300 border-emerald-800/60"
              : "bg-red-950 text-red-300 border-red-800/60"
          }`}>
            {totalDefaults === 0 ? "Compliant" : `${totalDefaults} Default${totalDefaults === 1 ? "" : "s"}`}
          </span>
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          BRD Section 6.4: Official tracking for pre-placement talks (PPTs), GD workshops, and mock interview attendance.
        </p>
      </div>

      {/* Telemetry Card */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Accumulated Defaults"
          value={totalDefaults}
          secondary="Infraction count on record"
          icon="alert-circle"
          highlight={totalDefaults === 0 ? "emerald" : "amber"}
        />
        <StatCard
          label="Activities Tracked"
          value={rows.length}
          secondary="Required placement sessions"
          icon="calendar"
          highlight="cobalt"
        />
      </div>

      {/* Activity Records Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
          <OpsIcon name="layers" size={16} className="text-amber-400" />
          <span>Mandatory Placement Activities ({rows.length})</span>
        </h2>

        <div className="mt-4 divide-y divide-slate-800/80">
          {rows.map((r) => (
            <div key={r.id} className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-white text-xs">{r.activity_name}</p>
                <p className="font-mono text-[11px] uppercase text-slate-500 mt-0.5">{r.activity_type}</p>
              </div>
              <div>
                {r.attended ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-800 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                    <OpsIcon name="check" size={11} />
                    <span>Attended</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-950/80 border border-red-800 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-red-300">
                    <OpsIcon name="alert-triangle" size={11} />
                    <span>Defaulted</span>
                  </span>
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-500 font-mono">No mandatory activity sessions logged yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
