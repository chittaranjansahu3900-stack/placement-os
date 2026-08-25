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
      <div className="divide-y divide-slate-800">
        {items.map((jd) => (
          <div key={jd.id} className="p-4 hover:bg-slate-850/50 transition-colors">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-amber-400 font-bold font-mono text-sm shadow-inner">
                  {(jd.companies?.name ?? "C").charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-bold text-white text-sm truncate">
                      {jd.companies?.name ?? "Unknown Company"}
                    </span>
                    <span className="text-slate-500 font-mono text-xs">/</span>
                    <span className="text-slate-200 text-sm font-semibold truncate">{jd.role_title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-slate-400">
                    <span className="text-blue-300 font-medium">{jd.batches?.name ?? "Season"}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <OpsIcon name="clock" size={11} />
                      <span>Apply by: {new Date(jd.apply_by_deadline).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge
                  status={jd.status === "draft" && jd.spc_review_submitted_at ? "pending_spc_review" : jd.status}
                  size="sm"
                />
                <div className="flex items-center gap-2">
                  <Link
                    href={`/jds/${jd.id}`}
                    className="ops-button-secondary text-xs py-1 px-2.5 min-h-0"
                  >
                    Details
                  </Link>
                  <Link
                    href={`/jds/${jd.id}/applicants`}
                    className="ops-button-primary text-xs py-1 px-2.5 min-h-0"
                  >
                    Applicants
                  </Link>
                </div>
              </div>
            </div>

            {activeBatches && activeBatches.length > 0 && (
              <details className="group mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
                <summary className="cursor-pointer font-mono font-medium text-slate-400 hover:text-white transition-colors flex items-center justify-between">
                  <span>+ Clone JD to new season batch</span>
                  <OpsIcon name="chevron-down" size={13} className="text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
                <form action={cloneJdToSeason.bind(null, jd.id)} className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <select
                    name="target_batch_id"
                    required
                    className="ops-select text-xs font-mono text-white"
                  >
                    {activeBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>{batch.name}</option>
                    ))}
                  </select>
                  <input
                    name="apply_by_deadline"
                    type="datetime-local"
                    required
                    className="ops-input text-xs font-mono text-white"
                  />
                  <div className="sm:col-span-2">
                    <button type="submit" className="ops-button-secondary text-xs py-1 px-3 min-h-0">
                      <OpsIcon name="sparkles" size={12} />
                      Confirm Clone to Season
                    </button>
                  </div>
                </form>
              </details>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Job Descriptions Directory</h1>
          <p className="mt-1 text-xs text-slate-400">
            Enterprise recruitment campaigns, eligibility cutoffs, and season archives.
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
        <div className="rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          {error}
        </div>
      )}

      {/* Active Season JDs */}
      <section className="rounded-lg border border-slate-750 bg-slate-900/90 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3">
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-slate-200">
            <OpsIcon name="briefcase" size={14} className="text-blue-400" />
            <span>Active Season JDs ({currentRows.length})</span>
          </h2>
        </div>
        {currentRows.length > 0 ? (
          jdList(currentRows)
        ) : (
          <p className="p-8 text-center text-xs font-mono text-slate-400">
            No JDs are currently posted for active season batches.
          </p>
        )}
      </section>

      {/* Historical Season Archive */}
      {historicalRows.length > 0 && (
        <section className="rounded-lg border border-slate-750 bg-slate-900/90 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3">
            <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
              <OpsIcon name="layers" size={14} className="text-slate-500" />
              <span>Historical Season Archives ({historicalRows.length})</span>
            </h2>
          </div>
          {jdList(historicalRows)}
        </section>
      )}
    </div>
  );
}
