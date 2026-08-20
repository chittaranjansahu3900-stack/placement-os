"use client";

import { useMemo, useState } from "react";
import { importRoster } from "@/app/actions/roster";
import { EXPECTED_ROSTER_COLUMNS } from "@/lib/roster-constants";
import { previewRosterCsv } from "@/lib/roster-csv";
import type { Batch } from "@/types/domain";

export function RosterImportReview({ batches }: { batches: Batch[] }) {
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const preview = useMemo(() => previewRosterCsv(csv), [csv]);

  return (
    <section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <label htmlFor="batch_id" className="block text-sm text-neutral-300">Batch</label>
        <select
          id="batch_id"
          value={batchId}
          onChange={(event) => { setBatchId(event.target.value); setReviewing(false); }}
          required
          className="mt-1 w-full max-w-xs rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
        >
          {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="csv" className="block text-sm text-neutral-300">Roster CSV</label>
        <p className="mt-1 text-xs text-neutral-500">
          Columns: <code className="font-mono">{EXPECTED_ROSTER_COLUMNS}</code>. Quoted commas and reordered header columns are supported.
        </p>
        <textarea
          id="csv"
          value={csv}
          onChange={(event) => { setCsv(event.target.value); setReviewing(false); }}
          required
          rows={10}
          spellCheck={false}
          placeholder={EXPECTED_ROSTER_COLUMNS}
          className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-blue-600"
        />
      </div>

      {!reviewing ? (
        <button
          type="button"
          disabled={!csv.trim() || !batchId}
          onClick={() => setReviewing(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Review import
        </button>
      ) : (
        <div className="space-y-4 border-t border-neutral-800 pt-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-emerald-900 bg-emerald-950 px-3 py-1 text-emerald-300">{preview.validRows.length} ready</span>
            <span className={`rounded-full border px-3 py-1 ${preview.invalidRows.length ? "border-red-900 bg-red-950 text-red-300" : "border-neutral-700 text-neutral-400"}`}>{preview.invalidRows.length} invalid</span>
          </div>

          {preview.fileIssues.map((issue) => <p key={issue} className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{issue}</p>)}

          <div className="max-h-96 overflow-auto rounded-md border border-neutral-800">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-neutral-950 text-neutral-500">
                <tr>
                  {['Row', 'Roll no.', 'Name', 'Section', 'Branch / specialization', 'CGPA', 'Email', 'Validation'].map((heading) => <th key={heading} className="p-2 font-normal">{heading}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {preview.rows.slice(0, 100).map((row) => (
                  <tr key={`${row.row_number}-${row.roll_no}`} className={row.issues.length ? "bg-red-950/20" : ""}>
                    <td className="p-2 text-neutral-600">{row.row_number}</td>
                    <td className="p-2 text-white">{row.roll_no || "—"}</td>
                    <td className="p-2 text-neutral-300">{row.name || "—"}</td>
                    <td className="p-2 text-neutral-400">{row.section ?? "—"}</td>
                    <td className="p-2 text-neutral-400">{row.graduation_details.branch ?? "—"} / {row.pg_details.specialization ?? "—"}</td>
                    <td className="p-2 text-neutral-400">{row.graduation_details.cgpa ?? "—"}</td>
                    <td className="p-2 text-neutral-400">{row.personal_email ?? "—"}</td>
                    <td className={row.issues.length ? "p-2 text-red-300" : "p-2 text-emerald-400"}>{row.issues.length ? row.issues.join("; ") : "Ready"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 100 && <p className="text-xs text-neutral-500">Showing the first 100 of {preview.rows.length} rows.</p>}

          <div className="flex gap-3">
            <button type="button" onClick={() => setReviewing(false)} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Edit CSV</button>
            <form action={importRoster}>
              <input type="hidden" name="batch_id" value={batchId} />
              <input type="hidden" name="csv" value={csv} />
              <input type="hidden" name="review_confirmed" value="true" />
              <button
                type="submit"
                disabled={preview.validRows.length === 0 || preview.fileIssues.length > 0}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm {preview.validRows.length} row{preview.validRows.length === 1 ? "" : "s"}
              </button>
            </form>
          </div>
          <p className="text-xs text-neutral-500">Invalid rows are skipped; re-importing the same batch + roll number updates the existing student.</p>
        </div>
      )}
    </section>
  );
}

