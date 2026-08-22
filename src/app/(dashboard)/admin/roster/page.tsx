import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { CreateLoginButton } from "@/components/create-login-button";
import { RosterImportReview } from "@/components/roster-import-review";
import { createBatch, setBatchActive } from "@/app/actions/admin";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import type { Batch, Student } from "@/types/domain";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; skipped?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  const isAdmin = ctx?.roleNames.includes("Admin") ?? false;
  const canImportRoster = ctx?.permissionNames.has("Student Data - Full") ?? false;
  const canManageUsers = ctx?.permissionNames.has("User Management") ?? false;
  if (!ctx || !(isAdmin || canImportRoster || canManageUsers)) redirect("/dashboard");

  const { error, imported, skipped } = await searchParams;
  const supabase = await createClient();

  const { data: batches } = await supabase.from("batches").select("*").order("name");
  const batchRows = (batches ?? []) as Batch[];

  const { data: students } = await supabase
    .from("students")
    .select("*")
    .order("roll_no")
    .limit(200);
  const studentRows = (students ?? []) as Student[];

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <OpsIcon name="upload" size={14} />
            <span>Academic Season &amp; Roster Master</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Student Roster Management</span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {studentRows.length} Enrolled
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            BRD Section 6.5: Batch enrollment setup, profile sheet CSV verification, and automated login creation.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3.5 text-xs text-red-200">
          <OpsIcon name="alert-triangle" size={16} className="text-red-400" />
          <span>{error}</span>
        </div>
      )}
      {imported && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/50 p-3.5 text-xs text-emerald-200">
          <OpsIcon name="check" size={16} className="text-emerald-400" />
          <span>Imported {imported} student profiles ({skipped && Number(skipped) > 0 ? `${skipped} skipped` : "0 skipped"}).</span>
        </div>
      )}

      {/* Season Setup Section */}
      {isAdmin && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <OpsIcon name="calendar" size={16} className="text-blue-400" />
            <span>Academic Batch &amp; Season Provisioning</span>
          </h2>
          <form action={createBatch} className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono text-slate-400">Batch Cohort Name *</label>
              <input
                name="name"
                required
                placeholder="e.g. PGP 2026-28"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400">Starts On</label>
              <input
                name="starts_on"
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400">Ends On</label>
              <input
                name="ends_on"
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <button
              type="submit"
              className="sm:col-span-4 w-fit rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all"
            >
              + Create Season Batch
            </button>
          </form>

          {batchRows.length > 0 && (
            <div className="mt-4 divide-y divide-slate-800/80 pt-3 border-t border-slate-800 font-mono text-xs">
              {batchRows.map((batch) => (
                <div key={batch.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{batch.name}</span>
                      <StatusBadge status={batch.is_active ? "active" : "archived"} size="sm" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {batch.starts_on ?? "Start not set"} → {batch.ends_on ?? "End not set"}
                    </p>
                  </div>
                  <form action={setBatchActive.bind(null, batch.id, !batch.is_active)}>
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      {batch.is_active ? "Archive Season" : "Activate Season"}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* CSV Import Component */}
      {canImportRoster && (
        batchRows.length > 0 ? (
          <RosterImportReview batches={batchRows} />
        ) : (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/40 p-4 text-xs text-amber-200">
            Create an academic batch before importing student rosters.
          </div>
        )
      )}

      {/* Enrolled Students Directory */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <OpsIcon name="users" size={16} className="text-emerald-400" />
          <span>Enrolled Candidates Directory ({studentRows.length})</span>
        </h2>

        <div className="divide-y divide-slate-800/80 font-mono text-xs">
          {studentRows.map((student) => (
            <div key={student.id} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-bold text-amber-300">{student.roll_no}</span>
                <span className="text-white font-sans font-medium">{student.name}</span>
                <span className="text-slate-500 font-sans">
                  · {student.graduation_details?.branch ?? student.pg_details?.specialization ?? "PGP"}
                </span>
              </div>

              <div>
                {student.user_id ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-800 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <OpsIcon name="check" size={10} />
                    <span>Portal Activated</span>
                  </span>
                ) : canManageUsers ? (
                  <CreateLoginButton studentId={student.id} />
                ) : null}
              </div>
            </div>
          ))}
          {studentRows.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-500 font-mono">No students enrolled yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
