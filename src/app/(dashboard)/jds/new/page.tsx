import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createJd } from "@/app/actions/jds";
import type { Company, Batch } from "@/types/domain";

// Wireframe reference: BRD Section 6.1 "Recruiter — JD Creation".
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
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-white">New Job Description</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Saved as a draft first (FR-1.3) — publish from the JD page once it looks right.
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {companyRows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          No company on file yet — add one on the{" "}
          <Link href="/companies" className="text-blue-400 hover:underline">
            Companies
          </Link>{" "}
          page first.
        </p>
      ) : (
        <form action={createJd} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="company_id" className="block text-sm text-neutral-300">
                Company
              </label>
              <select
                id="company_id"
                name="company_id"
                required
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              >
                {companyRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="batch_id" className="block text-sm text-neutral-300">
                Eligible batch
              </label>
              <select
                id="batch_id"
                name="batch_id"
                required
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              >
                {batchRows.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="role_title" className="block text-sm text-neutral-300">
                Role title
              </label>
              <input
                id="role_title"
                name="role_title"
                required
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="grade" className="block text-sm text-neutral-300">
                Grade / band (optional)
              </label>
              <input
                id="grade"
                name="grade"
                placeholder="F3 / F4"
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="ctc_fixed" className="block text-sm text-neutral-300">
                CTC (Fixed, LPA)
              </label>
              <input
                id="ctc_fixed"
                name="ctc_fixed"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="ctc_variable" className="block text-sm text-neutral-300">
                CTC (Variable, LPA)
              </label>
              <input
                id="ctc_variable"
                name="ctc_variable"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="ctc_total" className="block text-sm text-neutral-300">
                CTC (Total, optional)
              </label>
              <input
                id="ctc_total"
                name="ctc_total"
                type="number"
                step="0.01"
                placeholder="Fixed + Variable if blank"
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="locations" className="block text-sm text-neutral-300">
              Locations (comma-separated)
            </label>
            <input
              id="locations"
              name="locations"
              placeholder="Chennai, Bangalore"
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="eligible_branches" className="block text-sm text-neutral-300">
                Eligible branches (comma-separated, blank = all)
              </label>
              <input
                id="eligible_branches"
                name="eligible_branches"
                placeholder="Finance, Marketing"
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="eligible_specializations" className="block text-sm text-neutral-300">
                Eligible specializations (comma-separated, blank = all)
              </label>
              <input
                id="eligible_specializations"
                name="eligible_specializations"
                placeholder="Consulting, Product"
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="min_cgpa" className="block text-sm text-neutral-300">
                Minimum CGPA (optional)
              </label>
              <input
                id="min_cgpa"
                name="min_cgpa"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="max_backlog" className="block text-sm text-neutral-300">
                Max backlogs (optional)
              </label>
              <input
                id="max_backlog"
                name="max_backlog"
                type="number"
                min={0}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="open_positions" className="block text-sm text-neutral-300">
                Open positions (optional)
              </label>
              <input
                id="open_positions"
                name="open_positions"
                type="number"
                min={0}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="unplaced_only" name="unplaced_only" type="checkbox" defaultChecked />
            <label htmlFor="unplaced_only" className="text-sm text-neutral-300">
              Unplaced students only
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input id="admin_approval_required" name="admin_approval_required" type="checkbox" />
            <label htmlFor="admin_approval_required" className="text-sm text-neutral-300">
              Requires Admin approval before publishing
            </label>
          </div>

          <div>
            <label htmlFor="apply_by_deadline" className="block text-sm text-neutral-300">
              Apply-by deadline
            </label>
            <input
              id="apply_by_deadline"
              name="apply_by_deadline"
              type="datetime-local"
              required
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Save Draft
          </button>
        </form>
      )}
    </div>
  );
}
