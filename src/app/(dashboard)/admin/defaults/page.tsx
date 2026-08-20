import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { importDefaults, updateDefaultsThreshold } from "@/app/actions/defaults";
import { EXPECTED_DEFAULTS_COLUMNS, DEFAULTS_ACTIVITY_TYPES } from "@/lib/defaults-constants";
import type { Batch, Student } from "@/types/domain";

// Section 4.6 — Defaults & Compliance Tracker (Admin side). FR-6.3 import +
// FR-6.2 threshold config.
export default async function AdminDefaultsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; skipped?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");

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

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">Defaults Tracker</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Section 4.6 — attendance/compliance shortfalls that can block placement eligibility.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {imported && (
        <p className="rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          Imported {imported} record(s){skipped && Number(skipped) > 0 ? `, skipped ${skipped}` : ""}.
        </p>
      )}

      <form action={updateDefaultsThreshold} className="space-y-2">
        <label htmlFor="defaults_threshold" className="block text-sm text-neutral-300">
          Defaults threshold (blocks JD eligibility at or above this count)
        </label>
        <div className="flex gap-2">
          <input
            id="defaults_threshold"
            name="defaults_threshold"
            type="number"
            min={0}
            defaultValue={settings?.defaults_threshold ?? 4}
            className="w-24 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </form>

      <form action={importDefaults} className="space-y-3">
        <div>
          <label htmlFor="batch_id" className="block text-sm text-neutral-300">
            Batch
          </label>
          <select
            id="batch_id"
            name="batch_id"
            required
            className="mt-1 w-full max-w-xs rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
          >
            {batchRows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="csv" className="block text-sm text-neutral-300">
            Defaults CSV
          </label>
          <p className="mt-1 text-xs text-neutral-500">
            Columns: <code className="font-mono">{EXPECTED_DEFAULTS_COLUMNS}</code> —
            activity_type must be one of {DEFAULTS_ACTIVITY_TYPES}; re-importing the same
            roll_no + activity_name updates that row.
          </p>
          <textarea
            id="csv"
            name="csv"
            required
            rows={8}
            spellCheck={false}
            placeholder="roll_no,activity_name,activity_type,attended,category_total"
            className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-600"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Import
        </button>
      </form>

      <div>
        <h2 className="text-sm font-semibold text-white">Students ({studentRows.length} shown)</h2>
        <ul className="mt-3 divide-y divide-neutral-800">
          {studentRows.map((s) => {
            const total = totalsByStudent.get(s.id) ?? 0;
            const overThreshold = total >= (settings?.defaults_threshold ?? Infinity);
            return (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="text-white">{s.roll_no}</span>{" "}
                  <span className="text-neutral-400">{s.name}</span>
                </span>
                <span className={overThreshold ? "text-red-400" : "text-neutral-400"}>
                  {total} default{total === 1 ? "" : "s"}
                </span>
              </li>
            );
          })}
          {studentRows.length === 0 && (
            <p className="py-6 text-sm text-neutral-500">No students imported yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
