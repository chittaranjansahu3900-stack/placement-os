"use client";

import { useMemo, useState } from "react";
import { importRoster } from "@/app/actions/roster";
import { EXPECTED_ROSTER_COLUMNS } from "@/lib/roster-constants";
import { previewRosterCsv } from "@/lib/roster-csv";
import { OpsIcon } from "@/components/ops-icon";
import type { Batch } from "@/types/domain";

export function RosterImportReview({ batches }: { batches: Batch[] }) {
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const preview = useMemo(() => previewRosterCsv(csv), [csv]);

  return (
    <section className="space-y-4 rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <OpsIcon name="upload" size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Student Master Profile Sheet Import</h2>
      </div>

      <div>
        <label htmlFor="batch_id" className="block text-xs font-semibold text-slate-300">
          Target Placement Cohort / Batch
        </label>
        <select
          id="batch_id"
          value={batchId}
          onChange={(event) => { setBatchId(event.target.value); setReviewing(false); }}
          required
          className="ops-select mt-1.5 w-full max-w-sm text-xs font-medium text-white"
        >
          {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="csv" className="block text-xs font-semibold text-slate-300">
          Roster CSV Content
        </label>
        <p className="mt-1 font-mono text-[11px] text-slate-400">
          Canonical columns: <code className="break-all rounded bg-slate-950 px-1 py-0.5 text-blue-300">{EXPECTED_ROSTER_COLUMNS}</code>
        </p>
        <textarea
          id="csv"
          value={csv}
          onChange={(event) => { setCsv(event.target.value); setReviewing(false); }}
          required
          rows={8}
          spellCheck={false}
          placeholder={EXPECTED_ROSTER_COLUMNS}
          className="ops-input mt-2 w-full font-mono text-xs text-white"
        />
      </div>

      {!reviewing ? (
        <button
          type="button"
          disabled={!csv.trim() || !batchId}
          onClick={() => setReviewing(true)}
          className="ops-button-primary text-xs"
        >
          <OpsIcon name="file-text" size={13} />
          Review Import &amp; Validate Records
        </button>
      ) : (
        <div className="space-y-4 border-t border-slate-800 pt-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-emerald-800/80 bg-emerald-950/80 px-2.5 py-1 font-mono font-semibold text-emerald-300">
              {preview.validRows.length} Valid Records Ready
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

          <div className="max-h-96 overflow-auto rounded-md border border-slate-750">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-950 text-slate-400 font-mono text-[10px] uppercase">
                <tr>
                  {['Row', 'Seq.', 'Roll no.', 'Name', 'Section', 'Branch / specialization', 'CGPA', 'Profile sections', 'Email', 'Validation'].map((heading) => (
                    <th key={heading} className="p-2.5 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                {preview.rows.slice(0, 100).map((row) => (
                  <tr key={`${row.row_number}-${row.roll_no}`} className={row.issues.length ? "bg-red-950/30" : ""}>
                    <td className="p-2.5 font-mono text-slate-500">{row.row_number}</td>
                    <td className="p-2.5 font-mono text-slate-400">{row.display_seq ?? "—"}</td>
                    <td className="p-2.5 font-mono font-medium text-white">{row.roll_no || "—"}</td>
                    <td className="p-2.5 font-medium text-slate-200">{row.name || "—"}</td>
                    <td className="p-2.5 text-slate-300">{row.section ?? "—"}</td>
                    <td className="p-2.5 text-slate-300">{row.graduation_details.branch ?? "—"} / {row.pg_details.specialization ?? "—"}</td>
                    <td className="p-2.5 font-mono text-slate-300">{row.graduation_details.cgpa ?? "—"}</td>
                    <td className="p-2.5 text-slate-400">{row.prior_employers.length} employer(s) · {row.credentials.length} items</td>
                    <td className="p-2.5 font-mono text-slate-400">{row.personal_email ?? "—"}</td>
                    <td className={`p-2.5 font-mono ${row.issues.length ? "text-red-300" : "text-emerald-400"}`}>
                      {row.issues.length ? row.issues.join("; ") : "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 100 && (
            <p className="font-mono text-xs text-slate-400">Showing the first 100 of {preview.rows.length} rows.</p>
          )}

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setReviewing(false)} className="ops-button-secondary text-xs">
              Edit CSV
            </button>
            <form action={importRoster}>
              <input type="hidden" name="batch_id" value={batchId} />
              <input type="hidden" name="csv" value={csv} />
              <input type="hidden" name="review_confirmed" value="true" />
              <button
                type="submit"
                disabled={preview.validRows.length === 0 || preview.fileIssues.length > 0}
                className="ops-button-primary text-xs"
              >
                <OpsIcon name="check" size={13} />
                Import {preview.validRows.length} Valid Student Record{preview.validRows.length === 1 ? "" : "s"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
