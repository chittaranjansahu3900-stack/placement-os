import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { CreateLoginButton } from "@/components/admin/create-login-button";
import { RosterImportReview } from "@/components/admin/roster-import-review";
import { createBatch, setBatchActive } from "@/app/actions/admin";
import { OpsIcon } from "@/components/shared/ops-icon";
import { StatusBadge } from "@/components/shared/status-badge";
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
    <div className="max-w-4xl space-y-7">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-emerald-400">
            <OpsIcon name="upload" size={14} />
            <span>Academic Season &amp; Roster Master</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Student Roster Management</span>
            <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {studentRows.length} Enrolled
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            BRD Section 6.5: Batch enrollment setup, profile sheet CSV verification, and automated login creation.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {imported && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-800/80 bg-emerald-950/70 p-3.5 text-xs text-emerald-200 shadow-sm">
          <OpsIcon name="check" size={15} className="text-emerald-400 shrink-0" />
          <span>Imported {imported} student profiles ({skipped && Number(skipped) > 0 ? `${skipped} skipped` : "0 skipped"}).</span>
        </div>
      )}

      {/* Season Setup Section */}
      {isAdmin && (
        <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2 border-b border-slate-800 pb-3">
            <OpsIcon name="calendar" size={14} className="text-blue-400" />
            <span>Academic Batch &amp; Season Provisioning</span>
          </h2>
          <form action={createBatch} className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono text-slate-400">Batch Cohort Name *</label>
              <input
                name="name"
                required
                placeholder="e.g. PGP 2026-28"
                className="ops-input mt-1 w-full text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400">Starts On</label>
              <input
                name="starts_on"
                type="date"
                className="ops-input mt-1 w-full text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400">Ends On</label>
              <input
                name="ends_on"
                type="date"
                className="ops-input mt-1 w-full text-xs text-white font-mono"
              />
            </div>
            <button
              type="submit"
              className="ops-button-primary sm:col-span-4 w-fit text-xs"
            >
              + Create Season Batch
            </button>
          </form>

          {batchRows.length > 0 && (
            <div className="mt-4 divide-y divide-slate-800 pt-3 border-t border-slate-800 font-mono text-xs">
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
                      className="ops-button-secondary text-xs py-1 px-3 min-h-0"
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
          <div className="rounded-lg border border-amber-800/80 bg-amber-950/40 p-4 text-xs text-amber-200 shadow-sm">
            Create an academic batch before importing student rosters.
          </div>
        )
      )}

      {/* Enrolled Students Directory */}
      <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2 border-b border-slate-800 pb-3">
          <OpsIcon name="users" size={14} className="text-emerald-400" />
          <span>Enrolled Candidates Directory ({studentRows.length})</span>
        </h2>

        <div className="divide-y divide-slate-800 font-mono text-xs">
          {studentRows.map((student) => (
            <div key={student.id} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-bold text-amber-300">{student.roll_no}</span>
                <span className="text-white font-sans font-medium">{student.name}</span>
                <span className="text-slate-400 font-sans">
                  · {student.graduation_details?.branch ?? student.pg_details?.specialization ?? "PGP"}
                </span>
              </div>

              <div>
                {student.user_id ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-950/90 border border-emerald-700/80 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
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
            <p className="py-8 text-center text-xs text-slate-400 font-mono">No students enrolled yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
