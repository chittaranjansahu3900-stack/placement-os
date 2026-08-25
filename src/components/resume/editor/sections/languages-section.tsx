"use client";

import { resumeFieldKey } from "@/components/shared/resume-preview";
import { OpsIcon } from "@/components/shared/ops-icon";
import { SectionHeader } from "../section-header";
import { inputClass } from "../shared";
import type { CvLanguageEntry } from "@/types/domain";

export function LanguagesSection({
  languages,
  hiddenSections,
  onToggleHidden,
  onAdd,
  onRemove,
  onUpdate,
  registerRef,
}: {
  languages: CvLanguageEntry[];
  hiddenSections: string[];
  onToggleHidden: (key: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<CvLanguageEntry>) => void;
  registerRef: (el: HTMLElement | null) => void;
}) {
  return (
    <section ref={registerRef}>
      <SectionHeader
        title="Languages"
        sectionKey="languages"
        hiddenSections={hiddenSections}
        onToggleHidden={onToggleHidden}
        onAdd={onAdd}
        addLabel="+ Add"
      />
      <div className="space-y-2">
        {languages.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2 rounded-lg border border-[#334155] bg-[#1e293b] p-2.5">
            <input
              data-field={index === 0 ? resumeFieldKey({ section: "languages", field: "languages" }) : undefined}
              value={row.name}
              onChange={(e) => onUpdate(index, { name: e.target.value })}
              placeholder="Language"
              className={inputClass}
            />
            <select
              value={row.level}
              onChange={(e) => onUpdate(index, { level: e.target.value })}
              className="w-36 shrink-0 rounded-lg border border-[#334155] bg-[#0f172a] px-2 py-1.5 text-[13px] text-slate-200"
            >
              <option value="">Level</option>
              <option>Basic</option>
              <option>Conversational</option>
              <option>Fluent</option>
              <option>Native</option>
            </select>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="shrink-0 text-[#ef4444] hover:text-red-300"
            >
              <OpsIcon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
