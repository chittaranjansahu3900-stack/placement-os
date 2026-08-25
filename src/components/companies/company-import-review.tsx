"use client";

import { useMemo, useState } from "react";
import { importCompanies } from "@/app/actions/companies";
import { COMPANY_IMPORT_COLUMNS, previewCompanyCsv } from "@/lib/company-csv";
import { OpsIcon } from "@/components/shared/ops-icon";

export function CompanyImportReview() {
  const [csv, setCsv] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const preview = useMemo(() => previewCompanyCsv(csv), [csv]);

  return (
    <details className="group rounded-lg border border-slate-750 bg-slate-900/90 p-4 shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between font-mono text-xs font-semibold uppercase tracking-wider text-slate-200 hover:text-white">
        <span className="flex items-center gap-2">
          <OpsIcon name="upload" size={14} className="text-blue-400" />
          <span>Import Target-Company CSV</span>
        </span>
        <OpsIcon name="chevron-down" size={14} className="text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
        <div>
          <label htmlFor="company_csv" className="block text-xs font-medium text-slate-300">
            Company CSV Payload
          </label>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Columns: <code className="rounded bg-slate-950 px-1 py-0.5 text-blue-300">{COMPANY_IMPORT_COLUMNS.join(",")}</code>. Stage defaults to prospect.
          </p>
          <textarea
            id="company_csv"
            value={csv}
            onChange={(event) => { setCsv(event.target.value); setReviewing(false); }}
            rows={6}
            spellCheck={false}
            placeholder={COMPANY_IMPORT_COLUMNS.join(",")}
            className="ops-input mt-2 w-full font-mono text-xs text-white"
          />
        </div>

        {!reviewing ? (
          <button
            type="button"
            disabled={!csv.trim()}
            onClick={() => setReviewing(true)}
            className="ops-button-primary text-xs"
          >
            <OpsIcon name="file-text" size={13} />
            Review Import Payload
          </button>
        ) : (
          <div className="space-y-4 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded border border-emerald-800/80 bg-emerald-950/80 px-2.5 py-1 font-mono font-semibold text-emerald-300">
                {preview.validRows.length} Valid Ready
              </span>
              <span
                className={`rounded border px-2.5 py-1 font-mono font-semibold ${
                  preview.invalidRows.length
                    ? "border-red-800/80 bg-red-950/80 text-red-300"
                    : "border-slate-700 bg-slate-800/80 text-slate-400"
                }`}
              >
                {preview.invalidRows.length} Invalid
              </span>
            </div>
            {preview.fileIssues.map((issue) => (
              <p key={issue} className="rounded-md border border-red-800/80 bg-red-950/70 p-3 text-xs text-red-200">
                {issue}
              </p>
            ))}
            <div className="max-h-72 overflow-auto rounded-md border border-slate-750">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-950 text-slate-400 font-mono text-[10px] uppercase">
                  <tr>
                    {["Row", "Company", "Sector", "Stage", "Validation"].map((heading) => (
                      <th key={heading} className="p-2.5 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                  {preview.rows.slice(0, 100).map((row) => (
                    <tr key={`${row.row_number}-${row.name}`} className={row.issues.length ? "bg-red-950/30" : ""}>
                      <td className="p-2.5 font-mono text-slate-500">{row.row_number}</td>
                      <td className="p-2.5 font-medium text-white">{row.name || "—"}</td>
                      <td className="p-2.5 text-slate-300">{row.sector ?? "—"}</td>
                      <td className="p-2.5 capitalize text-slate-300">{row.pipeline_stage}</td>
                      <td className={`p-2.5 font-mono ${row.issues.length ? "text-red-300" : "text-emerald-400"}`}>
                        {row.issues.length ? row.issues.join("; ") : "Ready"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setReviewing(false)} className="ops-button-secondary text-xs">
                Edit CSV
              </button>
              <form action={importCompanies}>
                <input type="hidden" name="csv" value={csv} />
                <input type="hidden" name="review_confirmed" value="true" />
                <button
                  type="submit"
                  disabled={preview.validRows.length === 0 || preview.fileIssues.length > 0}
                  className="ops-button-primary text-xs"
                >
                  <OpsIcon name="check" size={13} />
                  Confirm &amp; Import {preview.validRows.length} Row{preview.validRows.length === 1 ? "" : "s"}
                </button>
              </form>
            </div>
            <p className="font-mono text-[11px] text-slate-400">
              Invalid rows and company names already present in this institute will be skipped.
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
