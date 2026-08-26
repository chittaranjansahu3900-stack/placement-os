"use client";

import { resumeFieldKey } from "@/components/shared/resume-preview";
import { EntryHeader } from "../entry-header";
import { SectionHeader } from "../section-header";
import { entryCardClass, inputClass, labelClass } from "../shared";
import type { CvAcademicEntry } from "@/types/domain";

export function AcademicsSection({
  academics,
  onAdd,
  onRemove,
  onUpdate,
  registerRef,
  registerDetailsRef,
}: {
  academics: CvAcademicEntry[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<CvAcademicEntry>) => void;
  registerRef: (el: HTMLElement | null) => void;
  registerDetailsRef: (id: string, el: HTMLDetailsElement | null) => void;
}) {
  return (
    <section ref={registerRef}>
      <SectionHeader title="Academic Record Entries" onAdd={onAdd} addLabel="+ Add Row" />
      {academics.map((row, index) => (
        <details key={row.id} ref={(el) => registerDetailsRef(row.id, el)} className={entryCardClass}>
          <EntryHeader
            title={row.institute || row.course || `Record #${index + 1}`}
            onRemove={() => onRemove(index)}
          />
          <div className="grid gap-3 border-t border-[#334155] p-3 @sm:grid-cols-2">
            <div>
              <label className={labelClass}>Degree / Course</label>
              <input
                data-field={resumeFieldKey({ section: "academics", entryId: row.id, field: "course" })}
                value={row.course}
                onChange={(e) => onUpdate(index, { course: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Institute</label>
              <input
                data-field={resumeFieldKey({ section: "academics", entryId: row.id, field: "institute" })}
                value={row.institute}
                onChange={(e) => onUpdate(index, { institute: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Year</label>
              <input
                data-field={resumeFieldKey({ section: "academics", entryId: row.id, field: "year" })}
                value={row.year}
                onChange={(e) => onUpdate(index, { year: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Score / CGPA</label>
              <input
                data-field={resumeFieldKey({ section: "academics", entryId: row.id, field: "result" })}
                value={row.result}
                onChange={(e) => onUpdate(index, { result: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
