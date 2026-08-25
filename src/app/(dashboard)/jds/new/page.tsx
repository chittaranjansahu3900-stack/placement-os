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
    <div className="max-w-3xl space-y-7">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <Link href="/jds" className="hover:text-white flex items-center gap-1 transition-colors">
            <OpsIcon name="briefcase" size={13} />
            <span>Job Descriptions</span>
          </Link>
          <span>/</span>
          <span className="text-slate-200">Post New JD</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <span>Create Job Description</span>
          <span className="rounded bg-amber-950/80 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300 border border-amber-800/80">
            Draft Lifecycle
          </span>
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          BRD Section 6.1: Define role scope, compensation brackets, batch eligibility filters, and approval workflows.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {companyRows.length === 0 ? (
        <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-8 text-center shadow-sm">
          <p className="text-sm text-slate-300">
            No corporate partners registered on file yet.
          </p>
          <Link
            href="/companies"
            className="ops-button-primary mt-4"
          >
            <OpsIcon name="plus" size={13} />
            <span>Add Company to CRM</span>
          </Link>
        </div>
      ) : (
        <form action={createJd} className="space-y-6">
          {/* Section 1: Partner & Season */}
          <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
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
                  className="ops-select mt-1.5 w-full text-xs font-medium text-white"
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
                  className="ops-select mt-1.5 w-full text-xs font-medium text-white"
                >
                  {batchRows.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} (Active Season)</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Role Details & Compensation */}
          <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
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
                  className="ops-input mt-1.5 w-full text-xs text-white"
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
                  className="ops-input mt-1.5 w-full text-xs text-white"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-1">
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
                  className="ops-input mt-1.5 w-full font-mono text-xs text-white"
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
                  className="ops-input mt-1.5 w-full font-mono text-xs text-white"
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
                  className="ops-input mt-1.5 w-full font-mono text-xs text-white"
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
                className="ops-input mt-1.5 w-full text-xs text-white"
              />
            </div>
          </div>

          {/* Section 3: Batch Eligibility Criteria */}
          <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
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
                  className="ops-input mt-1.5 w-full text-xs text-white"
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
                  className="ops-input mt-1.5 w-full text-xs text-white"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-1">
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
                  className="ops-input mt-1.5 w-full font-mono text-xs text-white"
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
                  className="ops-input mt-1.5 w-full font-mono text-xs text-white"
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
                  className="ops-input mt-1.5 w-full font-mono text-xs text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input id="unplaced_only" name="unplaced_only" type="checkbox" defaultChecked className="size-4 rounded accent-blue-600" />
                <span>Unplaced Candidates Only (One-Offer Policy)</span>
              </label>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded border border-amber-800/60">
                <OpsIcon name="check-shield" size={13} className="text-amber-400" />
                <span>SPC review and release is mandatory before students can view this JD.</span>
              </span>
            </div>
          </div>

          {/* Section 4: Governance Deadline & Document */}
          <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
              <OpsIcon name="clock" size={14} className="text-blue-400" />
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
                className="ops-input mt-1.5 w-full font-mono text-xs text-white"
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
                className="ops-input mt-1.5 block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-200"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/jds"
              className="ops-button-secondary"
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
