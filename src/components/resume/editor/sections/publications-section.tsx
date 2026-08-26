"use client";

import { resumeFieldKey } from "@/components/shared/resume-preview";
import { EntryHeader } from "../entry-header";
import { SectionHeader } from "../section-header";
import { entryCardClass, inputClass, labelClass } from "../shared";
import type { CvPublicationEntry } from "@/types/domain";

export function PublicationsSection({
  publications,
  hiddenSections,
  onToggleHidden,
  onAdd,
  onRemove,
  onUpdate,
  registerRef,
  registerDetailsRef,
}: {
  publications: CvPublicationEntry[];
  hiddenSections: string[];
  onToggleHidden: (key: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<CvPublicationEntry>) => void;
  registerRef: (el: HTMLElement | null) => void;
  registerDetailsRef: (id: string, el: HTMLDetailsElement | null) => void;
}) {
  return (
    <section ref={registerRef}>
      <SectionHeader
        title="Publications"
        sectionKey="publications"
        hiddenSections={hiddenSections}
        onToggleHidden={onToggleHidden}
        onAdd={onAdd}
        addLabel="+ Add"
      />
      {publications.map((row, index) => (
        <details key={row.id} ref={(el) => registerDetailsRef(row.id, el)} className={entryCardClass}>
          <EntryHeader title={row.title || `Publication #${index + 1}`} onRemove={() => onRemove(index)} />
          <div className="grid gap-3 border-t border-[#334155] p-3 @sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Title</label>
              <input
                data-field={resumeFieldKey({ section: "publications", entryId: row.id, field: "title" })}
                value={row.title}
                onChange={(e) => onUpdate(index, { title: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Publisher / Journal</label>
              <input value={row.publisher} onChange={(e) => onUpdate(index, { publisher: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input value={row.date} onChange={(e) => onUpdate(index, { date: e.target.value })} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Link (optional)</label>
              <input value={row.link} onChange={(e) => onUpdate(index, { link: e.target.value })} className={inputClass} />
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
