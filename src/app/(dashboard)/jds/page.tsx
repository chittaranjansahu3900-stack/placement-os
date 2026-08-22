import Link from "next/link";
import { cloneJdToSeason } from "@/app/actions/jds";
import { createClient } from "@/lib/supabase/server";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import type { Batch, Jd } from "@/types/domain";

type JdWithCompany = Jd & {
  companies: { name: string } | null;
  batches: Pick<Batch, "id" | "name" | "is_active" | "starts_on" | "ends_on"> | null;
};

export default async function JdsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: jds }, { data: activeBatches }] = await Promise.all([
    supabase
      .from("jds")
      .select("*, companies(name), batches(id, name, is_active, starts_on, ends_on)")
      .order("created_at", { ascending: false }),
    supabase
      .from("batches")
      .select("id, name, starts_on, ends_on, is_active")
      .eq("is_active", true)
      .order("starts_on", { ascending: false }),
  ]);

  const rows = (jds ?? []) as unknown as JdWithCompany[];
  const currentRows = rows.filter((jd) => jd.batches?.is_active);
  const historicalRows = rows.filter((jd) => !jd.batches?.is_active);

  function jdList(items: JdWithCompany[]) {
    return (
      <div className="divide-y divide-slate-800/80">
        {items.map((jd) => (
          <div key={jd.id} className="p-4.5 hover:bg-slate-800/30 transition-colors">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-amber-400 font-bold font-mono text-sm">
                  {(jd.companies?.name ?? "C").charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white text-sm">
                      {jd.companies?.name ?? "Unknown Company"}
                    </span>
                    <span className="text-slate-500 font-mono text-xs">/</span>
                    <span className="text-slate-200 text-sm font-semibold">{jd.role_title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-slate-400">
                    <span className="text-amber-400">{jd.batches?.name ?? "Season"}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <OpsIcon name="clock" size={11} />
                      <span>Apply by: {new Date(jd.apply_by_deadline).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge
                  status={jd.status === "draft" && jd.spc_review_submitted_at ? "pending_spc_review" : jd.status}
                  size="sm"
                />
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/jds/${jd.id}`}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:text-white transition-colors"
                  >
                    Details
                  </Link>
                  <Link
                    href={`/jds/${jd.id}/applicants`}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                  >
                    Applicants
                  </Link>
                </div>
              </div>
            </div>

            {activeBatches && activeBatches.length > 0 && (
              <details className="mt-3.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                <summary className="cursor-pointer font-mono text-slate-400 hover:text-amber-300 transition-colors">
                  + Clone JD to new season batch
                </summary>
                <form action={cloneJdToSeason.bind(null, jd.id)} className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <select
                    name="target_batch_id"
                    required
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  >
                    {activeBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>{batch.name}</option>
                    ))}
                  </select>
                  <input
                    name="apply_by_deadline"
                    type="datetime-local"
                    required
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                  <button className="rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 sm:col-span-2">
                    Create Draft Clone
                  </button>
                </form>
              </details>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <OpsIcon name="briefcase" size={14} />
            <span>Job Descriptions Repository</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Corporate Placement JDs</span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {rows.length} Total
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Active season hiring opportunities and reusable historical job description templates.
          </p>
        </div>

        <Link
          href="/jds/new"
          className="ops-button-primary"
        >
          <OpsIcon name="plus" size={14} />
          <span>Post New JD</span>
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3.5 text-xs text-red-200">
          <OpsIcon name="alert-triangle" size={16} className="text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Seasons JDs */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-md">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <OpsIcon name="check-shield" size={14} className="text-emerald-400" />
            <span>Active Season Drives ({currentRows.length})</span>
          </h2>
        </div>
        {jdList(currentRows)}
        {currentRows.length === 0 && (
          <p className="p-8 text-center text-xs text-slate-500 font-mono">No active JDs published yet.</p>
        )}
      </section>

      {/* Historical Template Library */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-md">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <OpsIcon name="layers" size={14} className="text-amber-400" />
            <span>Historical Template Library ({historicalRows.length})</span>
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Cloning duplicates role requirements and eligibility criteria into a new season draft.
          </p>
        </div>
        {jdList(historicalRows)}
        {historicalRows.length === 0 && (
          <p className="p-8 text-center text-xs text-slate-500 font-mono">No historical templates stored.</p>
        )}
      </section>
    </div>
  );
}
