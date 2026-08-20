import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCompany } from "@/app/actions/companies";
import { CompanyImportReview } from "@/components/company-import-review";
import type { Company, PipelineStage } from "@/types/domain";

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "prospect", label: "Prospect" },
  { key: "contacted", label: "Contacted" },
  { key: "interested", label: "Interested" },
  { key: "committed", label: "Committed" },
  { key: "onboarded", label: "Onboarded" },
];

// FR-8.1: Company pipeline Kanban (Prospect → Contacted → Interested →
// Committed → Onboarded). Stage changes, contacts, and outreach logging
// happen on the company detail page (/companies/[id]) — this is the board view.
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; skipped?: string }>;
}) {
  const { error, imported, skipped } = await searchParams;
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = (companies ?? []) as Company[];
  const byStage = new Map<PipelineStage, Company[]>(STAGES.map((s) => [s.key, []]));
  for (const c of rows) {
    byStage.get(c.pipeline_stage)?.push(c);
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-white">Company Pipeline</h1>
      <p className="mt-1 text-sm text-neutral-400">Section 4.8 — pre-season outreach CRM.</p>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {imported != null && (
        <p className="mt-4 rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          Imported {imported} compan{Number(imported) === 1 ? "y" : "ies"}; skipped {skipped ?? 0} invalid or existing row{Number(skipped) === 1 ? "" : "s"}.
        </p>
      )}

      <form action={createCompany} className="mt-6 flex gap-2">
        <input
          name="name"
          placeholder="Company name"
          required
          className="flex-1 max-w-xs rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
        />
        <input
          name="sector"
          placeholder="Sector (optional)"
          className="w-40 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Add
        </button>
      </form>

      <CompanyImportReview />

      <div className="mt-6 grid grid-cols-5 gap-3 overflow-x-auto">
        {STAGES.map((stage) => (
          <div key={stage.key} className="min-w-[180px]">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              {stage.label} ({byStage.get(stage.key)?.length ?? 0})
            </p>
            <div className="space-y-2">
              {(byStage.get(stage.key) ?? []).map((c) => (
                <Link
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="block rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-600"
                >
                  <p className="text-sm text-white">{c.name}</p>
                  <p className="text-xs text-neutral-500">{c.sector ?? "—"}</p>
                  {c.jd_form_received && (
                    <span className="mt-1 inline-block rounded-full bg-emerald-950 px-1.5 py-0.5 text-[10px] text-emerald-300">
                      JD form received
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
