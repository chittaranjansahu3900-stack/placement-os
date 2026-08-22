import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { importDefaults, updateDefaultsThreshold } from "@/app/actions/defaults";
import { EXPECTED_DEFAULTS_COLUMNS, DEFAULTS_ACTIVITY_TYPES } from "@/lib/defaults-constants";
import { OpsIcon } from "@/components/ops-icon";
import { StatCard } from "@/components/stat-card";
import type { Batch, Student } from "@/types/domain";

export default async function AdminDefaultsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; skipped?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  const isAdmin = ctx?.roleNames.includes("Admin") ?? false;
  const canImportDefaults = ctx?.permissionNames.has("Student Data - Full") ?? false;
  if (!ctx || !(isAdmin || canImportDefaults)) redirect("/dashboard");

  const { error, imported, skipped } = await searchParams;
  const supabase = await createClient();

  const [{ data: batches }, { data: settings }, { data: students }, { data: summary }] =
    await Promise.all([
      supabase.from("batches").select("*").order("name"),
      supabase
        .from("institute_settings")
        .select("defaults_threshold")
        .eq("institute_id", ctx.appUser.institute_id)
        .single(),
      supabase.from("students").select("*").order("roll_no").limit(300),
      supabase.from("student_defaults_summary").select("*"),
    ]);

  const batchRows = (batches ?? []) as Batch[];
  const studentRows = (students ?? []) as Student[];
  const totalsByStudent = new Map((summary ?? []).map((s) => [s.student_id, s.total_defaults]));
  const threshold = settings?.defaults_threshold ?? 4;
  const flaggedCount = studentRows.filter((s) => (totalsByStudent.get(s.id) ?? 0) >= threshold).length;

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-orange-400">
            <OpsIcon name="alert-triangle" size={14} />
            <span>Attendance &amp; Compliance Master</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Defaults &amp; Penalty Tracker</span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              Threshold: {threshold} Defaults
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            BRD Section 4.6: Automatic placement block when student defaults meet or exceed the institutional threshold.
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
          <span>Imported {imported} defaults attendance records ({skipped && Number(skipped) > 0 ? `${skipped} skipped` : "0 skipped"}).</span>
        </div>
      )}

      {/* Telemetry Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Eligibility Block Threshold"
          value={`${threshold} Defaults`}
          secondary="Infraction limit before lockout"
          icon="shield"
          highlight="amber"
        />
        <StatCard
          label="Currently Blocked Candidates"
          value={flaggedCount}
          secondary="Candidates at or above cutoff"
          icon="alert-triangle"
          highlight={flaggedCount > 0 ? "amber" : "emerald"}
        />
      </div>

      {/* Threshold Configuration */}
      {isAdmin && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <OpsIcon name="shield" size={14} className="text-amber-400" />
            <span>Institutional Defaults Policy Threshold</span>
          </h2>
          <form action={updateDefaultsThreshold} className="mt-3 flex items-center gap-3">
            <input
              id="defaults_threshold"
              name="defaults_threshold"
              type="number"
              min={0}
              defaultValue={threshold}
              className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-amber-500"
            />
            <span className="text-xs text-slate-400 font-mono">defaults blocks student eligibility</span>
            <button
              type="submit"
              className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition-colors"
            >
              Update Policy
            </button>
          </form>
        </section>
      )}

      {/* CSV Importer */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <OpsIcon name="upload" size={14} className="text-blue-400" />
          <span>Import Activity Attendance CSV</span>
        </h2>
        <form action={importDefaults} className="space-y-3">
          <div>
            <label className="block text-xs font-mono text-slate-400">Target Academic Batch *</label>
            <select
              name="batch_id"
              required
              className="mt-1 w-full max-w-sm rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
            >
              {batchRows.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400">
              CSV Attendance Payload (Columns: <code className="text-amber-300">{EXPECTED_DEFAULTS_COLUMNS}</code>)
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">Activity types: {DEFAULTS_ACTIVITY_TYPES}</p>
            <textarea
              name="csv"
              required
              rows={6}
              spellCheck={false}
              placeholder="roll_no,activity_name,activity_type,attended,category_total&#10;24PGP001,McKinsey PPT,ppt,true,1"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-xs font-bold text-white shadow-sm transition-all"
          >
            Import Compliance Records
          </button>
        </form>
      </section>

      {/* Cohort Compliance Overview */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <OpsIcon name="users" size={16} className="text-amber-400" />
          <span>Student Cohort Compliance Status ({studentRows.length})</span>
        </h2>

        <div className="divide-y divide-slate-800/80 font-mono text-xs">
          {studentRows.map((s) => {
            const total = totalsByStudent.get(s.id) ?? 0;
            const overThreshold = total >= threshold;
            return (
              <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-amber-300">{s.roll_no}</span>
                  <span className="text-white font-sans font-medium">{s.name}</span>
                </div>
                <div>
                  {overThreshold ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-950/90 border border-red-700 px-2.5 py-0.5 font-bold text-red-200 animate-ops-pulse">
                      <OpsIcon name="alert-triangle" size={11} className="text-red-400" />
                      <span>{total} Defaults · Blocked</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-slate-300">
                      <span>{total} Default{total === 1 ? "" : "s"}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
