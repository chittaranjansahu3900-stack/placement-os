import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createJd } from "@/app/actions/jds";
import { OpsIcon } from "@/components/ops-icon";
import type { Company, Batch } from "@/types/domain";

export default async function NewJdPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: companies }, { data: batches }] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    supabase.from("batches").select("*").eq("is_active", true).order("name"),
  ]);

  const companyRows = (companies ?? []) as Company[];
  const batchRows = (batches ?? []) as Batch[];

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <Link href="/jds" className="hover:text-amber-400 flex items-center gap-1 transition-colors">
            <OpsIcon name="briefcase" size={13} />
            <span>Job Descriptions</span>
          </Link>
          <span>/</span>
          <span className="text-slate-200">Post New JD</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <span>Create Job Description</span>
          <span className="rounded-md bg-amber-950 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300 border border-amber-800/60">
            Draft Mode
          </span>
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          BRD Section 6.1: Define role scope, compensation brackets, batch eligibility filters, and approval workflows.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3.5 text-xs text-red-200">
          <OpsIcon name="alert-triangle" size={16} className="text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {companyRows.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <p className="text-sm text-slate-400">
            No corporate partners registered on file yet.
          </p>
          <Link
            href="/companies"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            <OpsIcon name="plus" size={13} />
            <span>Add Company to CRM</span>
          </Link>
        </div>
      ) : (
        <form action={createJd} className="space-y-6">
          {/* Section 1: Partner & Season */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 backdrop-blur-md">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
              <OpsIcon name="building" size={14} className="text-blue-400" />
              <span>Partner &amp; Batch Alignment</span>
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="company_id" className="block text-xs font-medium text-slate-300">
                  Recruiting Partner *
                </label>
                <select
                  id="company_id"
                  name="company_id"
                  required
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                >
                  {companyRows.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="batch_id" className="block text-xs font-medium text-slate-300">
                  Target Academic Batch *
                </label>
                <select
                  id="batch_id"
                  name="batch_id"
                  required
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                >
                  {batchRows.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} (Active Season)</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Role Details & Compensation */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 backdrop-blur-md">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
              <OpsIcon name="briefcase" size={14} className="text-amber-400" />
              <span>Role Title &amp; CTC Structure</span>
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="role_title" className="block text-xs font-medium text-slate-300">
                  Role Title *
                </label>
                <input
                  id="role_title"
                  name="role_title"
                  required
                  placeholder="e.g. Management Trainee / Product Manager"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="grade" className="block text-xs font-medium text-slate-300">
                  Band / Grade (optional)
                </label>
                <input
                  id="grade"
                  name="grade"
                  placeholder="e.g. Associate Director / Band 4"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label htmlFor="ctc_fixed" className="block text-xs font-medium text-slate-300 font-mono">
                  Fixed CTC (LPA)
                </label>
                <input
                  id="ctc_fixed"
                  name="ctc_fixed"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 26.0"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="ctc_variable" className="block text-xs font-medium text-slate-300 font-mono">
                  Variable CTC (LPA)
                </label>
                <input
                  id="ctc_variable"
                  name="ctc_variable"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 8.0"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="ctc_total" className="block text-xs font-medium text-slate-300 font-mono">
                  Total CTC (LPA)
                </label>
                <input
                  id="ctc_total"
                  name="ctc_total"
                  type="number"
                  step="0.01"
                  placeholder="Auto-calculated if blank"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="locations" className="block text-xs font-medium text-slate-300">
                Job Locations (comma-separated)
              </label>
              <input
                id="locations"
                name="locations"
                placeholder="e.g. Mumbai, Bangalore, Gurgaon"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Section 3: Batch Eligibility Criteria */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 backdrop-blur-md">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
              <OpsIcon name="shield" size={14} className="text-emerald-400" />
              <span>Eligibility Engine Criteria</span>
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="eligible_branches" className="block text-xs font-medium text-slate-300">
                  Allowed Branches (comma-separated, blank = all)
                </label>
                <input
                  id="eligible_branches"
                  name="eligible_branches"
                  placeholder="e.g. Finance, Marketing, Operations"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="eligible_specializations" className="block text-xs font-medium text-slate-300">
                  Allowed Specializations (comma-separated, blank = all)
                </label>
                <input
                  id="eligible_specializations"
                  name="eligible_specializations"
                  placeholder="e.g. Consulting, Product Management"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label htmlFor="min_cgpa" className="block text-xs font-medium text-slate-300 font-mono">
                  Minimum CGPA Cutoff
                </label>
                <input
                  id="min_cgpa"
                  name="min_cgpa"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 7.50"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="max_backlog" className="block text-xs font-medium text-slate-300 font-mono">
                  Maximum Active Backlogs
                </label>
                <input
                  id="max_backlog"
                  name="max_backlog"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="open_positions" className="block text-xs font-medium text-slate-300 font-mono">
                  Expected Open Positions
                </label>
                <input
                  id="open_positions"
                  name="open_positions"
                  type="number"
                  min={1}
                  placeholder="e.g. 4"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input id="unplaced_only" name="unplaced_only" type="checkbox" defaultChecked className="size-4 rounded accent-blue-600" />
                <span>Unplaced Candidates Only (One-Offer Policy)</span>
              </label>
              <span className="inline-flex items-center gap-2 text-xs text-amber-300">
                <OpsIcon name="check-shield" size={14} />
                <span>SPC review and release is mandatory before students can view this JD.</span>
              </span>
            </div>
          </div>

          {/* Section 4: Governance Deadline & Document */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 backdrop-blur-md">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
              <OpsIcon name="clock" size={14} className="text-purple-400" />
              <span>Application Timeline &amp; Original PDF</span>
            </h2>
            <div>
              <label htmlFor="apply_by_deadline" className="block text-xs font-medium text-slate-300">
                Application Deadline *
              </label>
              <input
                id="apply_by_deadline"
                name="apply_by_deadline"
                type="datetime-local"
                required
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="jd_attachment" className="block text-xs font-medium text-slate-300">
                Official JD Attachment (PDF / DOCX)
              </label>
              <input
                id="jd_attachment"
                name="jd_attachment"
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="mt-1.5 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-200"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/jds"
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="ops-button-primary px-6"
            >
              <OpsIcon name="check" size={14} />
              <span>Save &amp; Create Draft JD</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
