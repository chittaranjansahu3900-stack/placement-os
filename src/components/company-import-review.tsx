"use client";

import { useMemo, useState } from "react";
import { importCompanies } from "@/app/actions/companies";
import { COMPANY_IMPORT_COLUMNS, previewCompanyCsv } from "@/lib/company-csv";

export function CompanyImportReview() {
  const [csv, setCsv] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const preview = useMemo(() => previewCompanyCsv(csv), [csv]);

  return (
    <details className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <summary className="cursor-pointer text-sm font-medium text-white">Import target-company CSV</summary>
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="company_csv" className="block text-sm text-neutral-300">Company CSV</label>
          <p className="mt-1 text-xs text-neutral-500">
            Columns: <code className="font-mono">{COMPANY_IMPORT_COLUMNS.join(",")}</code>. Stage defaults to prospect; quoted commas and reordered headers are supported.
          </p>
          <textarea
            id="company_csv"
            value={csv}
            onChange={(event) => { setCsv(event.target.value); setReviewing(false); }}
            rows={8}
            spellCheck={false}
            placeholder={COMPANY_IMPORT_COLUMNS.join(",")}
            className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-600"
          />
        </div>

        {!reviewing ? (
          <button type="button" disabled={!csv.trim()} onClick={() => setReviewing(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40">Review import</button>
        ) : (
          <div className="space-y-4 border-t border-neutral-800 pt-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full border border-emerald-900 bg-emerald-950 px-3 py-1 text-emerald-300">{preview.validRows.length} ready</span>
              <span className={`rounded-full border px-3 py-1 ${preview.invalidRows.length ? "border-red-900 bg-red-950 text-red-300" : "border-neutral-700 text-neutral-400"}`}>{preview.invalidRows.length} invalid</span>
            </div>
            {preview.fileIssues.map((issue) => <p key={issue} className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{issue}</p>)}
            <div className="max-h-80 overflow-auto rounded-md border border-neutral-800">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="sticky top-0 bg-neutral-950 text-neutral-500"><tr>{["Row", "Company", "Sector", "Stage", "Validation"].map((heading) => <th key={heading} className="p-2 font-normal">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-neutral-800">
                  {preview.rows.slice(0, 100).map((row) => (
                    <tr key={`${row.row_number}-${row.name}`} className={row.issues.length ? "bg-red-950/20" : ""}>
                      <td className="p-2 text-neutral-600">{row.row_number}</td><td className="p-2 text-white">{row.name || "—"}</td><td className="p-2 text-neutral-400">{row.sector ?? "—"}</td><td className="p-2 capitalize text-neutral-400">{row.pipeline_stage}</td><td className={row.issues.length ? "p-2 text-red-300" : "p-2 text-emerald-400"}>{row.issues.length ? row.issues.join("; ") : "Ready"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setReviewing(false)} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Edit CSV</button>
              <form action={importCompanies}>
                <input type="hidden" name="csv" value={csv} />
                <input type="hidden" name="review_confirmed" value="true" />
                <button type="submit" disabled={preview.validRows.length === 0 || preview.fileIssues.length > 0} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">Confirm {preview.validRows.length} row{preview.validRows.length === 1 ? "" : "s"}</button>
              </form>
            </div>
            <p className="text-xs text-neutral-500">Invalid rows and company names already present in this institute are skipped.</p>
          </div>
        )}
      </div>
    </details>
  );
}
