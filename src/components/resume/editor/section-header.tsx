"use client";

import { OpsIcon } from "@/components/shared/ops-icon";
import { addButtonClass } from "./shared";

export function SectionHeader({
  title, sectionKey, hiddenSections, onToggleHidden, onAdd, addLabel,
}: {
  title: string;
  sectionKey?: string;
  hiddenSections?: string[];
  onToggleHidden?: (key: string) => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const isHidden = sectionKey ? (hiddenSections ?? []).includes(sectionKey) : false;
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">{title}</h2>
        {sectionKey && onToggleHidden && (
          <button
            type="button"
            onClick={() => onToggleHidden(sectionKey)}
            title={isHidden ? "Hidden from CV — click to show" : "Shown on CV — click to hide"}
            className={isHidden ? "text-slate-400 hover:text-slate-600" : "text-emerald-600 hover:text-emerald-500"}
          >
            <OpsIcon name={isHidden ? "eye-off" : "eye"} size={13} />
          </button>
        )}
      </div>
      {onAdd && addLabel && (
        <button type="button" onClick={onAdd} className={addButtonClass}>{addLabel}</button>
      )}
    </div>
  );
}
