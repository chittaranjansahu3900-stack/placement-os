"use client";

import { useEffect, useState } from "react";
import { OpsIcon } from "@/components/ops-icon";

type BulkAction = (formData: FormData) => void | Promise<void>;

export function BulkApplicantActions({ action }: { action: BulkAction }) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const checked = document.querySelectorAll<HTMLInputElement>(
        'input[name="application_ids"][form="bulk-applicant-actions"]:checked'
      );
      setSelectedCount(checked.length);
    };

    document.addEventListener("change", updateCount);
    updateCount();
    return () => document.removeEventListener("change", updateCount);
  }, []);

  function clearSelection() {
    document
      .querySelectorAll<HTMLInputElement>('input[name="application_ids"][form="bulk-applicant-actions"]:checked')
      .forEach((checkbox) => {
        checkbox.checked = false;
      });
    setSelectedCount(0);
  }

  return (
    <form
      id="bulk-applicant-actions"
      action={action}
      aria-hidden={selectedCount === 0}
      className={`sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 border border-blue-600 bg-[#0d1928] p-3 transition-[opacity,transform] ${
        selectedCount > 0
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-blue-300">
          <OpsIcon name="check-shield" size={15} />
          <span>{selectedCount} selected</span>
        </span>
        <span className="h-5 w-px bg-slate-700" aria-hidden />
        <label className="sr-only" htmlFor="bulk-status">Bulk status</label>
        <select id="bulk-status" name="status" required className="ops-input px-3 text-xs">
          <option value="shortlisted">Shortlist selected</option>
          <option value="waitlisted">Waitlist selected</option>
          <option value="rejected">Reject selected</option>
        </select>
        <label className="sr-only" htmlFor="bulk-round-label">Round label</label>
        <input
          id="bulk-round-label"
          name="round_label"
          maxLength={100}
          placeholder="Round tag (optional)"
          className="ops-input w-52 px-3 text-xs placeholder:text-slate-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={clearSelection} className="ops-button-secondary">
          Clear
        </button>
        <button type="submit" className="ops-button-primary">
          <OpsIcon name="check" size={14} />
          Apply status
        </button>
      </div>
    </form>
  );
}
