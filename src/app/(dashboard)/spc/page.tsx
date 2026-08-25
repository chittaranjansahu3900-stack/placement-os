import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { updateStalenessThreshold } from "@/app/actions/spc";
import { releaseJdToBatch } from "@/app/actions/jds";
import { currentRoundByJd } from "@/lib/spc-current-round";
import { OpsIcon } from "@/components/shared/ops-icon";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import type { SpcPipelineRow } from "@/types/domain";
import type { Database } from "@/types/database.types";

type PendingJd = Pick<
  Database["public"]["Tables"]["jds"]["Row"],
  "id" | "role_title" | "apply_by_deadline" | "spc_review_submitted_at"
> & {
  companies: { name: string } | null;
  batches: { name: string } | null;
};

export default async function SpcDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Shortlist Oversight")) {
    redirect("/dashboard");
  }
  const isAdmin = ctx.roleNames.includes("Admin");

  const supabase = await createClient();
  const [{ data: pipeline }, { data: settings }, { data: pendingJds }] = await Promise.all([
    supabase
      .from("spc_pipeline_overview")
      .select("*")
      .order("is_stale", { ascending: false })
      .order("jd_updated_at", { ascending: true }),
    supabase
      .from("institute_settings")
      .select("staleness_days")
      .eq("institute_id", ctx.appUser.institute_id)
      .single(),
    supabase
      .from("jds")
      .select("id, role_title, apply_by_deadline, spc_review_submitted_at, companies(name), batches(name)")
      .eq("status", "draft")
      .not("spc_review_submitted_at", "is", null)
      .order("spc_review_submitted_at", { ascending: true }),
  ]);

  const rows = ((pipeline ?? []) as SpcPipelineRow[]).filter((row) => row.jd_status !== "closed");
  const jdIds = rows.map((row) => row.jd_id);
  const { data: applicationRounds } = jdIds.length
    ? await supabase.from("applications").select("jd_id, round_history").in("jd_id", jdIds)
    : { data: [] };
  const roundsByJd = currentRoundByJd(applicationRounds ?? []);
  const staleCount = rows.filter((r) => r.is_stale).length;
  const totalShortlisted = rows.reduce((acc, r) => acc + (r.shortlisted_count || 0), 0);
  const totalApplications = rows.reduce((acc, r) => acc + (r.total_applications || 0), 0);

  return (
    <div className="space-y-8">
      {/* Header with Title & Staleness Configuration */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-amber-400">
            <OpsIcon name="radar" size={14} />
            <span>SPC Operations War Room</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Active Placement Drives</span>
            <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {rows.length} Active JDs
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            BRD Section 3.3: Real-time hiring velocity tracking, slot allocations, and anti-staleness oversight.
          </p>
        </div>

        {isAdmin && (
          <form action={updateStalenessThreshold} className="flex items-end gap-2.5 rounded-lg border border-slate-750 bg-slate-900/90 p-3 shadow-sm">
            <label className="text-[11px] font-mono font-medium text-slate-300">
              Staleness Trigger
              <div className="flex items-center gap-1.5 mt-1.5">
                <input
                  name="staleness_days"
                  type="number"
                  min={1}
                  defaultValue={settings?.staleness_days ?? 3}
                  className="ops-input w-16 py-1 px-2 text-center font-mono text-xs text-white"
                />
                <span className="text-slate-400 font-mono text-xs">days</span>
              </div>
            </label>
            <button
              type="submit"
              className="ops-button-primary text-xs py-1 px-3 min-h-0 bg-amber-600 hover:bg-amber-500 border-amber-400/80"
            >
              Update
            </button>
          </form>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-800/80 bg-emerald-950/70 p-3.5 text-xs text-emerald-200 shadow-sm">
          <OpsIcon name="check" size={15} className="text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Recruiter submissions stay draft/student-hidden until SPC releases them. */}
      <section className="rounded-xl border border-amber-800/80 bg-slate-900/95 overflow-hidden shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-900/80 bg-amber-950/40 px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-amber-200">
              <OpsIcon name="check-shield" size={15} className="text-amber-400" />
              <span>JD Release Queue ({pendingJds?.length ?? 0})</span>
            </h2>
            <p className="mt-0.5 text-xs text-amber-200/80">
              Review recruiter submissions and deadline. You may keep it or move it earlier, then release it to the assigned batch.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-800">
          {((pendingJds ?? []) as unknown as PendingJd[]).map((jd) => (
            <div key={jd.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,auto)] lg:items-center hover:bg-slate-850/50 transition-colors">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link href={`/jds/${jd.id}`} className="font-semibold text-white text-sm hover:text-amber-300 transition-colors">
                    {jd.companies?.name ?? "Company"} — {jd.role_title}
                  </Link>
                  <StatusBadge status="pending_spc_review" size="sm" />
                </div>
                <p className="mt-1 font-mono text-xs text-slate-300">
                  Target Cohort: <span className="text-white font-medium">{jd.batches?.name ?? "Assigned batch"}</span> · Recruiter deadline: <span className="text-amber-300 font-medium">{new Date(jd.apply_by_deadline).toLocaleString()}</span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  Submitted {jd.spc_review_submitted_at ? new Date(jd.spc_review_submitted_at).toLocaleString() : "for review"}
                </p>
              </div>

              <form action={releaseJdToBatch.bind(null, jd.id)} className="grid gap-2.5 sm:grid-cols-[minmax(210px,1fr)_auto] sm:items-end">
                <label className="text-[11px] font-mono font-medium text-slate-300">
                  Earlier Deadline (Optional)
                  <input
                    name="apply_by_deadline"
                    type="datetime-local"
                    max={new Date(jd.apply_by_deadline).toISOString().slice(0, 16)}
                    className="ops-input mt-1 block w-full text-xs font-mono text-white"
                  />
                </label>
                <button type="submit" className="ops-button-primary justify-center whitespace-nowrap text-xs bg-emerald-600 hover:bg-emerald-500 border-emerald-400/80">
                  <OpsIcon name="check" size={13} />
                  <span>Release to Batch</span>
                </button>
              </form>
            </div>
          ))}
          {(pendingJds?.length ?? 0) === 0 && (
            <p className="p-6 text-center text-xs font-mono text-slate-400">No recruiter JDs are currently awaiting SPC release.</p>
          )}
        </div>
      </section>

      {/* Telemetry Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Hiring Streams"
          value={rows.length}
          secondary="In shortlisting & interview"
          icon="briefcase"
          highlight="cobalt"
        />
        <StatCard
          label="Stale Pipelines"
          value={staleCount}
          secondary={`Inactive > ${settings?.staleness_days ?? 3} days`}
          icon="alert-triangle"
          highlight={staleCount > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Total Shortlisted"
          value={totalShortlisted}
          secondary="Candidates across rounds"
          icon="star"
          highlight="emerald"
        />
        <StatCard
          label="Total Pipeline Volume"
          value={totalApplications}
          secondary="Combined applications"
          icon="users"
          highlight="gold"
        />
      </div>

      {/* Main Drive Queue Cards */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-slate-300">
            <OpsIcon name="layers" size={15} className="text-amber-400" />
            <span>Active Drive Pipelines</span>
          </h2>
          <span className="font-mono text-xs text-slate-400">Sorted by staleness urgency</span>
        </div>

        <div className="grid gap-3">
          {rows.map((r) => {
            const currentRound = roundsByJd.get(r.jd_id);
            return (
              <div
                key={r.jd_id}
                className={`rounded-lg border p-4 transition-all ${
                  r.is_stale
                    ? "border-amber-800/90 bg-amber-950/30 shadow-md"
                    : "border-slate-750 bg-slate-900/90 hover:border-slate-650 hover:bg-slate-850/90"
                }`}
              >
                <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.8fr)_auto]">
                  {/* Left: Company & Role Identity */}
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-amber-400 font-bold font-mono text-sm shadow-inner">
                      {r.company_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 truncate">
                        <Link
                          href={`/jds/${r.jd_id}/applicants`}
                          className="font-bold text-white text-sm hover:text-blue-300 transition-colors truncate"
                        >
                          {r.company_name} — {r.role_title}
                        </Link>
                        {r.is_stale && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-950 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200 border border-amber-700/80 shrink-0">
                            <OpsIcon name="clock" size={11} className="text-amber-400" />
                            <span>Stale · &gt;{settings?.staleness_days ?? 3}d</span>
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-xs text-slate-400 flex items-center gap-2">
                        <span>Status:</span>
                        <StatusBadge status={r.jd_status} size="sm" />
                        <span>· Last activity {new Date(r.jd_updated_at).toLocaleDateString()}</span>
                      </p>
                    </div>
                  </div>

                  {/* Middle: Active Interview Round Telemetry */}
                  <div className="rounded-md border border-slate-750 bg-slate-950/80 px-3.5 py-2 min-w-[220px]">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Current Round Status</p>
                    <p className="font-semibold text-white text-xs mt-0.5">
                      {currentRound?.round ?? "No rounds scheduled"}
                    </p>
                    {currentRound?.scheduledAt && (
                      <p className="font-mono text-[11px] text-blue-300 mt-0.5 flex items-center gap-1">
                        <OpsIcon name="clock" size={11} />
                        <span>{new Date(currentRound.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    )}
                    {currentRound?.location && (
                      <p className="font-mono text-[10px] text-slate-400 truncate">{currentRound.location}</p>
                    )}
                  </div>

                  {/* Right: Funnel Ratio & Shortcut */}
                  <div className="flex items-center justify-between gap-4 lg:justify-end">
                    <div className="text-right font-mono">
                      <p className="text-sm font-bold text-emerald-400">
                        {r.shortlisted_count} <span className="text-xs text-slate-400 font-normal">Shortlisted</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        of {r.total_applications} candidates
                      </p>
                    </div>
                    <Link
                      href={`/jds/${r.jd_id}/applicants`}
                      className="ops-button-secondary text-xs py-1.5 px-3 min-h-0"
                    >
                      <span>Manage</span>
                      <OpsIcon name="arrow-right" size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="rounded-lg border border-slate-750 bg-slate-900/60 p-12 text-center text-slate-400">
              <OpsIcon name="briefcase" size={28} className="mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-sm font-medium text-slate-300">No active job descriptions in the pipeline.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
