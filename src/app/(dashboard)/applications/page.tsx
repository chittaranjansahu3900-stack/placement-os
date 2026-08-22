import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { withdrawApplication } from "@/app/actions/applications";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import type { Application } from "@/types/domain";

type ApplicationWithJd = Application & {
  jds: { role_title: string; apply_by_deadline: string; companies: { name: string } | null } | null;
};

export default async function ApplicationsPage({
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
    .select("id")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center max-w-xl mx-auto">
        <OpsIcon name="shield" size={28} className="mx-auto mb-2 text-amber-400" />
        <h1 className="text-lg font-bold text-white">Student Account Required</h1>
        <p className="mt-2 text-xs text-slate-400">
          No student profile is associated with this login. Please reach out to your CDPO coordinator.
        </p>
      </div>
    );
  }

  const { data: applications } = await supabase
    .from("applications")
    .select("*, jds(role_title, apply_by_deadline, companies(name))")
    .eq("student_id", student.id)
    .order("applied_at", { ascending: false });

  const rows = (applications ?? []) as ApplicationWithJd[];
  const shortlistedCount = rows.filter((r) => r.status === "shortlisted" || r.status === "interview").length;
  const selectedCount = rows.filter((r) => r.status === "selected").length;

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header Banner */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono text-blue-400">
          <OpsIcon name="check-shield" size={14} />
          <span>Candidate Application Center</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <span>My Applications Tracker</span>
          <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
            {rows.length} Applied
          </span>
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Real-time hiring status across all corporate recruiters, interview rounds, and offer updates.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3.5 text-xs text-red-200">
          <OpsIcon name="alert-triangle" size={16} className="text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Telemetry Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Submitted"
          value={rows.length}
          secondary="Active drive submissions"
          icon="file-text"
          highlight="cobalt"
        />
        <StatCard
          label="Shortlisted / Interview"
          value={shortlistedCount}
          secondary="Advancing across rounds"
          icon="star"
          highlight="emerald"
        />
        <StatCard
          label="Final Offers"
          value={selectedCount}
          secondary="Confirmed selection"
          icon="award"
          highlight="gold"
        />
      </div>

      {/* Applications List */}
      <div className="space-y-3">
        {rows.map((a) => {
          const canWithdraw =
            !a.withdrawn_at && a.jds && new Date(a.jds.apply_by_deadline) > new Date();

          return (
            <div
              key={a.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4.5 hover:border-slate-700 transition-all backdrop-blur-md flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-amber-400 font-bold font-mono text-sm">
                  {(a.jds?.companies?.name ?? "C").charAt(0)}
                </div>
                <div>
                  <h2 className="font-bold text-white text-sm">
                    {a.jds?.companies?.name ?? "Company"} — {a.jds?.role_title ?? "Role"}
                  </h2>
                  <p className="mt-0.5 font-mono text-xs text-slate-400 flex items-center gap-2">
                    <span>Applied: {new Date(a.applied_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge status={a.withdrawn_at ? "withdrawn" : a.status} size="md" />
                {canWithdraw && (
                  <form action={withdrawApplication}>
                    <input type="hidden" name="application_id" value={a.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/60 transition-colors"
                    >
                      Withdraw
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
            <OpsIcon name="file-text" size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-slate-400">You haven&apos;t submitted any applications yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
