"use client";

import { resumeFieldKey } from "@/components/shared/resume-preview";
import { BulletEditor } from "../bullet-editor";
import { EntryHeader } from "../entry-header";
import { SectionHeader } from "../section-header";
import { entryCardClass, inputClass, labelClass } from "../shared";
import type { CvCustomSection } from "@/types/domain";

export function CustomSectionsSection({
  customSections,
  documentId,
  hiddenSections,
  onToggleHidden,
  onAdd,
  onRemove,
  onUpdate,
  registerRef,
  registerDetailsRef,
}: {
  customSections: CvCustomSection[];
  documentId: string;
  hiddenSections: string[];
  onToggleHidden: (key: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<CvCustomSection>) => void;
  registerRef: (el: HTMLElement | null) => void;
  registerDetailsRef: (id: string, el: HTMLDetailsElement | null) => void;
}) {
  return (
    <section ref={registerRef}>
      <SectionHeader
        title="Custom Sections"
        sectionKey="customSections"
        hiddenSections={hiddenSections}
        onToggleHidden={onToggleHidden}
        onAdd={onAdd}
        addLabel="+ Add Section"
      />
      {customSections.map((section, index) => (
        <details key={section.id} ref={(el) => registerDetailsRef(section.id, el)} className={entryCardClass}>
          <EntryHeader
            title={section.title || `Custom Section #${index + 1}`}
            onRemove={() => onRemove(index)}
          />
          <div className="space-y-3 border-t border-slate-200 p-3">
            <div>
              <label className={labelClass}>Section Title</label>
              <input
                value={section.title}
                onChange={(e) => onUpdate(index, { title: e.target.value })}
                placeholder="e.g. Volunteering"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Items</label>
              <BulletEditor
                bullets={section.items}
                documentId={documentId}
                dataFieldBase={resumeFieldKey({ section: "customSections", entryId: section.id, field: "items" })}
                onChange={(items) => onUpdate(index, { items })}
              />
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
