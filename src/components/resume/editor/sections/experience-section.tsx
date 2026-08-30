"use client";

import { resumeFieldKey } from "@/components/shared/resume-preview";
import { BulletEditor } from "../bullet-editor";
import { EntryHeader } from "../entry-header";
import { SectionHeader } from "../section-header";
import { entryCardClass, inputClass, labelClass } from "../shared";
import type { CvExperienceEntry } from "@/types/domain";

// Shared by both the Experience & Internships and Positions of
// Responsibility sections — they differ only in copy and the field key
// used for `updateExperience(section, ...)` upstream.
export function ExperienceSection({
  section,
  title,
  addLabel,
  entryLabel,
  companyLabel,
  bulletsLabel,
  entries,
  documentId,
  hiddenSections,
  onToggleHidden,
  onAdd,
  onRemove,
  onMove,
  onUpdate,
  registerRef,
  registerDetailsRef,
}: {
  section: "experience" | "positions";
  title: string;
  addLabel: string;
  entryLabel: string;
  companyLabel: string;
  bulletsLabel: string;
  entries: CvExperienceEntry[];
  documentId: string;
  hiddenSections: string[];
  onToggleHidden: (key: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onUpdate: (index: number, patch: Partial<CvExperienceEntry>) => void;
  registerRef: (el: HTMLElement | null) => void;
  registerDetailsRef: (id: string, el: HTMLDetailsElement | null) => void;
}) {
  return (
    <section ref={registerRef}>
      <SectionHeader
        title={title}
        sectionKey={section}
        hiddenSections={hiddenSections}
        onToggleHidden={onToggleHidden}
        onAdd={onAdd}
        addLabel={addLabel}
      />
      {entries.map((entry, index) => (
        <details key={entry.id} ref={(el) => registerDetailsRef(entry.id, el)} className={entryCardClass}>
          <EntryHeader
            title={(section === "experience" ? entry.company : entry.role) || `${entryLabel} #${index + 1}`}
            onMoveUp={index > 0 ? () => onMove(index, -1) : undefined}
            onMoveDown={index < entries.length - 1 ? () => onMove(index, 1) : undefined}
            onRemove={() => onRemove(index)}
          />
          <div className="space-y-3 border-t border-slate-200 p-3">
            <div className="grid gap-3 @lg:grid-cols-3">
              <div>
                <label className={labelClass}>{companyLabel}</label>
                <input
                  data-field={resumeFieldKey({ section, entryId: entry.id, field: "company" })}
                  value={entry.company}
                  onChange={(e) => onUpdate(index, { company: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{section === "experience" ? "Designation / Role" : "Position / Role"}</label>
                <input
                  value={entry.role}
                  onChange={(e) => onUpdate(index, { role: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Duration / Period</label>
                <input
                  data-field={resumeFieldKey({ section, entryId: entry.id, field: "period" })}
                  value={entry.period}
                  onChange={(e) => onUpdate(index, { period: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>{bulletsLabel}</label>
              <BulletEditor
                bullets={entry.bullets}
                documentId={documentId}
                dataFieldBase={resumeFieldKey({ section, entryId: entry.id, field: "bullets" })}
                onChange={(bullets) => onUpdate(index, { bullets })}
              />
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
