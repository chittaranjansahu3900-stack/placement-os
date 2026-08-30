"use client";

import { useEffect, useState } from "react";
import { OpsIcon } from "@/components/shared/ops-icon";

type BulkAction = (formData: FormData) => void | Promise<void>;

export function SelectAllApplicantsCheckbox() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const updateMaster = () => {
      const allCheckboxes = document.querySelectorAll<HTMLInputElement>(
        'input[name="application_ids"][form="bulk-applicant-actions"]'
      );
      const checkedCheckboxes = document.querySelectorAll<HTMLInputElement>(
        'input[name="application_ids"][form="bulk-applicant-actions"]:checked'
      );
      setChecked(allCheckboxes.length > 0 && allCheckboxes.length === checkedCheckboxes.length);
    };

    document.addEventListener("change", updateMaster);
    updateMaster();
    return () => document.removeEventListener("change", updateMaster);
  }, []);

  function toggleAll(event: React.ChangeEvent<HTMLInputElement>) {
    const targetChecked = event.target.checked;
    setChecked(targetChecked);
    const allCheckboxes = document.querySelectorAll<HTMLInputElement>(
      'input[name="application_ids"][form="bulk-applicant-actions"]'
    );
    allCheckboxes.forEach((checkbox) => {
      checkbox.checked = targetChecked;
    });
    // Dispatch change event to notify BulkApplicantActions
    document.dispatchEvent(new Event("change"));
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={toggleAll}
      aria-label="Select all applicants"
      title="Select all applicants"
      className="size-4 rounded border-slate-700 bg-slate-950 text-blue-600 accent-blue-600 focus:ring-blue-500/20 cursor-pointer"
    />
  );
}

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
    document.dispatchEvent(new Event("change"));
    setSelectedCount(0);
  }

  return (
    <form
      id="bulk-applicant-actions"
      action={action}
      aria-hidden={selectedCount === 0}
      className={`sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-500/70 bg-[#0d1627] p-3.5 shadow-xl transition-all duration-200 ${
        selectedCount > 0
          ? "translate-y-0 opacity-100 ring-1 ring-blue-500/30"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 rounded bg-blue-950/90 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-blue-300 border border-blue-800/80">
          <OpsIcon name="check-shield" size={14} className="text-blue-400" />
          <span>{selectedCount} selected</span>
        </span>
        <span className="h-5 w-px bg-slate-750" aria-hidden />
        <label className="sr-only" htmlFor="bulk-status">Bulk status</label>
        <select id="bulk-status" name="status" required className="ops-select text-xs">
          <option value="shortlisted">Shortlist selected</option>
          <option value="waitlisted">Waitlist selected</option>
          <option value="rejected">Reject selected</option>
        </select>
        <label className="sr-only" htmlFor="bulk-round-label">Round label</label>
        <input
          id="bulk-round-label"
          name="round_label"
          maxLength={100}
          placeholder="Round tag (e.g. Round 1 / Tech)"
          className="ops-input w-56 text-xs placeholder:text-slate-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={clearSelection} className="ops-button-secondary text-xs">
          Clear
        </button>
        <button type="submit" className="ops-button-primary text-xs">
          <OpsIcon name="check" size={13} />
          Apply status
        </button>
      </div>
    </form>
  );
}
