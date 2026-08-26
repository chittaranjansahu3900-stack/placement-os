"use client";

import { resumeFieldKey } from "@/components/shared/resume-preview";
import { BulletEditor } from "../bullet-editor";
import { EntryHeader } from "../entry-header";
import { SectionHeader } from "../section-header";
import { entryCardClass, inputClass, labelClass } from "../shared";
import type { CvProjectEntry } from "@/types/domain";

export function ProjectsSection({
  projects,
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
  projects: CvProjectEntry[];
  documentId: string;
  hiddenSections: string[];
  onToggleHidden: (key: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onUpdate: (index: number, patch: Partial<CvProjectEntry>) => void;
  registerRef: (el: HTMLElement | null) => void;
  registerDetailsRef: (id: string, el: HTMLDetailsElement | null) => void;
}) {
  return (
    <section ref={registerRef}>
      <SectionHeader
        title="Key Academic & Industry Projects"
        sectionKey="projects"
        hiddenSections={hiddenSections}
        onToggleHidden={onToggleHidden}
        onAdd={onAdd}
        addLabel="+ Add Project"
      />
      {projects.map((entry, index) => (
        <details key={entry.id} ref={(el) => registerDetailsRef(entry.id, el)} className={entryCardClass}>
          <EntryHeader
            title={entry.name || `Project #${index + 1}`}
            onMoveUp={index > 0 ? () => onMove(index, -1) : undefined}
            onMoveDown={index < projects.length - 1 ? () => onMove(index, 1) : undefined}
            onRemove={() => onRemove(index)}
          />
          <div className="space-y-3 border-t border-[#334155] p-3">
            <div className="grid gap-3 @lg:grid-cols-3">
              <div>
                <label className={labelClass}>Project Name</label>
                <input
                  data-field={resumeFieldKey({ section: "projects", entryId: entry.id, field: "name" })}
                  value={entry.name}
                  onChange={(e) => onUpdate(index, { name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Role / Scope</label>
                <input
                  value={entry.role}
                  onChange={(e) => onUpdate(index, { role: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Duration / Period</label>
                <input
                  data-field={resumeFieldKey({ section: "projects", entryId: entry.id, field: "period" })}
                  value={entry.period}
                  onChange={(e) => onUpdate(index, { period: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Project Bullets</label>
              <BulletEditor
                bullets={entry.bullets}
                documentId={documentId}
                dataFieldBase={resumeFieldKey({ section: "projects", entryId: entry.id, field: "bullets" })}
                onChange={(bullets) => onUpdate(index, { bullets })}
              />
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
